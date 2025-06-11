const axios = require("axios");
const NodeCache = require("node-cache");
const activityCache = new NodeCache({ stdTTL: 600 }); // 10 min TTL
const crypto = require("crypto");

function getCachedActivities(athleteId) {
  return activityCache.get(athleteId);
}

function setCachedActivities(athleteId, activities) {
  activityCache.set(athleteId, activities);
}

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
  const hash = accessToken
    ? crypto.createHash("sha256").update(String(accessToken)).digest("hex")
    : "";

  const cached = getCachedActivities(hash);
  if (cached) {
    console.log("Reading runs from cache");
    return cached;
  }

  console.log("Making API call to Strava");
  const activities = await fetchAllActivities(accessToken);
  const runs = activities.filter((a) => a.type === "Run");
  setCachedActivities(hash, runs);
  return runs;
}

async function fetchAllActivities(accessToken) {
  let allActivities = [];
  let page = 1;
  const perPage = 200; // max allowed

  while (true) {
    const response = await axios.get(
      "https://www.strava.com/api/v3/athlete/activities",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { per_page: perPage, page },
      },
    );

    const activities = response.data;

    if (activities.length === 0) {
      break; // no more activities
    }

    allActivities = allActivities.concat(activities);
    page++;
  }

  return allActivities;
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
