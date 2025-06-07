const { getISTTime } = require("../utils/formatUtils");

class HomeController {
  async landingPage(ctx) {
    console.log(`Rendering landing page at ${getISTTime()}`);
    ctx.type = "html";
    ctx.body = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Sindhu's Stride</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
                           Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
              text-align: center;
              padding: 2rem;
              background: #fff;
              color: #333;
            }
            h1 { font-size: 2rem; }
            p { font-size: 1.1rem; margin: 1rem 0; line-height: 1.5;}
            .cta {
              background: #fc4c02;
              color: white;
              padding: 1rem 2rem;
              font-size: 1.2rem;
              text-decoration: none;
              border-radius: 8px;
              display: inline-block;
              margin-top: 2rem;
              border-radius: 999px;
            }
          </style>
        </head>
        <body>
          <h2>🏃‍♀️ Welcome to Sindhu’s Stride</h2>
          <div style="background: #fffbe6; border-radius: 12px; padding: 2rem; margin: 2rem auto; max-width: 600px;box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);">
          <p>See how far you’ve come in your running journey. Your runs have a story. Let’s tell it.</p>
          <p>Authorize with Strava and get a personalized progress report you can share with friends or your coach!</p>
          <p>This is a fun, privacy-first app. We don’t store any of your personal info or Strava data. It’s all about you and your journey.</p>
           <p style="font-size: 1rem; margin-bottom: 2rem;">
            🙌 Good vibes only ❤️💪😊
          </p>
          </div>
          <a class="cta" href="/auth/strava">Connect with Strava</a>
        </body>
        </html>
      `;
  }
}

module.exports = new HomeController();
