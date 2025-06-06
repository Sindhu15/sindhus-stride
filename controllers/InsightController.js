const { marked } = require('marked');
const { openaiInsightFromRuns } = require('../services/aiService');
const { prepareRun, getQuickChartUrl, getConfidenceLevelText } = require('../utils/formatUtils');

class InsightController {
  async generateInsight(ctx) {
    const { firstRun, latestRun } = ctx.request.body;
    if (!firstRun || !latestRun) {
      ctx.status = 400;
      ctx.body = 'firstRun and latestRun are required in body';
      return;
    }
    try {
      const summary = await openaiInsightFromRuns(firstRun, latestRun);
      ctx.body = { summary };
    } catch (error) {
      console.error('Error generating insight:', error.response?.data || error.message);
      ctx.status = 500;
      ctx.body = 'Error generating insight';
    }
  }

  async combinedInsight(ctx) {
    const accessToken = ctx.query.token;
    if (!accessToken) {
      ctx.status = 400;
      ctx.body = 'Access token is required';
      return;
    }
    try {
      const activities = await require('../services/stravaService').fetchActivities(accessToken);
      const runs = activities.filter(a => a.type === 'Run');
      if (runs.length < 2) {
        ctx.body = 'Not enough runs to generate insight.';
        return;
      }
      const sortedRuns = runs.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
      const first = sortedRuns[0];
      const latest = sortedRuns[sortedRuns.length - 1];
      const summary = await openaiInsightFromRuns(first, latest);
      ctx.body = { summary };
    } catch (error) {
      console.error('Error generating combined insight:', error.response?.data || error.message);
      ctx.status = 500;
      ctx.body = 'Error generating insight.';
    }
  }
  
  async getInsightHtml(ctx) {
    const accessToken = ctx.query.token;
    if (!accessToken) {
      ctx.status = 400;
      ctx.body = 'Access token is required';
      return;
    }
    
    try {
      // Fetch runs from Strava service
      const activities = await require('../services/stravaService').fetchActivities(accessToken);
      const runs = activities.filter(a => a.type === 'Run');
  
      if (runs.length < 2) {
        ctx.status = 400;
        ctx.body = 'Not enough runs to generate insight.';
        return;
      }
  
      // Sort runs by date ascending
      const sortedRuns = runs.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
      const firstRunRaw = sortedRuns[0];
      const latestRunRaw = sortedRuns[sortedRuns.length - 1];
  
      // Prepare runs for formatting/chart
      const firstRun = prepareRun(firstRunRaw);
      const latestRun = prepareRun(latestRunRaw, firstRunRaw);
  
      // Generate insight markdown from AI
      const markdownInsight = await openaiInsightFromRuns(firstRunRaw, latestRunRaw);
  
      // Convert markdown to HTML
      const insightHtml = marked(markdownInsight);
  
      // Generate QuickChart URL
      const chartUrl = getQuickChartUrl(firstRun, latestRun);
      const paceChartUrl = getQuickChartUrl(firstRun, latestRun, 'pace');
      const distanceChartUrl = getQuickChartUrl(firstRun, latestRun, 'distance'); 
  
      // Prepare plain text for WhatsApp sharing
      const plainTextInsight = markdownInsight.replace(/<\/?[^>]+(>|$)/g, "");
      const confidenceText = getConfidenceLevelText(firstRunRaw, latestRunRaw);

      const runTable = `
  <table>
    <thead>
      <tr>
        <th>Run</th>
        <th>Date</th>
        <th>Distance (km)</th>
        <th>Pace (min/km)</th>
        <th>Change</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td>${firstRun.date}</td>
        <td>${firstRun.distance}</td>
        <td>${firstRun.pace}</td>
        <td>-</td>
      </tr>
      <tr>
        <td>2</td>
        <td>${latestRun.date}</td>
        <td>${latestRun.distance}</td>
        <td>${latestRun.pace}</td>
        <td>${latestRun.change}</td>
      </tr>
    </tbody>
  </table>
`;

  
      ctx.type = 'html';
      ctx.body = `
         <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Stride Insight</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
             Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
             margin: 20px; color: #333; }
      table { border-collapse: collapse; width: 100%; margin-bottom: 1rem; }
      th, td { border: 1px solid #ddd; padding: 0.75rem; text-align: center; }
      th { background-color: #f4f4f4; }
      img { max-width: 100%; margin: 1rem 0; }
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
}
    </style>
  </head>
  <body>
    <h2>Your Running Progress</h2>
    ${runTable}
    <h3 style="margin-top: 1.5rem;">Progress Charts</h3>
    <div class="chart-row">
      <img src="${paceChartUrl}" alt="Pace Chart" />
      <img src="${distanceChartUrl}" alt="Distance Chart" />
    </div>
    <p><strong>Reflection:</strong> ${confidenceText}</p>
    <p>${markdownInsight}</p>
    <a class="share-btn" href="https://wa.me/?text=${encodeURIComponent(markdownInsight)}" target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
    <div class="screenshot-banner">
    📸 Want to inspire others? Take a screenshot and share in the WhatsApp group!
    </div>
  </body>
  </html>
      `;
    } catch (error) {
      console.error('Insight page error:', error);
      ctx.status = 500;
      ctx.body = 'Internal server error';
    }
  }
}
  

module.exports = new InsightController();
