const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { fetchActivities } = require("./stravaService");
const NodeCache = require("node-cache");
const { log } = require("console");
const jobs = new Map();
const cache = new NodeCache({ stdTTL: 60 * 60 }); // 1h cache

// --- Defaults & Helpers ---
const DEFAULT_SEASON = { start: "2025-06-19", end: "2025-09-18" };


const IMG_EXTS = [".jpg", ".jpeg", ".png", ".webp"];


// format a Date (IST) to parts
function istParts(d) {
  const ist = toIST(d);
  const dd = String(ist.getUTCDate()).padStart(2, "0");
  const mm = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = ist.getUTCFullYear();
  return { dd, mm, yyyy };
}

// check if a.activity is inside [start,end] inclusive (using IST local day)
function isInSeasonIST(activity, start, end) {
  const startMs = Date.parse(start + "T00:00:00Z");
  const endMs = Date.parse(end + "T23:59:59Z");
  const t = Date.parse(activity.start_date || activity.start_date_local);
  if (Number.isNaN(t)) return false;
  const ist = toIST(t).getTime();
  return ist >= startMs && ist <= endMs;
}

// Try multiple file layouts for /assets/wipro/dd/mm (and variants)
function resolvePhotoPathForISTDate(rootAbs, istDateMs) {
  const { dd, mm } = istParts(istDateMs);
  // candidates (subfolder then flat)
  const candidates = [];
  for (const ext of IMG_EXTS) {
    candidates.push(path.join(rootAbs, dd, mm + ext));      // /wipro/19/06.jpg
    candidates.push(path.join(rootAbs, `${dd}-${mm}${ext}`)); // /wipro/19-06.jpg
    candidates.push(path.join(rootAbs, `${dd}_${mm}${ext}`)); // /wipro/19_06.jpg
    candidates.push(path.join(rootAbs, `${dd}.${mm}${ext}`)); // /wipro/19.06.jpg
    candidates.push(path.join(rootAbs, `${dd}:${mm}${ext}`)); // /wipro/19:06.jpg
  }
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}


function toIST(dateStrOrMs) {
  const d = new Date(dateStrOrMs);
  const utc = d.getTime();
  const istOffsetMin = 330; // IST = UTC+5:30
  return new Date(utc + istOffsetMin * 60 * 1000);
}

function startOfISOWeekIST(d) {
  const ist = toIST(d);
  const day = ist.getUTCDay() || 7;
  const monday = new Date(ist);
  monday.setUTCDate(ist.getUTCDate() - (day - 1));
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

function groupByWeekIST(runs) {
  const map = new Map();
  for (const a of runs) {
    const key = startOfISOWeekIST(
      a.start_date || a.start_date_local || Date.now()
    );
    const prev = map.get(key) || 0;
    const meters = a.distance_m ?? a.distance ?? 0;
    map.set(key, prev + meters);
  }
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([week, meters]) => ({ week, km: +(meters / 1000).toFixed(1) }));
}

function formatHms(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// --- Job queue ---
function uid() {
  return crypto.randomBytes(8).toString("hex");
}
function getJob(id) {
  return jobs.get(id);
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
        resolve({ job_id: job.id, status: job.status, url: job.url || null });
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(iv);
        resolve({ job_id: job.id, status: job.status });
      }
    }, 250);
  });
}

// --- Main enqueue ---
async function enqueueRender({ athlete, season }) {
  const id = uid();
  const publicDir = path.join(__dirname, "..", "public");
  const reelsDir = path.join(publicDir, "reels");
  if (!fs.existsSync(reelsDir)) fs.mkdirSync(reelsDir, { recursive: true });

  const job = { id, status: "queued", progress: 0 };
  jobs.set(id, job);

  process.nextTick(async () => {
    try {
      job.status = "rendering";
      job.progress = 5;

      // 1) Fetch season activities
      let activities = await fetchActivities(athlete.access_token);
      activities = (Array.isArray(activities) ? activities : [])
        .filter(a => a.type === "Run")
        .filter(a => isInSeasonIST(a, DEFAULT_SEASON.start,  DEFAULT_SEASON.end));
      job.progress = 20;

      // 2) Compute stats
      const computed = computeStats(activities);
      job.progress = 40;

      // 3) Render frames
      const framesDir = path.join(reelsDir, id);
      fs.mkdirSync(framesDir, { recursive: true });
      await renderFrames({ framesDir, athlete, season, computed });
      job.progress = 70;

      // 4) Stitch MP4
      const outPath = path.join(reelsDir, id + ".mp4");
      await stitchMp4({
        framesDir,
        audioPath: path.join(__dirname, "..", "public", "assets", "music", "theme.mp3"),
        outPath,
      });
      job.progress = 95;

      // 5) Done
      job.status = "ready";
      job.filePath = outPath;
      job.url = `/reels/${id}.mp4`;
      job.progress = 100;
    } catch (e) {
      console.error("Render failed:", e);
      job.status = "failed";
    }
  });

  return job;
}

function computeStats(activities) {
  const runs = activities.filter((a) => a.type === "Run");

  const totalMeters = runs.reduce((s, a) => s + (a.distance_m || a.distance || 0), 0);
  const totalSeconds = runs.reduce((s, a) => s + (a.moving_s || a.moving_time || 0), 0);
  const totalRuns = runs.length;

  const longest = runs.reduce((max, a) => (a.distance > (max?.distance || 0) ? a : max), null);
  const longestRunDateMs = longest ? Date.parse(longest.start_date || longest.start_date_local) : null;

  // --- Use IST weekday for all day-based stats ---
  const weekdayIST = (ms) => toIST(ms).getUTCDay(); // 0=Sun, 4=Thu

  // Collect best Sunday/Thursday + counts + date lists
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
      bestSunday: bestSunday ? {
        km: +(bestSunday.distance / 1000).toFixed(2),
        pace: pace(bestSunday.moving_time, bestSunday.distance),
        dateMs: Date.parse(bestSunday.start_date || bestSunday.start_date_local),
      } : null,
      bestThursday: bestThursday ? {
        km: +(bestThursday.distance / 1000).toFixed(2),
        pace: pace(bestThursday.moving_time, bestThursday.distance),
        dateMs: Date.parse(bestThursday.start_date || bestThursday.start_date_local),
      } : null,
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



function pace(seconds, meters) {
  const spk = seconds / (meters / 1000);
  const m = Math.floor(spk / 60);
  const s = Math.round(spk % 60).toString().padStart(2, "0");
  return `${m}:${s}/km`;
}

async function renderFrames({ framesDir, athlete, season, computed }) {
  const { createCanvas, loadImage } = require("canvas");
  const width = 1080, height = 1920;
  const themePrimary = "#FF6A3D";
  const bg = "#0f0f10", fg = "#f6f7f9", sub = "#b7bcc7";
  const username = athlete && (athlete.username || athlete.name) ? `— ${athlete.username || athlete.name}` : "";
  const dateLine = `${season?.start || DEFAULT_SEASON.start} → ${season?.end || DEFAULT_SEASON.end}`;
  const seasonTitle = `${username}`.trim();

  // Slightly slower: 18→22.5s @6fps
  const fps = 6;
  const dur = { intro: 18, totals: 24, prs: 27, progress: 30, outro: 36 }; // frames per card
  // Asset roots
    const wiproRoot = path.join(__dirname, "..", "public", "assets", "wipro");

    // Build a pool of photos only from days the user actually ran (Sun/Thu in IST)
const sessionDates = [
  ...(computed.dates?.sundayDatesMs || []),
  ...(computed.dates?.thursdayDatesMs || []),
];

// Resolve those exact dates to photo paths
const sessionPhotoPool = Array.from(
  new Set(
    sessionDates
      .map((ms) => resolvePhotoPathForISTDate(wiproRoot, ms))
      .filter(Boolean)
  )
).filter(isImageFile);

console.log("[reels] sessionPhotoPool count:", sessionPhotoPool.length);

// Use session-day pool if available; otherwise fall back to all available photos
const pickPool = sessionPhotoPool.length ? sessionPhotoPool : availablePhotos;


// sanity logs
try {
  const exists = fs.existsSync(wiproRoot);
  const statOk = exists && fs.statSync(wiproRoot).isDirectory();
  console.log("[reels] wiproRoot:", wiproRoot, "exists:", exists, "isDir:", statOk);
  if (statOk) {
    const sample = fs.readdirSync(wiproRoot).slice(0, 8);
    console.log("[reels] wiproRoot sample files:", sample);
  } else {
    console.warn("[reels] wiproRoot missing or not a directory");
  }
} catch (e) {
  console.warn("[reels] wiproRoot check failed:", e?.message || e);
}



  // choose up to 3 dates to source photos (start/mid/end of weekly series)
  const weeks = computed.weekly.length ? computed.weekly : [{ week: season?.start || DEFAULT_SEASON.start, km: 0 }];
  const weekDates = weeks.map(w => Date.parse(w.week + "T12:00:00Z")); // midday for stability
  const picks = [];
  if (weekDates.length) {
    picks.push(weekDates[0]);
    picks.push(weekDates[Math.floor(weekDates.length/2)] || weekDates[0]);
    picks.push(weekDates[weekDates.length-1] || weekDates[0]);
  }

  // try to resolve photos for those dates
  const photoPaths = picks.map(ms => resolvePhotoPathForISTDate(wiproRoot, ms)).filter(Boolean);


  // PR-specific photos: use exact dates only (no probing)
const prPhotoLongest =
  computed.prs.longestRunDateMs
    ? resolvePhotoPathForISTDate(wiproRoot, computed.prs.longestRunDateMs)
    : null;

const prPhotoSunday =
  computed.prs.bestSunday?.dateMs
    ? resolvePhotoPathForISTDate(wiproRoot, computed.prs.bestSunday.dateMs)
    : null;

const prPhotoThursday =
  computed.prs.bestThursday?.dateMs
    ? resolvePhotoPathForISTDate(wiproRoot, computed.prs.bestThursday.dateMs)
    : null;

 // Build a pool of available photos (photoPaths + any other images in the folder)
  // Build a pool of available photos (photoPaths + any other images in the folder)
function isImageFile(p) {
  try { return fs.existsSync(p) && fs.statSync(p).isFile(); } catch { return false; }
}

let availablePhotos = Array.from(new Set((photoPaths || []).filter(isImageFile)));

try {
  if (fs.existsSync(wiproRoot) && fs.statSync(wiproRoot).isDirectory()) {
    const entries = fs.readdirSync(wiproRoot, { withFileTypes: true });
    const extra = entries
      .filter(d => d.isFile())
      .map(d => d.name)
      .filter(name => IMG_EXTS.includes(path.extname(name).toLowerCase()))
      .map(name => path.join(wiproRoot, name))
      .filter(isImageFile);

    for (const p of extra) if (!availablePhotos.includes(p)) availablePhotos.push(p);
  }
} catch (e) {
  console.warn("[reels] scan wiproRoot failed:", e?.message || e);
}

function pickRandom(pool) {
  if (!pool || pool.length === 0) return null;
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx];
}

// fix random backgrounds per section so the card doesn’t flicker frame-to-frame
let introBg    = pickRandom(pickPool);
let totalsBg   = pickRandom(pickPool);
let progressBg = pickRandom(pickPool);
let outroBg    = pickRandom(pickPool);

// ensure non-null by falling back to first available (if any)
if (!introBg)    introBg    = pickPool[0] || null;
if (!totalsBg)   totalsBg   = pickPool[0] || null;
if (!progressBg) progressBg = pickPool[0] || null;
if (!outroBg)    outroBg    = pickPool[0] || null;

console.log("[reels] availablePhotos count:", availablePhotos.length);
console.log("[reels] Random BGs:", { introBg, totalsBg, progressBg, outroBg });

  
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

  let frameIdx = 0;
  function save(canvas) {
    const out = path.join(framesDir, `frame_${String(++frameIdx).padStart(4, "0")}.png`);
    fs.writeFileSync(out, canvas.toBuffer("image/png"));
  }

  // utility: draw a "cover" background (image or gradient)
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
      const { loadImage } = require("canvas");
      let img;
      try {
        img = await loadImage(photoPath);
      } catch {
        const buf = fs.readFileSync(photoPath);
        img = await loadImage(buf);
      }

      const t = totalF ? fIdx / totalF : 0;
      const scale = 1.03 + t * 0.05;
      const iw = img.width, ih = img.height;
      const targetRatio = width / height;
      const imgRatio = iw / ih;
      let drawW, drawH;
      if (imgRatio > targetRatio) {
        drawH = height * scale;
        drawW = drawH * imgRatio;
      } else {
        drawW = width * scale;
        drawH = drawW / imgRatio;
      }
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


  // ---- Card 1: Intro ----
  for (let i = 0; i < dur.intro; i++) {
    const c = createCanvas(width, height); const ctx = c.getContext("2d");
    await drawCover(ctx, i, dur.intro, introBg);
    drawHeader(ctx, "SIS-Wipro-12-Week Journey", dateLine);
    ctx.fillStyle = fg; ctx.font = "700 64px Sans"; ctx.fillText(seasonTitle, 64, 380);
    ctx.globalAlpha = Math.min(1, i / 6);
    ctx.font = "600 48px Sans"; ctx.fillStyle = sub; ctx.fillText("Built by Uplift", 64, 460);
    ctx.globalAlpha = 1;
    save(c);
  }

  // ---- Card 2: Totals ----
  for (let i = 0; i < dur.totals; i++) {
    const c = createCanvas(width, height); const ctx = c.getContext("2d");
    await drawCover(ctx, i, dur.totals, totalsBg);
    drawHeader(ctx, "Journey", "Distance • Runs • Hours");
    const t = Math.min(1, i / 12);
    const baseY = 520;
    drawBadge(ctx, "Distance", `${computed.totals.km} km`, 64 + (1 - t) * -80, baseY);
    drawBadge(ctx, "Runs", `${computed.totals.runs}`, 404 + (1 - t) * 80, baseY);
    drawBadge(ctx, "Hours", `${computed.totals.hours}`, 744 + (1 - t) * -80, baseY);
    save(c);
  }

  // ---- Card 3: PRs ----
for (let i = 0; i < dur.prs; i++) {
  const c = createCanvas(width, height); const ctx = c.getContext("2d");

  // rotate exact-date backgrounds across thirds of the PR card duration
  const third = Math.max(1, Math.floor(dur.prs / 3));
  let whichPhoto;
  if (i < third) {
    whichPhoto = prPhotoLongest;
  } else if (i < 2 * third) {
    whichPhoto = prPhotoSunday;
  } else {
    whichPhoto = prPhotoThursday;
  }
  const prBg =
    whichPhoto ||
    prPhotoLongest || prPhotoSunday || prPhotoThursday ||
    photoPaths[2] || photoPaths[1] || photoPaths[0];

  await drawCover(ctx, i, dur.prs, prBg);

  drawHeader(ctx, "Personal Bests", "Season Highlights");

  ctx.fillStyle = fg; ctx.font = "800 56px Sans";
  const y0 = 420;

  // // Longest Run
  // ctx.fillText("🏅 Longest Run", 64, y0);
  // ctx.font = "600 48px Sans";
  // const longestLine =
  //   (computed.prs.longestRunKm ? `${computed.prs.longestRunKm} km` : "-") +
  //   (computed.prs.longestRunPace ? `  @ ${computed.prs.longestRunPace}` : "");
  // ctx.fillText(longestLine || "-", 64, y0 + 64);
  // if (computed.prs.longestRunDateMs) {
  //   const { dd, mm, yyyy } = istParts(computed.prs.longestRunDateMs);
  //   ctx.font = "500 36px Sans"; ctx.fillStyle = sub;
  //   ctx.fillText(`${dd}-${mm}-${yyyy}`, 64, y0 + 112);
  // }

  // Best Sunday Run
  ctx.fillStyle = fg; ctx.font = "800 56px Sans";
  ctx.fillText("☀️ Best Sunday Run", 64, y0 + 200);
  ctx.font = "600 48px Sans";
  const sunday = computed.prs.bestSunday;
  const sundayLine = sunday ? `${sunday.km} km  @ ${sunday.pace}` : "—";
  ctx.fillText(sundayLine, 64, y0 + 264);
  if (sunday?.dateMs) {
    const { dd, mm, yyyy } = istParts(sunday.dateMs);
    ctx.font = "500 36px Sans"; ctx.fillStyle = sub;
    ctx.fillText(`${dd}-${mm}-${yyyy}`, 64, y0 + 312);
  }

  // Best Thursday Run
  ctx.fillStyle = fg; ctx.font = "800 56px Sans";
  ctx.fillText("🏅 Best Thursday Run", 64, y0 + 400);
  ctx.font = "600 48px Sans";
  const thurs = computed.prs.bestThursday;
  const thursLine = thurs ? `${thurs.km} km  @ ${thurs.pace}` : "—";
  ctx.fillText(thursLine, 64, y0 + 464);
  if (thurs?.dateMs) {
    const { dd, mm, yyyy } = istParts(thurs.dateMs);
    ctx.font = "500 36px Sans"; ctx.fillStyle = sub;
    ctx.fillText(`${dd}-${mm}-${yyyy}`, 64, y0 + 512);
  }

  save(c);
}


  // // ---- Card 4: Weekly Mileage ----
  // const weeksData = computed.weekly.length ? computed.weekly : [{ week: dateLine.split(" → ")[0], km: 0 }];
  // const maxKm = Math.max(10, ...weeksData.map(w => w.km));
  // function xFor(i) { return 64 + (i / (weeksData.length - 1 || 1)) * (width - 128); }
  // function yFor(km) { return 640 + 900 - (km / maxKm) * 900; }
  // // base layer with chart & bg
  // const base = createCanvas(width, height); const bctx = base.getContext("2d");
  // await drawCover(bctx, 0, 1, progressBg);
  // drawHeader(bctx, "Progress", "Weekly Mileage");
  // bctx.strokeStyle = "rgba(255,255,255,0.2)"; bctx.lineWidth = 2; bctx.strokeRect(64, 640, width - 128, 900);

  // for (let i = 0; i < dur.progress; i++) {
  //   const c = createCanvas(width, height); const ctx = c.getContext("2d");
  //   ctx.drawImage(base, 0, 0);
  //   ctx.strokeStyle = themePrimary; ctx.lineWidth = 6; ctx.lineJoin = "round";
  //   ctx.beginPath(); ctx.moveTo(xFor(0), yFor(weeksData[0].km));
  //   const upto = Math.floor((i / dur.progress) * (weeksData.length - 1));
  //   for (let j = 1; j <= upto; j++) ctx.lineTo(xFor(j), yFor(weeksData[j].km));
  //   ctx.stroke();
  //   save(c);
  // }

  // ---- Card 5: Outro ----


  function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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
  if (imgRatio > targetRatio) {
    drawH = h;
    drawW = drawH * imgRatio;
  } else {
    drawW = w;
    drawH = drawW / imgRatio;
  }
  dx = x + (w - drawW) / 2;
  dy = y + (h - drawH) / 2;

  ctx.drawImage(img, dx, dy, drawW, drawH);
  ctx.restore();
}

async function makeCollage(photos, { cols = 3, rows = 4, gap = 16, radius = 28 } = {}) {
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
  const list = shuffle([...new Set(photos)]).slice(0, Math.max(1, Math.min(maxTiles, photos.length)));
  if (list.length === 0) return null;

  const tileW = Math.floor((width - (cols + 1) * gap) / cols);
  const tileH = Math.floor((height - (rows + 1) * gap) / rows);

  // load all images (with buffer fallback)
  const loaded = [];
  for (const p of list) {
    try {
      let img;
      try { img = await loadImage(p); }
      catch { img = await loadImage(fs.readFileSync(p)); }
      loaded.push(img);
    } catch {}
  }
  if (loaded.length === 0) return null;

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

  // subtle border + bottom bar
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);
  ctx.fillStyle = "rgba(0,0,0,0.20)";
  ctx.fillRect(0, 0, width, height);

  return canvas;
}
  // ---- Card 5: Outro (Collage of all photos + weekday session counts) ----
const collageSources = Array.from(new Set([
  prPhotoLongest,
  prPhotoSunday,
  prPhotoThursday,
  ...pickPool
].filter(Boolean)));

let collageBase = await makeCollage(collageSources, { cols: 3, rows: 4, gap: 16, radius: 28 });

for (let i = 0; i < dur.outro; i++) {
  const c = createCanvas(width, height); const ctx = c.getContext("2d");

  if (collageBase) {
    // gentle zoom on the collage (Ken Burns)
    const t = i / Math.max(1, dur.outro - 1);
    const scale = 1.02 + 0.03 * t; // 1.02 → 1.05
    const drawW = width * scale, drawH = height * scale;
    const dx = (width - drawW) / 2;
    const dy = (height - drawH) / 2;
    ctx.drawImage(collageBase, dx, dy, drawW, drawH);

    // darken slightly for text legibility
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(0, 0, width, height);
  } else {
    // fallback to a single random image if no collage possible
    await drawCover(ctx, i, dur.outro, outroBg);
  }

  drawHeader(ctx, "Sisters In Sweat");

  // NEW: session count badges (top-right)
  const badgeX = width - 64 - 300; // 64px right margin, badge is 300px wide
  // drawBadge(ctx, "Sunday Sessions", String(computed.counts.sunday),   badgeX, 180);
  // drawBadge(ctx, "Thursday Sessions", String(computed.counts.thursday), badgeX, 360);

  ctx.fillStyle = sub; ctx.font = "600 40px Sans";
  ctx.fillText("Built by Uplift-Powered by Strava", 64, height - 120);

  save(c);
}
}


// --- FFmpeg ---
async function stitchMp4({ framesDir, audioPath, outPath }) {
  const ffmpeg = require("fluent-ffmpeg");
  return new Promise((resolve, reject) => {
    const base = ffmpeg()
      .input(path.join(framesDir, "frame_%04d.png"))
      .inputFPS(6)
      .withVideoCodec("libx264")
      .outputOptions(["-pix_fmt yuv420p", "-r 30"]);
    if (fs.existsSync(audioPath)) {
      base.input(audioPath).outputOptions(["-shortest"]);
    }
    base.on("error", reject).on("end", resolve).save(outPath);
  });
}

module.exports = { enqueueRender, getJob, waitUntilReady };
