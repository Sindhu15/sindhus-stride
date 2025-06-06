class HomeController {
    async landingPage(ctx) {
      ctx.type = 'html';
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
            p { font-size: 1.1rem; margin: 1rem 0; }
            .cta {
              background: #fc4c02;
              color: white;
              padding: 1rem 2rem;
              font-size: 1.2rem;
              text-decoration: none;
              border-radius: 8px;
              display: inline-block;
              margin-top: 2rem;
            }
          </style>
        </head>
        <body>
          <h1>🏃‍♀️ Welcome to Sindhu’s Stride</h1>
          <p>See how far you’ve come in your running journey. Your runs have a story. Let’s tell it.</p>
          <p>Authorize with Strava and get your report you can share!</p>
          <a class="cta" href="/auth/strava">Connect with Strava</a>
        </body>
        </html>
      `;
    }
  }
  
  module.exports = new HomeController();
  