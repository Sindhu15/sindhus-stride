const Router = require("koa-router");
const reelController = require("../controllers/ReelController");

const router = new Router({ prefix: "/reel" });

router.post("/", reelController.createReel.bind(reelController));
router.get("/:jobId/status", reelController.getStatus.bind(reelController));
router.get("/:jobId/download", reelController.download.bind(reelController));

module.exports = router;
