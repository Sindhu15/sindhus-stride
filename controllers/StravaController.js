const {
  exchangeCodeForToken,
  fetchActivities,
} = require("../services/stravaService");

const { getISTTime } = require("../utils/formatUtils");

class StravaController {
  async authRedirect(ctx) {
    const redirectUri = `https://www.strava.com/oauth/authorize?client_id=${process.env.STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${process.env.STRAVA_REDIRECT_URI}&approval_prompt=force&scope=activity:read`;
    ctx.redirect(redirectUri);
  }

  async callback(ctx) {
    const code = ctx.query.code;
    try {
      const { access_token } = await exchangeCodeForToken(code);
      console.log(`An Athlete has connected at ${getISTTime()}`);
      ctx.redirect(`/insight-html?token=${access_token}`);
    } catch (error) {
      console.error(
        "Error exchanging code:",
        error.response?.data || error.message,
      );
      ctx.status = 500;
      ctx.body = "❌ Error connecting to Strava.";
    }
  }

  async getActivities(ctx) {
    const accessToken = ctx.query.token;
    if (!accessToken) {
      ctx.status = 400;
      ctx.body = "Access token is required";
      return;
    }
    try {
      const activities = await fetchActivities(accessToken);
      ctx.body = activities;
    } catch (error) {
      console.error(
        "Error fetching activities:",
        error.response?.data || error.message,
      );
      ctx.status = 500;
      ctx.body = "Failed to fetch activities";
    }
  }
}

module.exports = new StravaController();
