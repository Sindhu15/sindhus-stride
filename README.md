# 🏃‍♀️ Sindhu's Stride

**Sindhu's Stride** is a beginner-friendly, privacy-first running insights app that connects with Strava to generate fun and motivational running progress reports.

Built with love to celebrate every runner’s journey — from their very first run to their latest milestone.

## Motivation

I recently picked up running, and hitting my first non-stop 10K was a milestone I’ll never forget. When I compared it with my very first Strava run, I realized how far I had come and it made me truly happy. This app is built so that other runners could feel that same joy in their progress.

## Try it out here

**Link:** [https://sindhus-stride.onrender.com/](https://sindhus-stride.onrender.com/)  
**Pre-requisite:** A Strava account with logged runs

---

## Features

- **Strava OAuth Integration** — securely connect your Strava account
- **Progress Report** — compare first and latest run (distance, pace, date)
- **Charts** — line graph visualizing your running journey using QuickChart
- **AI Insights** — optional motivational summary (OpenAI or Together AI)
- **Privacy First** — no data stored; all insights are generated client-side

---

## Tech Stack

- **Backend:** Node.js + Koa
- **Frontend:** HTML/CSS (responsive), vanilla JS
- **Integrations:**
  - Strava API (OAuth + Activities)
  - OpenAI (with fallback to Together AI)
  - QuickChart (for journey graphs)
- **Deployment:**
  - Render

---

## Folder Structure

```
/controllers       → Route handlers (Strava, Insight)
/routes            → Koa routers
/services          → Logic for Strava & AI data handling
/utils             → Helper methods
.env               → OAuth + API secrets (ignored)
app.js             → Main Koa server setup
```

---

## 📝 How It Works

1. **User visits landing page**
2. Clicks **"Connect with Strava"** → OAuth flow
3. On redirect, backend fetches strava runs
4. AI compares first vs. latest run
5. Generates:
   - Pace + distance table
   - Journey line chart
   - Longest/Fastest run
   - Total runs + motivational tagline
6. Entire report rendered as HTML → can be downloaded as image

---

## 🔒 Privacy Note

This app is for fun and personal motivation. We do **not store** your personal information or Strava activity data.

---

## Note

**Phase 1**  
These features were built quickly just before a race, so my running buddies could view their progress reports right after the marathon. That’s why the MVP uses plain HTML, CSS, and vanilla JS — fast, simple, and focused on getting it out there.

**Phase 2**

- Enhance to compare any two runs
- Coach verified feedback loop
- TBD

---

## ✨ Created by Sindhu

Just a dev who is into fitness and slowly falling in love with running

---

## 📄 License

MIT
