const Router = require("koa-router");
const insightController = require("../controllers/InsightController");

const router = new Router();

router.post(
  "/generate-insight",
  insightController.generateInsight.bind(insightController),
);
router.get(
  "/insight",
  insightController.combinedInsight.bind(insightController),
);
router.get(
  "/insight-html",
  insightController.getInsightHtml.bind(insightController),
);

module.exports = router;
