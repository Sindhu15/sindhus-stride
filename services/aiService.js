const axios = require("axios");
const { prepareRun } = require("../utils/formatUtils");
const logToGoogleSheet = require("../services/logToGoogleSheet");

function buildPrompt(firstRun, latestRun, allRuns) {
  return `
You are a friendly and supportive running friend who writes short, encouraging progress notes.

The runner has two runs: their very first and their most recent. Write a warm, motivational paragraph celebrating their progress. Highlight any improvements in pace (min/km), distance (km), endurance or overall consistency. 

Use a personal, positive, cheerful, fun tone. Mention key stats if helpful — but keep it simple, uplifting, and easy to read. Keep it concise. Be a fun and playful cheerleader. Make them feel good and proud of their journey!

First Run: ${JSON.stringify(firstRun)}

Latest Run: ${JSON.stringify(latestRun)}
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
