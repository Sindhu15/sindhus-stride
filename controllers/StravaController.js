const {
  exchangeCodeForToken,
  fetchActivities,
  getAthleteProfile
} = require("../services/stravaService");


const { getISTTime } = require("../utils/formatUtils");
const logToGoogleSheet = require("../services/logToGoogleSheet");

class StravaController {
  async authRedirect(ctx) {
    const redirectUri = `https://www.strava.com/oauth/authorize?client_id=${process.env.STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${process.env.STRAVA_REDIRECT_URI}&approval_prompt=force&scope=activity:read`;
    ctx.redirect(redirectUri);
  }

  async callback(ctx) {
  try {
    const code = ctx.query.code;
    if (!code) {
      ctx.redirect("/error?message=Missing code");
      return;
    }
    // Exchange code -> tokens
    const { access_token, refresh_token, expires_at, athlete } =
      await exchangeCodeForToken(code);
    // Fetch profile (name, avatar); Strava returns athlete too
    const profile = await getAthleteProfile(access_token).catch(() => ({}));

    // Save minimal athlete + tokens in session
    ctx.session.athlete = {
      id: (athlete && athlete.id) || (profile && profile.id),
      name:
        (profile && profile.name) ||
        (athlete && athlete.firstname) ||
        "Runner",
      username: (athlete && athlete.username) || null,
      avatar: (profile && profile.avatar) || (athlete && athlete.profile) || null,
      access_token,
      refresh_token,
      expires_at,
    };

    // Go to the reel creation gate page
    ctx.redirect("/reel.html");
  } catch (e) {
    console.error("Strava callback error", e);
    ctx.redirect("/error?message=Auth failed");
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
