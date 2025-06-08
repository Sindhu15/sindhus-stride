const Router = require("koa-router");
const homeController = require("../controllers/HomeController");
const fs = require("fs");
const path = require("path");
const router = new Router();

router.get("/", homeController.landingPage);

router.get("/error", async (ctx) => {
  const filePath = path.join(__dirname, "..", "public", "error.html");
  ctx.type = "html";
  ctx.body = fs.createReadStream(filePath);
});

module.exports = router;
