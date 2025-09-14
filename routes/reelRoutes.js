const Router = require("koa-router");
const reelController = require("../controllers/ReelController");

const router = new Router({ prefix: "/reel" });

router.post("/", reelController.createReel.bind(reelController));
router.get("/:jobId/status", reelController.getStatus.bind(reelController));

// NEW one-shot flow
router.post("/:jobId/one-shot", (ctx) => reelController.issueOneShot(ctx));
router.get("/one-shot/:token", (ctx) => reelController.oneShotDownload(ctx));

router.get("/:jobId/download", reelController.download.bind(reelController))

module.exports = router;