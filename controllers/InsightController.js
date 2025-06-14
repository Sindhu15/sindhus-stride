const { openaiInsightFromRuns } = require("../services/aiService");
const {
  getConfidenceLevelText,
  generateRunningJourneySection,
  getISTTime,
  getLongestRun,
  generateChartUrl,
  selectedLine,
} = require("../utils/formatUtils");
const { getAthleteProfile } = require("../services/stravaService");
const logToGoogleSheet = require("../services/logToGoogleSheet");
const { getRunnerTitle } = require("../utils/helpers");

class InsightController {
  async generateInsight(ctx) {
    const { firstRun, latestRun } = ctx.request.body;
    if (!firstRun || !latestRun) {
      ctx.status = 400;
      ctx.body = "firstRun and latestRun are required in body";
      return;
    }
    try {
      const summary = await openaiInsightFromRuns(firstRun, latestRun);
      ctx.body = { summary };
    } catch (error) {
      console.error(
        "Error generating insight:",
        error.response?.data || error.message,
      );
      ctx.status = 500;
      ctx.body = "Error generating insight";
    }
  }

  async combinedInsight(ctx) {
    const { accessToken } = ctx.query;
    if (!accessToken) {
      ctx.status = 400;
      ctx.body = "Access token is required";
      return;
    }
    try {
      const activities =
        await require("../services/stravaService").fetchActivities(accessToken);
      const runs = activities.filter((a) => a.type === "Run");
      if (runs.length < 2) {
        ctx.body = "Not enough runs to generate insight.";
        return;
      }
      const sortedRuns = runs.sort(
        (a, b) => new Date(a.start_date) - new Date(b.start_date),
      );
      const first = sortedRuns[0];
      const latest = sortedRuns[sortedRuns.length - 1];
      const summary = ""; //await openaiInsightFromRuns(first, latest);
      ctx.body = { summary };
    } catch (error) {
      console.error(
        "Error generating combined insight:",
        error.response?.data || error.message,
      );
      ctx.status = 500;
      ctx.body = "Error generating insight.";
    }
  }

  async getInsightHtml(ctx) {
    const accessToken = ctx.cookies.get("token", { signed: true });
    const athleteId =
      ctx.cookies.get("athleteId", { signed: true }) || "Unknown";
    console.log(`Athlete ID: ${athleteId}`, accessToken);
    if (!accessToken) {
      ctx.redirect(
        "/error?message=Access token is required. Please click on Back To Home and authorize using your Strava account.",
      );
      return;
    }

    try {
      console.log(`An Athlete generated their report at ${getISTTime()}`);
      // Fetch runs from Strava service
      const activities =
        await require("../services/stravaService").fetchActivities(accessToken);
      const { name, avatar } = await getAthleteProfile(accessToken);
      console.log(await getAthleteProfile(accessToken));
      const runs = activities.filter((a) => a.type === "Run");

      if (runs.length < 2) {
        ctx.status = 400;
        ctx.body = "Not enough runs to generate insight.";
        return;
      }

      // Sort runs by date ascending
      const sortedRuns = runs.sort(
        (a, b) => new Date(a.start_date) - new Date(b.start_date),
      );

      const runnerTitle = getRunnerTitle(name, sortedRuns);

      const journeySection = generateRunningJourneySection(sortedRuns);
      const chartSection = generateChartUrl(sortedRuns);
      const firstRunRaw = sortedRuns[0];
      const recentBestRunRaw = getLongestRun(sortedRuns); //sortedRuns[sortedRuns.length - 1];

      // Generate insight markdown from AI
      const { markdownInsight = "", modelUsed = "" } =
        await openaiInsightFromRuns(firstRunRaw, recentBestRunRaw, runs);

      // Prepare plain text for WhatsApp sharing
      const plainTextInsight = markdownInsight.replace(/<\/?[^>]+(>|$)/g, "");
      const confidenceText = getConfidenceLevelText(
        firstRunRaw,
        recentBestRunRaw,
      );

      logToGoogleSheet({
        event: "report_generated",
        athleteId,
        ctx,
        modelUsed,
      });

      ctx.type = "html";
      ctx.body = `
         <!DOCTYPE html>
            <html lang="en">
            <!-- In <head> -->
            <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
         <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Uplift by Sindhu</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
             Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
             margin: 10px 15px; color: #333; font-size: 0.8em; }
      table {
        border-collapse: collapse;
        width: 100%;
        border-radius: 8px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        overflow: hidden;
      }
      th, td { border: 1px solid #ddd; padding: 0.75rem; text-align: left; }
      th { background-color: #f4f4f4; }
      img { max-width: 100%; margin: 2px 0; }
      a.share-btn {
        display: inline-block; padding: 10px 20px; background: #25d366; color: white;
        text-decoration: none; border-radius: 5px; margin-top: 1rem;
      }
    .chart-row {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }
    .chart-row img {
      flex: 1;
      max-width: 48%;
      border: 1px solid #eee;
      border-radius: 8px;
      background: #fff;
    }
    .screenshot-banner {
      background: #fef7dc;
      border-left: 4px solid #fbc02d;
      padding: 12px 16px;
      margin-bottom: 20px;
      font-size: 1rem;
      border-radius: 8px;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
      text-align: center;
    }
    .feedback-section {
      background-color: #1868db91;
      border-radius: 12px;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
      text-align: center;
      color: white;
      font-size: 1.2em;
      width: 100%;
      align-items: center;
      display: flex;
      padding: 1em 0px;
      justify-content: center;
    }
  .report-wrapper {
  padding: 24px;
  background: white;
  border-radius: 12px;
  max-width: 700px;
  margin: 0 auto;
}
  .highlight-box {
      background-color: #fff3e6;
      padding: 16px;
      border-radius: 8px;
      border-left: 5px solid #ffa500;
      margin-bottom: 20px;
    }
    </style>
  </head>
  <body>
    <div id="report" class="report-wrapper">
    <div style="display: flex; align-items: center; gap: 1em;">
      <img src="/proxy-image?url=${encodeURIComponent(avatar)}" alt="${name}" style="width: 70px; height: 70px; border-radius: 50%; object-fit: cover; box-shadow: 0 2px 5px rgba(0,0,0,0.1);" />
      <div>
        <h2 style="margin-bottom: 0px; margin-top: 0px;">${runnerTitle}</h2>
        <div style="display: flex; align-items: end; gap: 4px; margin-top: 4px; font-size: 0.75em; justify-content: space-between;">
          <div style="display: flex; align-items: end;">
            <span style="margin-bottom: 5px; font-weight: 300;">MADE BY</span>
            <img src="./images/group_orange.svg" alt="Uplift" style="height: 25px; vertical-align: middle; margin-left: 4px;" />
          </div>
          <img src="./images/powered-by-strava.svg" alt="Powered by Strava" style="height: 7px; vertical-align: middle; margin-left: 4px; margin-bottom: 6px;" />
        </div>
      </div>
    </div>
     <div>
      ${journeySection}
    </div>
    <div style="margin-top: 1em; "><strong>Reflection:</strong></div>
    <div>${markdownInsight}</div>
    <div>${chartSection}</div>
    <p style="font-size: 1em;"><b>You’ve already done the hard part — you started. Now, keep going.</b></p>
    </div>
    <div id="saveImageBtn" class="screenshot-banner">
        📸 Want to inspire others? <b>Tap here to download as an image</b> and share!
    </div>
    <div style="display: flex; justify-content: space-evenly; margin-top: 20px;">
      <a style="width:40%;" class="feedback-section" href="./howtoreadreport.html" class="cta">Help</a>
      <a style="width:40%;"  class="feedback-section" href="https://forms.gle/FDJhkNz8MvLo7wm77" class="cta">Feedback</a>
    <div>
    <script>
    const fileName = "${name}";
  document.getElementById("saveImageBtn").addEventListener("click", function () {
    const reportSection = document.getElementById("report"); // make sure this is the correct ID

    // Wait a tick in case chart image hasn't finished loading
    setTimeout(() => {
      html2canvas(reportSection, {
        useCORS: true,
        scale: 2, // higher quality
        backgroundColor: '#ffffff'
      }).then(canvas => {
        const link = document.createElement('a');
        link.download = fileName + "_progress_report.png";
        link.href = canvas.toDataURL();
        link.click();
      });
    }, 300);
  });
</script>      
  </body>
  </html>
      `;
    } catch (error) {
      console.error(`Insight page error at ${getISTTime()}`, error);
      await logToGoogleSheet({
        event: "error_insights_page",
        athleteId: athleteId || "Unknown",
        ctx,
      });
      ctx.redirect(
        "/error?message=Failed to generate the report. Please try again later.",
      );
    }
  }
}

module.exports = new InsightController();

//  <div class="chart-row">
//       <img src="${paceChartUrl}" alt="Pace Chart" />
//       <img src="${distanceChartUrl}" alt="Distance Chart" />
//     </div>
