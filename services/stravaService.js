const axios = require("axios");

async function exchangeCodeForToken(code) {
  const response = await axios.post("https://www.strava.com/oauth/token", {
    client_id: process.env.STRAVA_CLIENT_ID,
    client_secret: process.env.STRAVA_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
  });
  return response.data;
}

async function fetchActivities(accessToken) {
  const response = await axios.get(
    "https://www.strava.com/api/v3/athlete/activities",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { per_page: 100, page: 1 },
    },
  );
  return response.data.filter((a) => a.type === "Run");
}

async function getAthleteProfile(accessToken) {
  const response = await axios.get("https://www.strava.com/api/v3/athlete", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return {
    name: response.data.firstname,
    avatar: response.data.profile,
  };
}

module.exports = { exchangeCodeForToken, fetchActivities, getAthleteProfile };
