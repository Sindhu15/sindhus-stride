require("dotenv").config();
const Koa = require("koa");
const bodyParser = require("koa-bodyparser");
const stravaRoutes = require("./routes/stravaRoutes");
const insightRoutes = require("./routes/insightsRoutes");
const homeRoutes = require("./routes/homeRoutes");
const imageProxyRoutes = require("./routes/imageProxy");
const serve = require("koa-static");
const path = require("path");
const reelRoutes = require("./routes/reelRoutes");
const gateRoutes = require("./routes/gateRoutes");

const rawSession = require("koa-session");
const session = rawSession.default || rawSession; // handle CJS/ESM interop




const app = new Koa();
app.keys = [process.env.SESSION_SECRET];
app.proxy = true;


app.use(session({}, app));
app.use(bodyParser());
app.use(stravaRoutes.routes()).use(stravaRoutes.allowedMethods());
app.use(insightRoutes.routes()).use(insightRoutes.allowedMethods());
app.use(homeRoutes.routes()).use(homeRoutes.allowedMethods());
app.use(reelRoutes.routes()).use(reelRoutes.allowedMethods());
app.use(gateRoutes.routes()).use(gateRoutes.allowedMethods());
app.use(imageProxyRoutes.routes());
app.use(serve(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Sindhu's Stride running on http://localhost:${PORT}`);
});


