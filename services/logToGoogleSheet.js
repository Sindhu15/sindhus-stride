const axios = require("axios");
const crypto = require("crypto");

async function logToGoogleSheet(event, stravaId, ctx) {
  const hostname = ctx.request.hostname;
  console.log("hostname:", hostname);
  const hash = stravaId
    ? crypto.createHash("sha256").update(String(stravaId)).digest("hex")
    : "";

  try {
    await axios.post(
      "https://script.google.com/macros/s/AKfycbwHvB_tY_fDI3yaBCbo3xdehW0EPGfmv4e3jnkj48Bals_M-ejUNRJ-lm2z7mScKWW1RA/exec",
      {
        event,
        stravaHash: hash,
        origin: hostname,
      },
    );
  } catch (err) {
    console.error("Failed to log to Google Sheet:", err.message);
  }
}

module.exports = logToGoogleSheet;
