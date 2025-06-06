const axios = require('axios');
const marked = require('marked');

function formatPace(elapsedTimeSec, distanceMeters) {
  const paceSecPerKm = elapsedTimeSec / (distanceMeters / 1000);
  const min = Math.floor(paceSecPerKm / 60);
  const sec = Math.round(paceSecPerKm % 60);
  return `${min}:${sec.toString().padStart(2, '0')}/km`;
}

function estimateEnergyLevel(paceSecPerKm) {
  if (paceSecPerKm < 300) return 'High';
  if (paceSecPerKm < 360) return 'Moderate';
  return 'Easy';
}

function prepareRun(run) {
  const paceSecPerKm = run.elapsed_time / (run.distance / 1000);
  return {
    date: new Date(run.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    distance: (run.distance / 1000).toFixed(1),
    pace: formatPace(run.elapsed_time, run.distance),
    energy: estimateEnergyLevel(paceSecPerKm)
  };
}

function buildPrompt(firstRun, latestRun) {
  return `
You are a friendly, motivating, and insightful running coach.

Compare the two runs provided below and generate only:

1. A markdown table comparing:
   - **Date**
   - **Distance (km)**
   - **Pace (min/km)**
   - **Energy Level**

2. A concise and motivating summary that:
   - Highlights improvements or consistency in distance and pace.
   - Comments on the runner's energy effort level.
   - Suggests a goal or milestone for the next run based on the trend.

Avoid generic statements—be specific to the data. Keep the tone supportive and encouraging.

Run 1: ${JSON.stringify(firstRun)}

Run 2: ${JSON.stringify(latestRun)}
  `;
}

function buildChartUrl(runs) {
  if (!Array.isArray(runs) || runs.length === 0) {
    throw new Error('Invalid run data provided to buildChartUrl');
  }

  const labels = runs.map(run => new Date(run.start_date).toLocaleDateString());
  const distances = runs.map(run => parseFloat((run.distance / 1000).toFixed(2)));
  const pace = runs.map(run => parseFloat((run.elapsed_time / (run.distance / 1000) / 60).toFixed(2)));

  const chartConfig = {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Distance (km)',
          data: distances,
          yAxisID: 'y1'
        },
        {
          label: 'Pace (min/km)',
          data: pace,
          yAxisID: 'y2'
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y1: {
          type: 'linear',
          position: 'left',
          title: {
            display: true,
            text: 'Distance (km)'
          }
        },
        y2: {
          type: 'linear',
          position: 'right',
          title: {
            display: true,
            text: 'Pace (min/km)'
          },
          grid: {
            drawOnChartArea: false
          }
        }
      },
      plugins: {
        title: {
          display: true,
          text: 'Run Distance and Pace Over Time'
        }
      }
    }
  };

  const encoded = encodeURIComponent(JSON.stringify(chartConfig));
  return `https://quickchart.io/chart?config=${encoded}`;
}

async function openaiInsightFromRuns(rawFirstRun, rawLatestRun) {
  const firstRun = prepareRun(rawFirstRun);
  const latestRun = prepareRun(rawLatestRun);
  const prompt = buildPrompt(firstRun, latestRun);

  try {
    const openaiRes = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a friendly and motivating running coach.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7
    }, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return openaiRes.data.choices[0].message.content.trim();

  } catch (openaiError) {
    console.warn('OpenAI failed, falling back to Together.ai:', openaiError.response?.data || openaiError.message);
  }

  try {
    const togetherRes = await axios.post('https://api.together.xyz/v1/chat/completions', {
      model: 'mistralai/Mistral-7B-Instruct-v0.1',
      messages: [
        { role: 'system', content: 'You are a friendly and motivating running coach.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7
    }, {
      headers: {
        Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return marked(togetherRes.data.choices[0].message.content.trim());

  } catch (togetherError) {
    console.error('Together.ai also failed:', togetherError.response?.data || togetherError.message);
    return "You're making great progress! Keep it up! 🏃‍♀️";
  }
}

module.exports = { openaiInsightFromRuns, buildChartUrl };
