const Router = require("koa-router");

const router = new Router();

router.post("/gate", async (ctx) => {
  const { password } = ctx.request.body || {};
  const expected = process.env.WIPRO_PASSWORD || "";
  if (!expected) {
    ctx.status = 500;
    ctx.body = { ok: false, error: "WIPRO_PASSWORD not configured" };
    return;
  }
  if (password && password === expected) {
    ctx.body = { ok: true };
  } else {
    ctx.status = 401;
    ctx.body = { ok: false, error: "Invalid password" };
  }
});

module.exports = router;
