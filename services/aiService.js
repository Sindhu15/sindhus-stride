const axios = require('axios');
const { prepareRun } = require('../utils/formatUtils');

function buildPrompt(firstRun, latestRun) {
    return `
  You are a motivational running coach.
  
  Given two runs with improved pace or distance, write a short encouraging note that reflects how the runner is improving, consistent, or dedicated. No table, just a friendly paragraph.
  
  Run 1: ${JSON.stringify(firstRun)}
  
  Run 2: ${JSON.stringify(latestRun)}
    `;
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

    return togetherRes.data.choices[0].message.content.trim();

  } catch (togetherError) {
    console.error('Together.ai also failed:', togetherError.response?.data || togetherError.message);
    return "You're making great progress! Keep it up! 🏃‍♀️";
  }
}

module.exports = { openaiInsightFromRuns };
