function formatPace(movingTimeSec, distanceMeters) {
  const paceSecPerKm = movingTimeSec / (distanceMeters / 1000); // seconds/km
  const min = Math.floor(paceSecPerKm / 60);
  const sec = Math.round(paceSecPerKm % 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function formatPaceChange(secondsDiff) {
  const sign = secondsDiff < 0 ? "-" : "";
  const absSec = Math.abs(secondsDiff);
  const min = Math.floor(absSec / 60);
  const sec = Math.round(absSec % 60);
  return `${min}:${sec.toString().padStart(2, "0")}/km`;
}

function prepareRun(run, referenceRun = null) {
  const distanceKm = run.distance / 1000;
  const paceSecPerKm = run.moving_time / distanceKm;
  const paceFormatted = formatPace(run.moving_time, run.distance);

  let change = "-";

  if (referenceRun) {
    const refDistanceKm = referenceRun.distance / 1000;
    const refPace = referenceRun.moving_time / refDistanceKm;
    const paceDiff = paceSecPerKm - refPace;

    change =
      paceDiff === 0
        ? "No change"
        : paceDiff < 0
          ? `Faster by ${formatPaceChange(paceDiff)}`
          : `Slower by ${formatPaceChange(paceDiff)}`;
  }

  return {
    date: new Date(run.start_date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    distance: distanceKm.toFixed(1),
    pace: paceFormatted,
    change,
  };
}

function getQuickChartUrl(firstRun, latestRun, type = "pace") {
  const labels = [firstRun.date, latestRun.date];

  const data =
    type === "pace"
      ? [
          parseFloat(firstRun.pace.replace(":", ".")) || 0,
          parseFloat(latestRun.pace.replace(":", ".")) || 0,
        ]
      : [
          parseFloat(firstRun.distance) || 0,
          parseFloat(latestRun.distance) || 0,
        ];

  const chartConfig = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: type === "pace" ? "Pace (min/km)" : "Distance (km)",
          data,
          fill: false,
          tension: 0.3,
          borderColor:
            type === "pace" ? "rgba(75,192,192,1)" : "rgba(255,99,132,1)",
          backgroundColor: "white",
        },
      ],
    },
    options: {
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: type === "pace" ? "Pace Progress" : "Distance Progress",
        },
      },
      scales: {
        y: { beginAtZero: true },
      },
    },
  };

  const encoded = encodeURIComponent(JSON.stringify(chartConfig));
  return `https://quickchart.io/chart?c=${encoded}`;
}

function getConfidenceLevelText(firstRun, latestRun) {
  const firstPace = firstRun.moving_time / (firstRun.distance / 1000);
  const latestPace = latestRun.moving_time / (latestRun.distance / 1000);
  const diff = firstPace - latestPace;

  if (diff > 30) {
    return "You’ve made strong progress. Your pace has significantly improved — you're running with more confidence!";
  } else if (diff > 10) {
    return "You’re becoming more consistent and building confidence with every run.";
  } else if (diff > -5) {
    return "Even with a small dip in pace, your effort and commitment show you’re growing more confident.";
  } else {
    return "You're still early in your journey — keep showing up, and confidence will follow!";
  }
}

// Generates a Running Journey section with longest run, fastest pace, total runs, and a line chart of all runs
function generateRunningJourneySection(allRuns) {
  const formatDate = (d) =>
    new Date(d).toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const formatPace = (movingTimeSec, distanceMeters) => {
    if (!movingTimeSec || !distanceMeters || distanceMeters === 0) return "—";
    const paceSecPerKm = movingTimeSec / (distanceMeters / 1000);
    const min = Math.floor(paceSecPerKm / 60);
    const sec = Math.round(paceSecPerKm % 60);
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  if (!allRuns || allRuns.length === 0) return "";

  const totalRuns = allRuns.length;
  const longestRun = allRuns.reduce((a, b) =>
    a.distance > b.distance ? a : b,
  );
  const fastestRun = allRuns.reduce((a, b) => {
    const paceA = a.moving_time / (a.distance / 1000);
    const paceB = b.moving_time / (b.distance / 1000);
    return paceA < paceB ? a : b;
  });

  const longestRunText = `${(longestRun.distance / 1000).toFixed(2)} km on ${formatDate(longestRun.start_date)}`;
  const fastestRunText = `${formatPace(fastestRun.moving_time, fastestRun.distance)} on ${formatDate(fastestRun.start_date)}`;

  const labels = allRuns.map((r) => formatDate(r.start_date));
  const data = allRuns.map((r) => (r.distance / 1000).toFixed(2));

  const chartConfig = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Distance (km)",
          data,
          fill: true,
          tension: 0.4,
        },
      ],
    },
    options: {
      plugins: {
        title: { display: true, text: "Your Running Journey 📈" },
      },
      scales: {
        y: { beginAtZero: true },
      },
    },
  };

  const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(
    JSON.stringify(chartConfig),
  )}`;

  return `
    <div>
      <h4>Your Running Journey So Far 🛤️</h4>
      <p>🏃‍♀️ <strong>Total Runs:</strong> ${totalRuns} — Every step counts, and you've taken many!</p>
      <p>🏅 <strong>Longest Run:</strong> ${longestRunText}</p>
      <p>⚡ <strong>Fastest Pace:</strong> ${fastestRunText}</p>
      <img src="${chartUrl}" style="width:100%; max-width:600px; margin-top: 1em; border-radius: 8px;" />
    </div>
  `;
}

function generateProgressTable(firstRun, latestRun) {
  const formatDate = (dateStr) =>
    new Date(dateStr).toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const formatPace = (time, dist) => {
    if (!time || !dist || dist === 0) return "—";
    const paceSecPerKm = time / (dist / 1000);
    const min = Math.floor(paceSecPerKm / 60);
    const sec = Math.round(paceSecPerKm % 60);
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  const firstDistanceKm = Number(firstRun.distance) / 1000;
  const latestDistanceKm = Number(latestRun.distance) / 1000;

  return `
    <table style="width: 100%; border-collapse: collapse; font-size: 0.95em;">
      <thead>
        <tr style="background-color: #f4f4f4;">
          <th style="text-align: left; padding: 10px;">Run</th>
          <th style="text-align: left; padding: 10px;">Date</th>
          <th style="text-align: center; padding: 10px;">Distance (km)</th>
          <th style="text-align: center; padding: 10px;">Pace (min/km)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding: 10px;">First Run</td>
          <td style="padding: 10px;">${formatDate(firstRun.start_date)}</td>
          <td style="text-align: center; padding: 10px;">${firstDistanceKm.toFixed(1)}</td>
          <td style="text-align: center; padding: 10px;">${formatPace(firstRun.moving_time, firstRun.distance)}</td>
        </tr>
        <tr style="background-color: #fafafa; font-weight: bold;">
          <td style="padding: 10px;">Latest Run</td>
          <td style="padding: 10px;">${formatDate(latestRun.start_date)}</td>
          <td style="text-align: center; padding: 10px;">${latestDistanceKm.toFixed(1)}</td>
          <td style="text-align: center; padding: 10px;">${formatPace(latestRun.moving_time, latestRun.distance)}</td>
        </tr>
      </tbody>
    </table>
  `;
}

module.exports = {
  formatPace,
  prepareRun,
  getQuickChartUrl,
  getConfidenceLevelText,
  generateRunningJourneySection,
  generateProgressTable,
};
