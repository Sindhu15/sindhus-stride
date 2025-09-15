// reelService.js
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { fetchActivities } = require("./stravaService");
const NodeCache = require("node-cache");
const jobs = new Map();
const cache = new NodeCache({ stdTTL: 60 * 60 }); // 1h cache

// --- Defaults & Helpers ---
const DEFAULT_SEASON = { start: "2025-06-19", end: "2025-09-18" };
const IMG_EXTS = [".jpg", ".jpeg", ".png", ".webp"];

const WIPRO_DIR = path.resolve(__dirname, "..", "assets", "wipro");
const THEME_AUDIO = path.resolve(__dirname, "..", "assets", "music", "theme2.mp3");

// ---------- Time / Date ----------
function toIST(dateStrOrMs) {
  const d = new Date(dateStrOrMs);
  const utc = d.getTime();
  const istOffsetMin = 330; // IST = UTC+5:30
  return new Date(utc + istOffsetMin * 60 * 1000);
}
function istParts(d) {
  const ist = toIST(d);
  const dd = String(ist.getUTCDate()).padStart(2, "0");
  const mm = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = ist.getUTCFullYear();
  return { dd, mm, yyyy };
}
function toISTDateISO(d) {
  const { dd, mm, yyyy } = istParts(d);
  return `${yyyy}-${mm}-${dd}`;
}
function isSundayIST(a) {
  const ist = toIST(a.start_date || a.start_date_local);
  return ist.getUTCDay() === 0;
}
function isThursdayIST(a) {
  const ist = toIST(a.start_date || a.start_date_local);
  return ist.getUTCDay() === 4;
}
function isInSeasonIST(activity, start, end) {
  const startMs = Date.parse(start + "T00:00:00Z");
  const endMs = Date.parse(end + "T23:59:59Z");
  const t = Date.parse(activity.start_date || activity.start_date_local);
  if (Number.isNaN(t)) return false;
  const ist = toIST(t).getTime();
  return ist >= startMs && ist <= endMs;
}

// ---------- Photo helpers ----------
function isImageFile(p) {
  try {
    return !!p && fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}
function resolvePhotoPathForISTDate(rootAbs, istDateMs) {
  const { dd, mm } = istParts(istDateMs);
  const candidates = [];
  for (const ext of IMG_EXTS) {
    // MM-DD (folder or flat filename)
    candidates.push(path.join(rootAbs, mm, dd + ext));        // /wipro/06/19.jpg
    candidates.push(path.join(rootAbs, `${mm}-${dd}${ext}`));  // /wipro/06-19.jpg
    candidates.push(path.join(rootAbs, `${mm}_${dd}${ext}`));  // /wipro/06_19.jpg
    candidates.push(path.join(rootAbs, `${mm}.${dd}${ext}`));  // /wipro/06.19.jpg
    candidates.push(path.join(rootAbs, `${mm}:${dd}${ext}`));  // /wipro/06:19.jpg

    // DD-MM (fallback)
    candidates.push(path.join(rootAbs, dd, mm + ext));         // /wipro/19/06.jpg
    candidates.push(path.join(rootAbs, `${dd}-${mm}${ext}`));  // /wipro/19-06.jpg
    candidates.push(path.join(rootAbs, `${dd}_${mm}${ext}`));  // /wipro/19_06.jpg
    candidates.push(path.join(rootAbs, `${dd}.${mm}${ext}`));  // /wipro/19.06.jpg
    candidates.push(path.join(rootAbs, `${dd}:${mm}${ext}`));  // /wipro/19:06.jpg
  }
  for (const p of candidates) if (isImageFile(p)) return p;
  return null;
}
function scanTopLevelImages(dir) {
  const out = [];
  try {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const d of entries) {
        if (d.isFile()) {
          const name = d.name;
          if (IMG_EXTS.includes(path.extname(name).toLowerCase())) {
            const p = path.join(dir, name);
            if (isImageFile(p)) out.push(p);
          }
        }
      }
    }
  } catch (e) {
    console.warn("[reels] scanTopLevelImages failed:", e?.message || e);
  }
  return out;
}
function containsCubbon(str) {
  if (!str) return false;
  const s = String(str).toLowerCase();
  return s.includes("cubbon");
}

// ---------- Stats / Pace ----------
function groupByWeekIST(runs) {
  const startOfISOWeekIST = (d) => {
    const ist = toIST(d);
    const day = ist.getUTCDay() || 7; // 1..7 (Mon..Sun)
    const monday = new Date(ist);
    monday.setUTCDate(ist.getUTCDate() - (day - 1));
    monday.setUTCHours(0, 0, 0, 0);
    return monday.toISOString().slice(0, 10);
  };
  const map = new Map();
  for (const a of runs) {
    const key = startOfISOWeekIST(a.start_date || a.start_date_local || Date.now());
    const prev = map.get(key) || 0;
    const meters = a.distance_m ?? a.distance ?? 0;
    map.set(key, prev + meters);
  }
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([week, meters]) => ({ week, km: +(meters / 1000).toFixed(1) }));
}
function pace(seconds, meters) {
  const spk = seconds / (meters / 1000);
  const m = Math.floor(spk / 60);
  const s = Math.round(spk % 60).toString().padStart(2, "0");
  return `${m}:${s}/km`;
}

// ---------- Jobs / Progress ----------
function uid() {
  return crypto.randomBytes(8).toString("hex");
}
function getJob(id) {
  return jobs.get(id);
}
function setProgress(job, pct, note = "") {
  if (!job) return;
  job.progress = Math.max(0, Math.min(100, Math.floor(pct)));
  if (note) job.note = note;
}

// ---------- Public API ----------
async function enqueueRender({ athlete, season }) {
  const id = uid();
  const publicDir = path.join(__dirname, "..", "public");
  const reelsDir = path.join(publicDir, "reels");
  if (!fs.existsSync(reelsDir)) fs.mkdirSync(reelsDir, { recursive: true });

  const job = { id, status: "queued", progress: 0, note: "" };
  jobs.set(id, job);

  process.nextTick(async () => {
    try {
      job.status = "rendering";
      setProgress(job, 5, "Fetching activities");

      // 1) Fetch & filter activities
      let activities = await fetchActivities(athlete.access_token);
      activities = (Array.isArray(activities) ? activities : [])
        .filter((a) => (a.type || a.sport_type) === "Run")
        .filter((a) => isInSeasonIST(a, (season && season.start) || DEFAULT_SEASON.start, (season && season.end) || DEFAULT_SEASON.end));

      setProgress(job, 20, "Computing stats");

      // 2) Compute stats (includes best Sun & Thu)
      const computed = computeStats(activities);

      setProgress(job, 35, "Composing frames");

      // 3) Render frames
      const framesDir = path.join(reelsDir, id);
      fs.mkdirSync(framesDir, { recursive: true });
      await renderFrames({ framesDir, athlete, season, activities, computed, onFrame: (i, total) => {
        const base = 35;
        const pct = base + Math.floor((i / Math.max(1, total)) * 45); // 35% → 80%
        setProgress(job, pct, `Rendering ${i}/${total}`);
      }});

      setProgress(job, 90, "Encoding video");

      // 4) Stitch MP4
      const outPath = path.join(reelsDir, id + ".mp4");
      await stitchMp4({
        framesDir,
        audioPath: fs.existsSync(THEME_AUDIO) ? THEME_AUDIO : null,
        outPath,
      });

      // 5) Done
      job.status = "ready";
      job.filePath = outPath;
      job.url = `/reels/${id}.mp4`;
      setProgress(job, 100, "Done");
    } catch (e) {
      console.error("Render failed:", e);
      job.status = "failed";
      job.error = e?.message || String(e);
      setProgress(job, 100, "Failed");
    }
  });

  return job;
}

async function waitUntilReady(jobId, timeoutMs = 10000) {
  const start = Date.now();
  return await new Promise((resolve) => {
    const iv = setInterval(() => {
      const job = jobs.get(jobId);
      if (!job) {
        clearInterval(iv);
        resolve({ error: "Job not found" });
      } else if (job.status === "ready" || job.status === "failed") {
        clearInterval(iv);
        resolve({ job_id: job.id, status: job.status, url: job.url || null, note: job.note || "" });
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(iv);
        resolve({ job_id: job.id, status: job.status, progress: job.progress, note: job.note || "" });
      }
    }, 250);
  });
}

// ---------- Stats builder ----------
function computeStats(activities) {
  const runs = activities.filter((a) => (a.type || a.sport_type) === "Run");

  const totalMeters = runs.reduce((s, a) => s + (a.distance_m || a.distance || 0), 0);
  const totalSeconds = runs.reduce((s, a) => s + (a.moving_s || a.moving_time || 0), 0);
  const totalRuns = runs.length;

  const longest = runs.reduce((max, a) => (a.distance > (max?.distance || 0) ? a : max), null);
  const longestRunDateMs = longest ? Date.parse(longest.start_date || longest.start_date_local) : null;

  const weekdayIST = (ms) => toIST(ms).getUTCDay(); // 0=Sun, 4=Thu
  const sundayDatesMs = [];
  const thursdayDatesMs = [];

  const countsByWd = runs.reduce((acc, a) => {
    const ms = Date.parse(a.start_date || a.start_date_local);
    if (Number.isNaN(ms)) return acc;
    const wd = weekdayIST(ms);
    if (wd === 0) sundayDatesMs.push(ms);
    if (wd === 4) thursdayDatesMs.push(ms);
    acc[wd] = (acc[wd] || 0) + 1;
    return acc;
  }, {});

  function pickBest(runs, wd) {
    const filtered = runs.filter((a) => {
      const ms = Date.parse(a.start_date || a.start_date_local);
      return !Number.isNaN(ms) && weekdayIST(ms) === wd;
    });
    if (!filtered.length) return null;
    return filtered.reduce((max, a) => (a.distance > (max?.distance || 0) ? a : max), filtered[0]);
  }

  const bestSunday = pickBest(runs, 0);
  const bestThursday = pickBest(runs, 4);

  return {
    totals: {
      km: +(totalMeters / 1000).toFixed(1),
      runs: totalRuns,
      hours: +(totalSeconds / 3600).toFixed(1),
    },
    prs: {
      longestRunKm: longest ? +(longest.distance / 1000).toFixed(2) : null,
      longestRunPace: longest ? pace(longest.moving_time, longest.distance) : null,
      longestRunDateMs,
      bestSunday: bestSunday
        ? {
            km: +(bestSunday.distance / 1000).toFixed(2),
            pace: pace(bestSunday.moving_time, bestSunday.distance),
            dateMs: Date.parse(bestSunday.start_date || bestSunday.start_date_local),
          }
        : null,
      bestThursday: bestThursday
        ? {
            km: +(bestThursday.distance / 1000).toFixed(2),
            pace: pace(bestThursday.moving_time, bestThursday.distance),
            dateMs: Date.parse(bestThursday.start_date || bestThursday.start_date_local),
          }
        : null,
    },
    counts: {
      sunday: countsByWd[0] || 0,
      thursday: countsByWd[4] || 0,
    },
    dates: {
      sundayDatesMs,
      thursdayDatesMs,
    },
    weekly: groupByWeekIST(runs),
  };
}

// ---------- Renderer ----------
async function renderFrames({ framesDir, athlete, season, activities, computed, onFrame }) {
  const { createCanvas, loadImage } = require("canvas");
  const width = 1080, height = 1920;
  const themePrimary = "#FF6A3D";
  const bg = "#0f0f10", fg = "#f6f7f9", sub = "#b7bcc7";
  const username = athlete && (athlete.username || athlete.name) ? `— ${athlete.username || athlete.name}` : "";
  const dateLine = `${season?.start || DEFAULT_SEASON.start} → ${season?.end || DEFAULT_SEASON.end}`;

  const fps = 6;
  const dur = {
    intro: 18,       // optional intro
    totals: 24,      // totals card
    bestSun: 27,     // Best Sunday card
    bestThu: 27,     // Best Thursday card
    outro: 36        // collage
  };

  // --- Build photo pools ---
  // 1) exact-date PR photos (strict, no probing)
  const prPhotoLongest = computed.prs.longestRunDateMs
    ? resolvePhotoPathForISTDate(WIPRO_DIR, computed.prs.longestRunDateMs)
    : null;
  const prPhotoSunday = computed.prs.bestSunday?.dateMs
    ? resolvePhotoPathForISTDate(WIPRO_DIR, computed.prs.bestSunday.dateMs)
    : null;
  const prPhotoThursday = computed.prs.bestThursday?.dateMs
    ? resolvePhotoPathForISTDate(WIPRO_DIR, computed.prs.bestThursday.dateMs)
    : null;

  // 2) photos for actual session (Sun/Thu) dates
  const sessionDates = [
    ...(computed.dates?.sundayDatesMs || []),
    ...(computed.dates?.thursdayDatesMs || []),
  ];
  const sessionPhotoPool = Array.from(
    new Set(sessionDates.map((ms) => resolvePhotoPathForISTDate(WIPRO_DIR, ms)).filter(Boolean))
  ).filter(isImageFile);

  // 3) all available photos in top-level wipro dir
  const availablePhotos = Array.from(new Set(scanTopLevelImages(WIPRO_DIR)));

  // 4) preferred fallback pool: prefer session photos first
  const preferredPool = sessionPhotoPool.length ? sessionPhotoPool : availablePhotos;

  // helper: weighted fallback (prefer Cubbon-named files)
  function pickFallback(preferList = []) {
    const pool = (preferList.length ? preferList : availablePhotos).filter(isImageFile);
    if (!pool.length) return null;
    // score: +2 if filename contains "cubbon"
    let best = pool[0], bestScore = containsCubbon(pool[0]) ? 2 : 0;
    for (let i = 1; i < pool.length; i++) {
      const p = pool[i];
      const score = containsCubbon(p) ? 2 : 1;
      if (score > bestScore) { best = p; bestScore = score; }
    }
    return best;
  }

  // sanity logs
  try {
    const exists = fs.existsSync(WIPRO_DIR);
    const statOk = exists && fs.statSync(WIPRO_DIR).isDirectory();
    console.log("[reels] WIPRO_DIR:", WIPRO_DIR, "exists:", exists, "isDir:", statOk);
    console.log("[reels] sessionPhotoPool count:", sessionPhotoPool.length);
    console.log("[reels] availablePhotos count:", availablePhotos.length);
  } catch (_) {}

  // drawing helpers
  function drawHeader(ctx, title, subtitle) {
    ctx.fillStyle = fg;
    ctx.font = "900 72px Sans";
    ctx.fillText(title, 64, 200);
    ctx.fillStyle = sub;
    ctx.font = "500 40px Sans";
    ctx.fillText(subtitle, 64, 260);
  }
  function drawBadge(ctx, label, value, x, y) {
    ctx.fillStyle = "#1a1b1f";
    ctx.fillRect(x, y, 300, 160);
    ctx.fillStyle = sub;
    ctx.font = "600 36px Sans";
    ctx.fillText(label, x + 24, y + 56);
    ctx.fillStyle = fg;
    ctx.font = "800 56px Sans";
    ctx.fillText(value, x + 24, y + 120);
  }
  function clear(ctx) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = themePrimary;
    ctx.fillRect(0, height - 16, width, 16);
  }
  let frameCount = 0;
  function save(canvas) {
    const out = path.join(framesDir, `frame_${String(++frameCount).padStart(4, "0")}.png`);
    fs.writeFileSync(out, canvas.toBuffer("image/png"));
    if (typeof onFrame === "function") onFrame(frameCount, totalFramesPlanned);
  }
  async function drawCover(ctx, fIdx, totalF, photoPath) {
    const tryGradient = () => {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, "#14151a");
      grad.addColorStop(1, themePrimary);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(0, 0, width, height);
    };
    if (photoPath && isImageFile(photoPath)) {
      try {
        let img;
        try { img = await loadImage(photoPath); }
        catch { img = await loadImage(fs.readFileSync(photoPath)); }
        const t = totalF ? fIdx / totalF : 0;
        const scale = 1.03 + t * 0.05;
        const iw = img.width, ih = img.height;
        const targetRatio = width / height;
        const imgRatio = iw / ih;
        let drawW, drawH;
        if (imgRatio > targetRatio) { drawH = height * scale; drawW = drawH * imgRatio; }
        else { drawW = width * scale; drawH = drawW / imgRatio; }
        const dx = (width - drawW) / 2;
        const dy = (height - drawH) / 2;
        ctx.drawImage(img, dx, dy, drawW, drawH);
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(0, 0, width, height);
        return;
      } catch (e) {
        console.warn("[reels] drawCover fallback:", e?.message || e);
      }
    }
    tryGradient();
  }

  // -------- Frame plan (for progress %) --------
const totalFramesPlanned = dur.intro + dur.totals + dur.bestSun + dur.bestThu + dur.outro;

  // --- Intro cover: earliest Sun/Thu exact-date photo ---
function earliestSessionMs(datesA = [], datesB = []) {
  const all = [...(datesA || []), ...(datesB || [])].filter((x) => Number.isFinite(x));
  if (!all.length) return null;
  return Math.min(...all);
}
const earliestSessionDateMs = earliestSessionMs(computed.dates?.sundayDatesMs, computed.dates?.thursdayDatesMs);
const introExact = earliestSessionDateMs ? resolvePhotoPathForISTDate(WIPRO_DIR, earliestSessionDateMs) : null;
const introBg = introExact || (preferredPool.length ? preferredPool[0] : null);

// -------- Card: Intro --------
const INTRO_TITLE = "My Wipro run prep";
const INTRO_SUB   = "19th June to September 18th";
for (let i = 0; i < dur.intro; i++) {
  const c = createCanvas(width, height); const ctx = c.getContext("2d");
  await drawCover(ctx, i, dur.intro, introBg);

  // Big title
  ctx.fillStyle = fg;
  ctx.font = "900 84px Sans";
  ctx.fillText(INTRO_TITLE, 64, 360);

  // Subtitle (fixed string, per request)
  ctx.fillStyle = sub;
  ctx.font = "600 48px Sans";
  ctx.fillText(INTRO_SUB, 64, 430);

  // Optional bottom brand strip
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(0, height - 180, width, 180);
  ctx.fillStyle = fg; ctx.font = "700 40px Sans";
  ctx.fillText("Built by Uplift — Powered by Strava", 64, height - 100);

  save(c);
}


  // -------- Card: Totals --------
  const totalsBg = pickFallback(preferredPool);
  for (let i = 0; i < dur.totals; i++) {
    const c = createCanvas(width, height); const ctx = c.getContext("2d");
    await drawCover(ctx, i, dur.totals, totalsBg);
    drawHeader(ctx, "Journey", dateLine);
    const t = Math.min(1, i / 12);
    const baseY = 520;
    drawBadge(ctx, "Distance", `${computed.totals.km} km`, 64 + (1 - t) * -80, baseY);
    drawBadge(ctx, "Runs", `${computed.totals.runs}`, 404 + (1 - t) * 80, baseY);
    drawBadge(ctx, "Hours", `${computed.totals.hours}`, 744 + (1 - t) * -80, baseY);
    save(c);
  }

  // -------- Card: Best Sunday (own card) --------
  {
    const sunday = computed.prs.bestSunday;
    const exact = sunday?.dateMs ? resolvePhotoPathForISTDate(WIPRO_DIR, sunday.dateMs) : null;
    const bgSun = exact || pickFallback(preferredPool);
    for (let i = 0; i < dur.bestSun; i++) {
      const c = createCanvas(width, height); const ctx = c.getContext("2d");
      await drawCover(ctx, i, dur.bestSun, bgSun);
      drawHeader(ctx, "☀️ Best Sunday Run", sunday?.dateMs ? formatReadableDateIST(sunday.dateMs) : "—");
      ctx.fillStyle = fg; ctx.font = "800 64px Sans";
      ctx.fillText(sunday ? `${sunday.km} km @ ${sunday.pace}` : "—", 64, 520);
      save(c);
    }
  }

  // -------- Card: Best Thursday (own card) --------
  {
    const thurs = computed.prs.bestThursday;
    const exact = thurs?.dateMs ? resolvePhotoPathForISTDate(WIPRO_DIR, thurs.dateMs) : null;
    const bgThu = exact || pickFallback(preferredPool);
    for (let i = 0; i < dur.bestThu; i++) {
      const c = createCanvas(width, height); const ctx = c.getContext("2d");
      await drawCover(ctx, i, dur.bestThu, bgThu);
      drawHeader(ctx, "🏅 Best Thursday Intervals", thurs?.dateMs ? formatReadableDateIST(thurs.dateMs) : "—");
      ctx.fillStyle = fg; ctx.font = "800 64px Sans";
      ctx.fillText(thurs ? `${thurs.km} km @ ${thurs.pace}` : "—", 64, 520);
      save(c);
    }
  }

  // -------- Card: Outro (collage; prefers exact-date & session photos) --------
  const collageSources = Array.from(
    new Set(
      [
        prPhotoLongest,
        prPhotoSunday,
        prPhotoThursday,
        ...preferredPool,
      ].filter(Boolean)
    )
  );
  const collageBase = await makeCollage(collageSources, { width, height, themePrimary });

  for (let i = 0; i < dur.outro; i++) {
    const c = createCanvas(width, height); const ctx = c.getContext("2d");

    if (collageBase) {
      // gentle Ken Burns zoom
      const t = i / Math.max(1, dur.outro - 1);
      const scale = 1.02 + 0.03 * t;
      const drawW = width * scale, drawH = height * scale;
      const dx = (width - drawW) / 2;
      const dy = (height - drawH) / 2;
      ctx.drawImage(collageBase, dx, dy, drawW, drawH);
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(0, 0, width, height);
    } else {
      await drawCover(ctx, i, dur.outro, pickFallback(preferredPool));
    }

    ctx.fillStyle = sub; ctx.font = "600 40px Sans";
    ctx.fillText("Built by Uplift — Powered by Strava", 64, height - 120);

    save(c);
  }
}

// small helpers used by renderer
function formatReadableDateIST(ms) {
  const { dd, mm, yyyy } = istParts(ms);
  return `${dd}-${mm}-${yyyy}`;
}

function drawRoundedImage(ctx, img, x, y, w, h, r) {
  ctx.save();
  ctx.beginPath();
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.clip();

  // cover-fit draw
  const iw = img.width, ih = img.height;
  const targetRatio = w / h;
  const imgRatio = iw / ih;
  let drawW, drawH, dx, dy;
  if (imgRatio > targetRatio) { drawH = h; drawW = drawH * imgRatio; }
  else { drawW = w; drawH = drawW / imgRatio; }
  dx = x + (w - drawW) / 2;
  dy = y + (h - drawH) / 2;

  ctx.drawImage(img, dx, dy, drawW, drawH);
  ctx.restore();
}

async function makeCollage(photos, { width, height, themePrimary, cols = 3, rows = 4, gap = 16, radius = 28 } = {}) {
  const { createCanvas, loadImage } = require("canvas");
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // background
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, "#121318");
  grad.addColorStop(1, themePrimary);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, 0, width, height);

  const maxTiles = cols * rows;
  const list = shuffle([...new Set(photos.filter(isImageFile))]).slice(0, Math.max(1, Math.min(maxTiles, photos.length)));
  if (!list.length) return null;

  const tileW = Math.floor((width - (cols + 1) * gap) / cols);
  const tileH = Math.floor((height - (rows + 1) * gap) / rows);

  const loaded = [];
  for (const p of list) {
    try {
      let img;
      try { img = await loadImage(p); }
      catch { img = await loadImage(fs.readFileSync(p)); }
      loaded.push(img);
    } catch {}
  }
  if (!loaded.length) return null;

  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const img = loaded[idx % loaded.length];
      const x = gap + c * (tileW + gap);
      const y = gap + r * (tileH + gap);
      drawRoundedImage(ctx, img, x, y, tileW, tileH, radius);
      idx++;
    }
  }

  // subtle border + soft dark overlay
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);
  ctx.fillStyle = "rgba(0,0,0,0.20)";
  ctx.fillRect(0, 0, width, height);

  return canvas;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- FFmpeg ----------
async function stitchMp4({ framesDir, audioPath, outPath }) {
  const ffmpeg = require("fluent-ffmpeg");
  return new Promise((resolve, reject) => {
    const base = ffmpeg()
      .input(path.join(framesDir, "frame_%04d.png"))
      .inputFPS(6)
      .withVideoCodec("libx264")
      .outputOptions(["-pix_fmt yuv420p", "-r 30"]);
    if (audioPath && fs.existsSync(audioPath)) {
      base.input(audioPath).outputOptions(["-shortest"]);
    }
    base.on("error", reject).on("end", resolve).save(outPath);
  });
}

// ---------- Optional one-shot (unchanged) ----------
const os = require("os");
const sharp = require("sharp");
const { spawn } = require("child_process");

function tmpDir(prefix = "uplift-resized") {
  const d = path.join(os.tmpdir(), `${prefix}-${crypto.randomBytes(6).toString("hex")}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
async function preResizeImages(srcPaths, { width = 1080, height = 1920, quality = 80 } = {}) {
  const outDir = tmpDir();
  const outPaths = [];
  for (let i = 0; i < srcPaths.length; i++) {
    const src = srcPaths[i];
    const out = path.join(outDir, `${i.toString().padStart(4, "0")}.jpg`);
    await sharp(src)
      .resize({ width, height, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 1 } })
      .jpeg({ quality, mozjpeg: true })
      .toFile(out);
    outPaths.push(out);
  }
  const cleanup = async () => {
    await Promise.all(outPaths.map((p) => fs.promises.unlink(p).catch(() => {})));
    try { await fs.promises.rmdir(outDir); } catch {}
  };
  return { images: outPaths, cleanup };
}
function buildReelStream({ images, audioPath, perImageSec = 2.5, fps = 30, outW = 1080, outH = 1920, fadeSec = 0.5 }) {
  if (!images?.length) throw new Error("No images to build reel");
  const imgInputs = images.flatMap((img) => ["-loop", "1", "-t", String(perImageSec), "-i", `file:${img}`]);
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
    "-filter_complex",
    filters.join(";"),
    "-shortest",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    ...(audioPath ? ["-c:a", "aac", "-b:a", "128k"] : []),
    "-movflags",
    "+frag_keyframe+empty_moov",
    "-f",
    "mp4",
    "pipe:1",
  ];
  const ff = spawn("ffmpeg", ffArgs, { stdio: ["ignore", "pipe", "pipe"] });
  ff.stderr.on("data", () => {});
  return ff;
}
function parseISO(s) { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); }
function dd(x) { return String(x).padStart(2, "0"); }
function isThuOrSun(dt) { const w = dt.getUTCDay(); return w === 0 || w === 4; }

async function selectSeasonImages({ season, onlyGroupDays = true, max = 60 }) {
  const start = parseISO(season?.start || DEFAULT_SEASON.start);
  const end = parseISO(season?.end || DEFAULT_SEASON.end);

  const images = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (onlyGroupDays && !isThuOrSun(d)) continue;
    const hit = resolvePhotoPathForISTDate(WIPRO_DIR, d.getTime());
    if (hit) images.push(hit);
    if (images.length >= max) break;
  }
  if (!images.length) {
    try {
      const all = (await fs.promises.readdir(WIPRO_DIR))
        .filter((n) => /\.(jpg|jpeg|png|webp)$/i.test(n))
        .map((n) => path.join(WIPRO_DIR, n))
        .sort();
      images.push(...all.slice(0, max));
    } catch {}
  }
  const audio = fs.existsSync(THEME_AUDIO) ? THEME_AUDIO : null;
  return { images, audio };
}
async function liveOneShot({ season, onlyGroupDays = true, perImageSec = 2.5, fps = 30 }) {
  const { images: srcImages, audio } = await selectSeasonImages({ season, onlyGroupDays, max: 60 });
  if (!srcImages.length) throw new Error("no_images_for_selection");
  const { images: resized, cleanup } = await preResizeImages(srcImages, { width: 1080, height: 1920, quality: 80 });
  const ff = buildReelStream({ images: resized, audioPath: audio, perImageSec, fps });
  return {
    stream: ff.stdout,
    cleanup: async () => { try { await cleanup(); } catch {} },
    meta: { count: resized.length, season, onlyGroupDays, perImageSec, fps },
  };
}

// ---------- Exports ----------
module.exports = { enqueueRender, getJob, waitUntilReady, liveOneShot };
