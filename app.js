require("dotenv").config();
const Koa = require("koa");
const bodyParser = require("koa-bodyparser");
const stravaRoutes = require("./routes/stravaRoutes");
const insightRoutes = require("./routes/insightsRoutes");
const homeRoutes = require("./routes/homeRoutes");

const app = new Koa();
app.keys = [process.env.SESSION_SECRET];
app.proxy = true; 

app.use(bodyParser());
app.use(stravaRoutes.routes()).use(stravaRoutes.allowedMethods());
app.use(insightRoutes.routes()).use(insightRoutes.allowedMethods());
app.use(homeRoutes.routes()).use(homeRoutes.allowedMethods());

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Sindhu's Stride running on http://localhost:${PORT}`);
});
