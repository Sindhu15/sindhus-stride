const {
  exchangeCodeForToken,
  fetchActivities,
} = require("../services/stravaService");

const { getISTTime } = require("../utils/formatUtils");
const logToGoogleSheet = require("../services/logToGoogleSheet");

class StravaController {
  async authRedirect(ctx) {
    const redirectUri = `https://www.strava.com/oauth/authorize?client_id=${process.env.STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${process.env.STRAVA_REDIRECT_URI}&approval_prompt=force&scope=read,activity:read_all`;
    ctx.redirect(redirectUri);
  }

  async callback(ctx) {
    const code = ctx.query.code;
    try {
      const { access_token, athlete } = await exchangeCodeForToken(code);
      console.log(`An Athlete has connected at ${getISTTime()}`);
      await logToGoogleSheet({
        event: "strava_authorized",
        athleteId: athlete.id,
        ctx,
      });
      ctx.cookies.set("token", access_token, {
        httpOnly: true,
        signed: true,
        maxAge: 10 * 60 * 1000, // 10 mins
        secure: process.env.NODE_ENV === "production", // only send on HTTPS
      });
      ctx.cookies.set("athlete_id", athlete.id.toString(), {
        httpOnly: true,
        signed: true,
        maxAge: 100 * 60 * 1000, // 10 mins
        secure: process.env.NODE_ENV === "production",
      });
      ctx.redirect("/insight-html");
    } catch (error) {
      console.error(
        "Error exchanging code:",
        error.response?.data || error.message,
      );
      await logToGoogleSheet({
        event: "error_strava_authorization",
        athleteId: "error",
        ctx,
      });
      ctx.redirect("/error?message=Error Connecting to Strava");
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
      await logToGoogleSheet({
        event: "error_strava_fetch_activities",
        athleteId: athlete.id,
        ctx,
      });
      ctx.redirect("/error?message=Failed to fetch activities");
    }
  }
}

module.exports = new StravaController();
