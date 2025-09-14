const reelService = require("../services/reelService");
const logToGoogleSheet = require("../services/logToGoogleSheet");

class ReelController {
  async createReel(ctx) {
    console.log("createReel")
    try {
      let { start, end, excludePrivate } = ctx.request.body || {};
      if (!start) start = "2025-06-19";
      if (!end) end = "2025-09-18";

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
    ctx.set("Content-Disposition", "inline; filename=\"reel.mp4\"");
    ctx.body = require("fs").createReadStream(job.filePath);
  }
}

module.exports = new ReelController();
