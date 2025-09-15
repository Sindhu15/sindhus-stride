// utils/reelAssets.js
const fs = require("fs");
const path = require("path");

const WIPRO_DIR = path.resolve(__dirname, "..", "assets", "wipro");
const THEME_AUDIO = path.resolve(__dirname, "..", "assets", "music", "theme2.mp3");

function parseISO(s) { const [y,m,d] = s.split("-").map(Number); return new Date(Date.UTC(y, m-1, d)); }
function isThuOrSun(dt){ const w = dt.getUTCDay(); return w === 0 || w === 4; }

// utils/reelAssets.js (patch)
function dd(x){ return String(x).padStart(2, "0"); }

// Prefer MM-DD variants, but keep DD-MM as fallback for mixed folders.
function candidatesForDate(dt) {
  const D = dd(dt.getUTCDate());
  const M = dd(dt.getUTCMonth() + 1);
  const exts = [".jpg", ".jpeg", ".png", ".webp"];

  // month-first (MM-DD) — primary
  const mmdd = [`${M}-${D}`, `${M}:${D}`, `${M}_${D}`];

  // day-first (DD-MM) — fallback
  const ddmm = [`${D}-${M}`, `${D}:${M}`, `${D}_${M}`];

  const bases = [...mmdd, ...ddmm];

  const out = [];
  for (const b of bases) {
    for (const e of exts) out.push(path.join(WIPRO_DIR, b + e));
  }
  return out;
}

function fileExists(p){ try { return fs.existsSync(p) && fs.statSync(p).isFile(); } catch { return false; } }

async function selectSeasonImages({ season, onlyGroupDays = true, max = 60 }) {
  const start = parseISO(season?.start || "2025-06-19");
  const end = parseISO(season?.end || "2025-09-18");

  const images = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate()+1)) {
    if (onlyGroupDays && !isThuOrSun(d)) continue;
    const hit = candidatesForDate(d).find(fileExists);
    if (hit) images.push(hit);
    if (images.length >= max) break;
  }
  if (!images.length) {
    const all = (await fs.promises.readdir(WIPRO_DIR))
      .filter(n => /\.(jpg|jpeg|png|webp)$/i.test(n))
      .map(n => path.join(WIPRO_DIR, n))
      .sort();
    images.push(...all.slice(0, max));
  }
  const audio = fs.existsSync(THEME_AUDIO) ? THEME_AUDIO : null;
  return { images, audio };
}

module.exports = { selectSeasonImages };
