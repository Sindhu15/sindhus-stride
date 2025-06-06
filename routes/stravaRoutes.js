const Router = require('koa-router');
const stravaController = require('../controllers/StravaController');

const router = new Router();

router.get('/auth/strava', stravaController.authRedirect.bind(stravaController));
router.get('/callback', stravaController.callback.bind(stravaController));
router.get('/fetch-activities', stravaController.getActivities.bind(stravaController));


module.exports = router;
