// routes/imageProxy.js
const Router = require('koa-router');
const axios = require('axios');

const router = new Router();

router.get('/proxy-image', async (ctx) => {
  const imageUrl = ctx.query.url;
  if (!imageUrl) {
    ctx.status = 400;
    ctx.body = 'Missing URL';
    return;
  }

  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
    });

    ctx.set('Content-Type', response.headers['content-type']);
    ctx.body = response.data;
  } catch (err) {
    console.error('Proxy fetch failed:', err.message);
    ctx.status = 500;
    ctx.body = 'Error fetching image';
  }
});

module.exports = router;
