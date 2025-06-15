const axios = require("axios");
const { prepareRun } = require("../utils/formatUtils");
const logToGoogleSheet = require("../services/logToGoogleSheet");
const { formatISO, startOfISOWeek } = require("date-fns");

function getRandomBreakfastLine() {
  const breakfastItems = [
    "fluffy idlis with sambhar and chutney and a strong filter coffee",
    "crispy masala dosas straight off the tawa and a strong filter coffee ",
    "a warm bowl of pongal with ghee and a strong filter coffee",
    "soft appams with coconut milk ",
    "steaming hot upma with veggies and a strong filter coffee ",
    "masala uttapam with chutney and love and filter coffee ",
    "neer dosas and a light coconut chutney ",
    "a handful of paniyarams — crispy outside, soft inside with filter coffee",
    "khara bath with a strong cup of filter coffee ☕",
    "a quick bite of medu vada dunked in sambhar and filter coffee",
    "hot steaming aloo parathas with masala chai",
  ];
  const picked =
    breakfastItems[Math.floor(Math.random() * breakfastItems.length)];
  return `Now go refuel with ${picked} — you’ve earned it 😋`;
}

function buildPrompt(runs, firstRun, lastRun) {
  if (!runs || runs.length === 0) return "No data available yet.";

  const formatRunSummary = (run) => {
    if (!run) return "No data.";
    const date = new Date(run.start_date).toDateString();
    const distance = (run.distance / 1000).toFixed(2);
    const pace =
      run.moving_time && run.distance
        ? (run.moving_time / 60 / (run.distance / 1000)).toFixed(2)
        : "N/A";
    return `Date: ${date}, Distance: ${distance} km, Pace: ${pace} min/km`;
  };

  const currentYear = new Date().getFullYear();
  const runsThisYear = runs.filter(
    (run) => new Date(run.start_date).getFullYear() === currentYear,
  );

  const countByCategory = {
    "5k": 0,
    "10k": 0,
    half: 0,
    full: 0,
  };

  runsThisYear.forEach((run) => {
    const km = run.distance / 1000;
    if (km >= 4.5 && km < 5.5) countByCategory["5k"]++;
    else if (km >= 9.5 && km < 10.5) countByCategory["10k"]++;
    else if (km >= 20 && km < 22.5) countByCategory["half"]++;
    else if (km >= 41 && km <= 43.5) countByCategory["full"]++;
  });

  const totalKm =
    runs.reduce((sum, run) => sum + (run.distance || 0), 0) / 1000;
  const totalTime = runs.reduce((sum, run) => sum + (run.moving_time || 0), 0);
  const avgPace = totalTime / 60 / totalKm;

  const firstRunDate = runs[0]?.start_date?.slice(0, 10);
  const lastRunDate = runs[runs.length - 1]?.start_date?.slice(0, 10);
  const fastestPace = getFastestPace(runs);

  const weeklyMap = new Map();
  const dayFrequency = Array(7).fill(0);
  const hourFrequency = Array(24).fill(0);
  const monthMap = new Map();

  let longestRun = runs[0];
  runs.forEach((run) => {
    const date = new Date(run.start_date);
    const week = formatISO(startOfISOWeek(date), { representation: "date" });
    if (!weeklyMap.has(week)) weeklyMap.set(week, []);
    weeklyMap.get(week).push(run);
    dayFrequency[date.getDay()]++;
    hourFrequency[date.getHours()]++;
    const month = date.toLocaleString("default", {
      month: "long",
      year: "numeric",
    });
    monthMap.set(month, (monthMap.get(month) || 0) + (run.distance || 0));
    if (run.distance > longestRun.distance) longestRun = run;
  });

  const weeklyData = Array.from(weeklyMap.entries()).map(([week, weekRuns]) => {
    const distance =
      weekRuns.reduce((sum, r) => sum + (r.distance || 0), 0) / 1000;
    const avgPace =
      weekRuns.reduce(
        (sum, r) => sum + r.moving_time / (r.distance / 1000),
        0,
      ) /
      weekRuns.length /
      60;
    return {
      week,
      distance: +distance.toFixed(2),
      avgPace: +avgPace.toFixed(2),
    };
  });

  const recentPaces = weeklyData.slice(-6).map((d) => d.avgPace);
  const recentDistances = weeklyData.slice(-6).map((d) => d.distance);

  const funFacts = [];
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const mostRunDayIdx = dayFrequency.indexOf(Math.max(...dayFrequency));
  if (dayFrequency[mostRunDayIdx] > 1)
    funFacts.push(`They run most often on ${dayNames[mostRunDayIdx]}s.`);
  const morningRuns = hourFrequency.slice(5, 9).reduce((a, b) => a + b, 0);
  if (morningRuns > runs.length / 2)
    funFacts.push("They prefer running in the early mornings.");
  if (monthMap.size > 0) {
    const peakMonth = [...monthMap.entries()].sort((a, b) => b[1] - a[1])[0];
    funFacts.push(`Their highest mileage month was ${peakMonth[0]}.`);
  }

  const isBeginner = runs.length <= 15;

  const firstKm = firstRun?.distance / 1000 || 0;
  const longestKm = longestRun?.distance / 1000 || 0;
  const paceFirst =
    firstRun?.moving_time && firstRun?.distance
      ? firstRun.moving_time / (firstRun.distance / 1000) / 60
      : null;
  const paceChange =
    paceFirst && fastestPace ? (paceFirst - fastestPace).toFixed(2) : null;

  if (isBeginner) {
    return `
You are a friendly and supportive running coach who writes short, encouraging progress notes.

The runner has two runs: their very first and their most recent. Write a warm, motivational paragraph celebrating their progress. Highlight any improvements in pace (min/km), distance (km), or overall consistency.

Use a personal and positive tone. Mention key stats if helpful — but keep it simple, uplifting, and easy to read. Avoid bullet points or tables. Keep it concise.

First Run: ${JSON.stringify(firstRun)}
Longest Run: ${JSON.stringify(lastRun)}`;
  }

  return `
Runner Journey:
  Latest Run: ${JSON.stringify(lastRun)}
- Fastest pace: ${fastestPace ? `${fastestPace.toFixed(2)} min/km` : "N/A"}
- First run: ${firstRunDate}, Last run: ${lastRunDate}
- Average pace: ${avgPace.toFixed(2)} min/km
- Longest run: ${longestKm.toFixed(2)} km
- 5Ks in ${currentYear}: ${countByCategory["5k"]}
- 10Ks in ${currentYear}: ${countByCategory["10k"]}
- Half marathons in ${currentYear}: ${countByCategory["half"]}
- Full marathons in ${currentYear}: ${countByCategory["full"]}
- Weekly pace trend (last 6): [${recentPaces.join(", ")}]
- Weekly distance trend (last 6): [${recentDistances.join(", ")}]

Stats and Insights:
${funFacts
  .slice(0, 5)
  .map((f) => "- " + f)
  .join("\n")}

You are a seasoned running coach who offers personalized, data-driven encouragement to experienced runners.

This runner has logged ${runs.length} runs covering over ${totalKm.toFixed(0)} km. Write a motivating note(max 130 words) that:

- Reflects their training consistency and discipline
- Highlights their growth, effort, and resilience
- Mentions category achievements in numbers (10Ks, half, full etc.) in ${currentYear}
- Includes observations from recent pace/distance trends
- Reflect on how their pace or distance has changed compared to when they started
- Compares their first run with their longest run
- Feels like a warm, supportive nudge to keep going. Use a positive, fun and cheerful tone.`;
}

// Fastest pace helper
function getFastestPace(allRuns) {
  let fastest = Infinity;
  allRuns.forEach((run) => {
    if (run.distance > 0 && run.moving_time > 0) {
      const pace = run.moving_time / 60 / (run.distance / 1000); // min/km
      if (pace < fastest) fastest = pace;
    }
  });
  return fastest === Infinity ? null : fastest;
}

async function openaiInsightFromRuns(rawFirstRun, rawLatestRun, runs) {
  const firstRun = prepareRun(rawFirstRun);
  const latestRun = prepareRun(rawLatestRun);
  const prompt = buildPrompt(runs, firstRun, latestRun);
  const foodLine = getRandomBreakfastLine();

  try {
    const openaiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a friendly and motivating running coach.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );
    return {
      markdownInsight: `<p>${openaiRes.data.choices[0].message.content.trim()}</p><p>${foodLine}</p>`,
      modelUsed: "OpenAI GPT-3.5 Turbo",
    };
  } catch (openaiError) {
    console.warn(
      "OpenAI failed, falling back to Together.ai:",
      openaiError.response?.data || openaiError.message,
    );
  }

  try {
    const togetherRes = await axios.post(
      "https://api.together.xyz/v1/chat/completions",
      {
        model: "mistralai/Mistral-7B-Instruct-v0.1",
        messages: [
          {
            role: "system",
            content: "You are a friendly and motivating running coach.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );
    return {
      markdownInsight: `<p>${togetherRes.data.choices[0].message.content.trim()}</p><p>${foodLine}</p>`,
      modelUsed: "Together.ai Mistral-7B-Instruct",
    };
  } catch (togetherError) {
    console.error(
      "Together.ai also failed:",
      togetherError.response?.data || togetherError.message,
    );
    return {
      markdownInsight: `<p>You're making great progress! Keep it up! 🏃‍♀️</p><p>${foodLine}</p>`,
      modelUsed: "Fallback message plain text",
    };
  }
}

module.exports = { openaiInsightFromRuns };
