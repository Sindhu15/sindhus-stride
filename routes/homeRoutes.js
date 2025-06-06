const Router = require('koa-router');
const homeController = require('../controllers/HomeController');

const router = new Router();

router.get('/', homeController.landingPage);

module.exports = router;