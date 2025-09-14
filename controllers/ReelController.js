// controllers/ReelController.js
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const reelService = require("../services/reelService");
const logToGoogleSheet = require("../services/logToGoogleSheet");

// In-memory single-use, short-lived tokens:
// token -> { jobId, ownerId, exp, used }
const ONE_SHOT_TOKENS = new Map();

// 10 minutes default TTL
const ONE_SHOT_TTL_MS = 10 * 60 * 1000;

function makeToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function now() {
  return Date.now();
}

class ReelController {
  async createReel(ctx) {
    console.log("createReel");
    try {
      let { start, end, excludePrivate } = ctx.request.body || {};
      if (!start) start = "2025-06-19";
      if (!end) end = "2025-09-18";

      // Expect athlete from Strava auth middleware
      const athlete = ctx.state.athlete || ctx.session?.athlete;
      if (!athlete) {
        ctx.status = 401;
        ctx.body = { error: "Not authenticated with Strava" };
        return;
      }

      const job = await reelService.enqueueRender({
        athlete,
        season: { start, end },
        excludePrivate: !!excludePrivate,
      });

      await logToGoogleSheet({
        event: "reel_enqueue",
        athleteId: athlete.id,
        ctx,
      });

      // Optional blocking (unchanged)
      if (ctx.query.block === "true") {
        const result = await reelService.waitUntilReady(job.id, 10000);
        ctx.body = result;
        return;
      }

      ctx.body = { job_id: job.id, status: job.status };
    } catch (err) {
      console.error("createReel error:", err);
      ctx.status = 500;
      ctx.body = { error: "Failed to start reel render" };
    }
  }

  async getStatus(ctx) {
    const { jobId } = ctx.params;
    const job = reelService.getJob(jobId);
    if (!job) {
      ctx.status = 404;
      ctx.body = { error: "Job not found" };
      return;
    }
    ctx.body = {
      job_id: job.id,
      status: job.status,
      progress: job.progress,
      url: job.url || null,
    };
  }

  /**
   * NEW: Issue a single-use, expiring download URL for this job.
   * POST /api/reels/:jobId/one-shot
   * Returns: { url: "/api/reels/one-shot/<token>" }
   */
  async issueOneShot(ctx) {
    const { jobId } = ctx.params;
    const job = reelService.getJob(jobId);
    if (!job) {
      ctx.status = 404;
      ctx.body = { error: "Job not found" };
      return;
    }
    if (job.status !== "ready" || !job.filePath) {
      ctx.status = 409;
      ctx.body = { error: "Reel not ready" };
      return;
    }

    // Optional: tie token to current athlete/session owner
    const athlete = ctx.state.athlete || ctx.session?.athlete;
    const ownerId = athlete?.id || null;

    const token = makeToken();
    const exp = now() + ONE_SHOT_TTL_MS;

    ONE_SHOT_TOKENS.set(token, { jobId, ownerId, exp, used: false });

    // Safety cleanup after expiry
    setTimeout(() => {
      const rec = ONE_SHOT_TOKENS.get(token);
      if (!rec) return;
      if (now() > rec.exp) ONE_SHOT_TOKENS.delete(token);
    }, ONE_SHOT_TTL_MS + 60 * 1000);

    await logToGoogleSheet({
      event: "reel_issue_one_shot",
      athleteId: ownerId || "unknown",
      ctx,
    });

    ctx.body = { url: `/api/reels/one-shot/${token}` };
  }

  /**
   * NEW: Single-use download endpoint.
   * GET /api/reels/one-shot/:token
   * - Validates token (exists, not used, not expired)
   * - Optionally checks token ownership vs current athlete
   * - Streams the file once
   * - Deletes the file AFTER the stream ends (or client closes)
   * - Deletes the job record (so it can’t be reused)
   * - Invalidates the token
   */
  async oneShotDownload(ctx) {
    const { token } = ctx.params;
    const rec = ONE_SHOT_TOKENS.get(token);

    if (!rec) {
      ctx.status = 410; // Gone/invalid
      ctx.body = { error: "invalid_or_expired" };
      return;
    }
    if (rec.used) {
      ctx.status = 410;
      ctx.body = { error: "already_used" };
      return;
    }
    if (now() > rec.exp) {
      ONE_SHOT_TOKENS.delete(token);
      ctx.status = 410;
      ctx.body = { error: "expired" };
      return;
    }

    // Optional: enforce ownership
    const athlete = ctx.state.athlete || ctx.session?.athlete;
    if (rec.ownerId && athlete?.id && athlete.id !== rec.ownerId) {
      ctx.status = 403;
      ctx.body = { error: "forbidden" };
      return;
    }

    const job = reelService.getJob(rec.jobId);
    if (!job) {
      ONE_SHOT_TOKENS.delete(token);
      ctx.status = 404;
      ctx.body = { error: "Job not found" };
      return;
    }
    if (job.status !== "ready" || !job.filePath) {
      ONE_SHOT_TOKENS.delete(token);
      ctx.status = 409;
      ctx.body = { error: "Reel not ready" };
      return;
    }

    // Mark used immediately to prevent parallel grabs
    rec.used = true;

    // Stream headers
    ctx.set("Content-Type", "video/mp4");
    ctx.set("Content-Disposition", `attachment; filename="reel-${rec.jobId}.mp4"`);
    ctx.set("Cache-Control", "no-store, private, max-age=0");
    ctx.status = 200;

    const readStream = fs.createReadStream(job.filePath);
    ctx.body = readStream;

    const cleanup = async () => {
      try {
        // Delete the reel file
        await fs.promises.unlink(job.filePath).catch(() => {});
        // Remove from job registry so it cannot be reused
        reelService.deleteJob?.(job.id);
      } finally {
        ONE_SHOT_TOKENS.delete(token);
        await logToGoogleSheet({
          event: "reel_download_one_shot",
          athleteId: rec.ownerId || "unknown",
          ctx,
        });
      }
    };

    readStream.on("close", cleanup);
    readStream.on("error", cleanup);
    ctx.res.on("close", cleanup); // client aborted
  }

  /**
   * (Optional) Legacy download — consider removing.
   */
  async download(ctx) {
    const { jobId } = ctx.params;
    const job = reelService.getJob(jobId);
    if (!job) {
      ctx.status = 404;
      ctx.body = { error: "Job not found" };
      return;
    }
    if (job.status !== "ready" || !job.filePath) {
      ctx.status = 409;
      ctx.body = { error: "Reel not ready" };
      return;
    }
    ctx.set("Content-Type", "video/mp4");
    ctx.set("Content-Disposition", 'inline; filename="reel.mp4"');
    ctx.body = fs.createReadStream(job.filePath);
  }
}

module.exports = new ReelController();
