// oneShot.js
const Router = require("koa-router");
const crypto = require("crypto");
const { spawn } = require("child_process");
const path = require("path");
const { selectSeasonImages } = require("./reelAssets");

// --- auth guard (adapt to your session) ---
function requireAuth(ctx, next) {
  if (!ctx.session?.userId) {
    ctx.status = 401;
    ctx.body = { error: "unauthorized" };
    return;
  }
  return next();
}

// token -> { ownerId, exp, used, buildArgs }
const TOKENS = new Map();
function makeToken() { return crypto.randomBytes(24).toString("base64url"); }

// Build a streaming ffmpeg process from in-memory image list + audio
function buildReelStream({ images, audioPath, perImageSec = 2.5, fps = 30, outW = 1080, outH = 1920, fadeSec = 0.5 }) {
  // Prepare dynamic -i inputs for each image (+ one for audio)
  // Use "file:" prefix so ffmpeg treats colons in filenames safely.
  const imgInputs = images.flatMap(img => ["-loop","1","-t", String(perImageSec), "-i", `file:${img}`]);

  // Concat N images -> single video with crossfades
  // Streamlined approach: scale/pad each to 1080x1920, then xfade across clips.
  // We name each image stream [v0],[v1]...
  const filters = [];
  const streams = [];

  for (let i = 0; i < images.length; i++) {
    const label = `v${i}`;
    // Scale + pad (center, letterbox)
    filters.push(
      `[${i}:v]scale=w=${outW}:h=${outH}:force_original_aspect_ratio=decrease,` +
      `pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${fps}[${label}]`
    );
    streams.push(`[${label}]`);
  }

  // Chain xfade between consecutive streams
  // xfade takes two inputs; we fold them left -> (((v0 xf v1) xf v2) xf v3)...
  let last = streams[0];
  let t = 0;
  const xfadeDur = fadeSec;
  const segDur = perImageSec;
  for (let i = 1; i < streams.length; i++) {
    const out = `x${i}`;
    // place fade near the end of the current segment
    const offset = Math.max(0, segDur - xfadeDur);
    filters.push(`${last}${streams[i]}xfade=transition=fade:duration=${xfadeDur}:offset=${t + offset}[${out}]`);
    last = `[${out}]`;
    t += segDur - xfadeDur; // overlap by fade duration
  }

  // Audio input index is images.length
  const audioInputIndex = images.length;
  const audioArgs = audioPath ? ["-i", `file:${audioPath}`] : [];
  const audioMap = audioPath ? ["-map", last, "-map", `${audioInputIndex}:a:0?`] : ["-map", last];

  const ffArgs = [
    // image inputs
    ...imgInputs,
    // audio (optional)
    ...audioArgs,
    // filters
    "-filter_complex", filters.join(";"),
    // output opts
    "-shortest",
    "-c:v","libx264","-pix_fmt","yuv420p","-preset","veryfast","-crf","20",
    ...(audioPath ? ["-c:a","aac","-b:a","128k"] : []),
    "-movflags","+frag_keyframe+empty_moov",
    "-f","mp4","pipe:1"
  ];

  const ff = spawn("ffmpeg", ffArgs, { stdio: ["ignore","pipe","pipe"] });
  // Optional: log ffmpeg diagnostics
  ff.stderr.on("data", () => { /* process.stderr.write(data) */ });
  return ff;
}

const router = new Router();

// POST /api/reels/one-shot
// Body: { season: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" }, onlyGroupDays: true, perImageSec, fps }
router.post("/api/reels/one-shot", requireAuth, async (ctx) => {
  const ownerId = ctx.session.userId;
  const { season, onlyGroupDays = true, perImageSec = 2.5, fps = 30 } = ctx.request.body || {};

  const token = makeToken();
  const exp = Date.now() + 10 * 60 * 1000; // 10 min
  TOKENS.set(token, { ownerId, exp, used: false, buildArgs: { season, onlyGroupDays, perImageSec, fps } });

  setTimeout(() => {
    const rec = TOKENS.get(token);
    if (rec && Date.now() > rec.exp) TOKENS.delete(token);
  }, 11 * 60 * 1000);

  ctx.body = { url: `/one-shot/${token}` };
});

// GET /one-shot/:token  -> streams mp4 directly (single-use)
router.get("/one-shot/:token", requireAuth, async (ctx) => {
  const token = ctx.params.token;
  const rec = TOKENS.get(token);
  if (!rec) { ctx.status = 410; ctx.body = { error: "invalid_or_expired" }; return; }
  if (rec.used) { ctx.status = 410; ctx.body = { error: "already_used" }; return; }
  if (Date.now() > rec.exp) { TOKENS.delete(token); ctx.status = 410; ctx.body = { error: "expired" }; return; }
  if (ctx.session.userId !== rec.ownerId) { ctx.status = 403; ctx.body = { error: "forbidden" }; return; }

  // Select images from assets/wipro based on season + (optional) Thu/Sun rule
  const { images, audio } = await selectSeasonImages(rec.buildArgs);
  if (!images.length) { ctx.status = 404; ctx.body = { error: "no_images_for_selection" }; return; }

  rec.used = true; // mark before stream to prevent race

  const ff = buildReelStream({
    images,
    audioPath: audio,
    perImageSec: rec.buildArgs.perImageSec,
    fps: rec.buildArgs.fps
  });

  ctx.set("Content-Type", "video/mp4");
  ctx.set("Content-Disposition", `attachment; filename="reel-${token}.mp4"`);
  ctx.set("Cache-Control", "no-store, private, max-age=0");
  ctx.status = 200;
  ctx.body = ff.stdout;

  const cleanup = () => TOKENS.delete(token);
  ff.on("close", cleanup);
  ff.on("error", cleanup);
  ctx.res.on("close", () => { try { ff.kill("SIGKILL"); } catch {} cleanup(); });
});

module.exports = { oneShotRouter: router };
