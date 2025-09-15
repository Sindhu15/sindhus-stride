// utils/preResize.js
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");

function tmpDir(prefix = "uplift-resized") {
  const d = path.join(os.tmpdir(), `${prefix}-${crypto.randomBytes(6).toString("hex")}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/**
 * Resize images to fit target canvas (contain + black letterbox), JPEG q=80.
 * Returns { images: [paths], cleanup: async () => void }
 */
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
    await Promise.all(outPaths.map(p => fs.promises.unlink(p).catch(() => {})));
    await fs.promises.rmdir(outDir).catch(() => {});
  };
  return { images: outPaths, cleanup };
}

module.exports = { preResizeImages };
