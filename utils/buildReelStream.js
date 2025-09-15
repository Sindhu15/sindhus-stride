// utils/buildReelStream.js
const { spawn } = require("child_process");

function buildReelStream({ images, audioPath, perImageSec = 2.5, fps = 30, outW = 1080, outH = 1920, fadeSec = 0.5 }) {
  if (!images?.length) throw new Error("No images to build reel");

  const imgInputs = images.flatMap(img => ["-loop", "1", "-t", String(perImageSec), "-i", `file:${img}`]);

  const filters = [];
  const streams = [];

  for (let i = 0; i < images.length; i++) {
    const lbl = `v${i}`;
    filters.push(
      `[${i}:v]scale=${outW}:${outH}:force_original_aspect_ratio=decrease,` +
      `pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:black,fps=${fps}[${lbl}]`
    );
    streams.push(`[${lbl}]`);
  }

  // Fold with xfade
  let last = streams[0];
  const xfadeDur = fadeSec;
  const seg = perImageSec;
  let offsetSum = 0;
  for (let i = 1; i < streams.length; i++) {
    const out = `x${i}`;
    const offset = Math.max(0, seg - xfadeDur);
    filters.push(`${last}${streams[i]}xfade=transition=fade:duration=${xfadeDur}:offset=${offsetSum + offset}[${out}]`);
    last = `[${out}]`;
    offsetSum += seg - xfadeDur;
  }

  const ffArgs = [
    ...imgInputs,
    ...(audioPath ? ["-i", `file:${audioPath}`] : []),
    "-filter_complex", filters.join(";"),
    "-shortest",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20",
    ...(audioPath ? ["-c:a", "aac", "-b:a", "128k"] : []),
    "-movflags", "+frag_keyframe+empty_moov",
    "-f", "mp4", "pipe:1",
  ];

  const ff = spawn("ffmpeg", ffArgs, { stdio: ["ignore", "pipe", "pipe"] });
  ff.stderr.on("data", () => {}); // hook for logging if you want
  return ff;
}

module.exports = { buildReelStream };
