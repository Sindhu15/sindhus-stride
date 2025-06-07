const axios = require("axios");
const crypto = require("crypto");

async function logToGoogleSheet({event, athleteId, ctx, modelUsed}) {
  const hostname = ctx.request.hostname || ctx.headers.host || "unknown";
  const hash = athleteId
    ? crypto.createHash("sha256").update(String(athleteId)).digest("hex")
    : "";

  try {
    await axios.post(
      "https://script.google.com/macros/s/AKfycbwibqgO5Mpiu850aftolBqmsXh-lbAzdExn46o34IGdTV75uJHNsPxeLi4tekfOO32YMg/exec",
      {
        event,
        aiModelUsed: modelUsed || "",
        stravaHash: hash,
        origin: hostname,
      },
    );
  } catch (err) {
    console.error("Failed to log to Google Sheet:", err.message);
  }
}

module.exports = logToGoogleSheet;
