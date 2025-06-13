const axios = require("axios");
const { prepareRun } = require("../utils/formatUtils");
const logToGoogleSheet = require("../services/logToGoogleSheet");

function buildPrompt(firstRun, latestRun, allRuns) {
  return `
You are a friendly and supportive running buddy who writes short, uplifting progress notes.

Write a two-paragraph message separated by a line break (\\n\\n):
- In the **first paragraph**, reflect on the runner’s journey from their first to latest run. Celebrate improvements in pace (min/km), distance (km), endurance, or consistency. Mention the total number of runs if it adds to the story. Use a warm, proud tone. Keep it personal and concise — around 3–5 sentences.
- In the **second paragraph**, hype them up for what’s ahead! Be playful, energetic, and encouraging — like a best friend cheering from the sidelines. Add some spark and fun. Keep it concise.

First Run: ${JSON.stringify(firstRun)}
Latest Run: ${JSON.stringify(latestRun)}
All Runs Count: ${allRuns?.length}
  `;
}

async function openaiInsightFromRuns(rawFirstRun, rawLatestRun, runs) {
  const firstRun = prepareRun(rawFirstRun);
  const latestRun = prepareRun(rawLatestRun);
  const prompt = buildPrompt(firstRun, latestRun, runs);

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
      markdownInsight: openaiRes.data.choices[0].message.content.trim(),
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
      markdownInsight: togetherRes.data.choices[0].message.content.trim(),
      modelUsed: "Together.ai Mistral-7B-Instruct",
    };
  } catch (togetherError) {
    console.error(
      "Together.ai also failed:",
      togetherError.response?.data || togetherError.message,
    );
    return {
      markdownInsight: "You're making great progress! Keep it up! 🏃‍♀️",
      modelUsed: "Fallback message plain text",
    };
  }
}

module.exports = { openaiInsightFromRuns };
