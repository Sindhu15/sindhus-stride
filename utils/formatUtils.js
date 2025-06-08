const getISTTime = () => {
  return new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour12: false,
  });
};

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

function getLongestRun(runs) {
  return runs.sort((a, b) => b.distance - a.distance)[0];
}

function getBestPaceRun(runs) {
  return runs
    .filter(run => run.distance > 2000) // Only meaningful runs
    .sort((a, b) => {
      const paceA = a.moving_time / (a.distance / 1000); // min/km
      const paceB = b.moving_time / (b.distance / 1000);
      return paceA - paceB; // ascending = faster pace first
    })[0];
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

const formatDate = (d) =>
    new Date(d).toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

// Generates a Running Journey section with longest run, fastest pace, total runs, and a line chart of all runs
function generateRunningJourneySection(allRuns) {
  const formatPace = (movingTimeSec, distanceMeters) => {
    if (!movingTimeSec || !distanceMeters || distanceMeters === 0) return "—";
    const paceSecPerKm = movingTimeSec / (distanceMeters / 1000);
    const min = Math.floor(paceSecPerKm / 60);
    const sec = Math.round(paceSecPerKm % 60);
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  if (!allRuns || allRuns.length === 0) return "";

  const firstRun = allRuns[0];
  const totalRuns = allRuns.length;
  const longestRun = allRuns.reduce((a, b) =>
    a.distance > b.distance ? a : b,
  );
  const fastestRun = allRuns.reduce((a, b) => {
    const paceA = a.moving_time / (a.distance / 1000);
    const paceB = b.moving_time / (b.distance / 1000);
    return paceA < paceB ? a : b;
  });

  const firstRunText = `<b>${(firstRun.distance / 1000).toFixed(1)}K</b> at a pace of <strong>${formatPace(firstRun.moving_time, firstRun.distance)}</strong> on <strong>${formatDate(firstRun.start_date)}</strong>`
  const longestRunText = `<b>${(longestRun.distance / 1000).toFixed(1)}K</b> on <strong>${formatDate(longestRun.start_date)}</strong>`;
  const totalDistanceKm = (
    allRuns.reduce((acc, run) => acc + run.distance, 0) / 1000
  ).toFixed(1);
  const fastestRunText = `<b>${formatPace(fastestRun.moving_time, fastestRun.distance)}min/km</b> on <strong>${formatDate(fastestRun.start_date)}</strong>`;

  const milestoneTable = getMileStoneTable(firstRun, longestRun, fastestRun);
  return `
    <div>
      <h4>Your Running Journey So Far 🛤️</h4>
      <p>🏃‍♀️ <strong>Total Runs:</strong> <strong>${totalRuns}</strong> covering <strong>${totalDistanceKm} kms</strong>. Every step counts, and you've taken many!</p>
      <p> ${milestoneTable}
    </div>
  `;
}

const formatTime = (seconds) => {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min}m ${sec}s`;
};

function getMileStoneTable(firstRun, longestRun, fastestRun) {
  return  `<table style="width:100%; border-collapse: collapse; margin-top: 10px;">
      <thead>
        <tr>
          <th style="border: 1px solid #ddd; padding: 8px;">Milestone</th>
          <th style="border: 1px solid #ddd; padding: 8px;">Date</th>
          <th style="border: 1px solid #ddd; padding: 8px;">Distance</th>
          <th style="border: 1px solid #ddd; padding: 8px;">Pace</th>
          <th style="border: 1px solid #ddd; padding: 8px;">Time</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px;">First Run</td>
          <td style="border: 1px solid #ddd; padding: 8px;">${formatDate(firstRun.start_date)}</td>
          <td style="border: 1px solid #ddd; padding: 8px;">${(firstRun.distance / 1000).toFixed(1)}K</td>
          <td style="border: 1px solid #ddd; padding: 8px;">${formatPace(firstRun.moving_time, firstRun.distance)} min/km</td>
          <td style="border: 1px solid #ddd; padding: 8px;">${formatTime(firstRun.moving_time)}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px;">Longest Run</td>
          <td style="border: 1px solid #ddd; padding: 8px;">${formatDate(longestRun.start_date)}</td>
          <td style="border: 1px solid #ddd; padding: 8px;">${(longestRun.distance / 1000).toFixed(1)}K</td>
          <td style="border: 1px solid #ddd; padding: 8px;">${formatPace(longestRun.moving_time, longestRun.distance)} min/km</td>
          <td style="border: 1px solid #ddd; padding: 8px;">${formatTime(longestRun.moving_time)}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px;">Fastest Pace</td>
          <td style="border: 1px solid #ddd; padding: 8px;">${formatDate(fastestRun.start_date)}</td>
          <td style="border: 1px solid #ddd; padding: 8px;">${(fastestRun.distance / 1000).toFixed(1)}K</td>
          <td style="border: 1px solid #ddd; padding: 8px;">${formatPace(fastestRun.moving_time, fastestRun.distance)} min/km</td>
          <td style="border: 1px solid #ddd; padding: 8px;">${formatTime(fastestRun.moving_time)}</td>
        </tr>
      </tbody>
    </table>`;
}

function generateChartUrl(allRuns) {
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
  return `<p><b>Your consistency in Kilometers 📊 </b></p>
          <img crossorigin="anonymous" src="${chartUrl}" style="width:100%; max-width:600px; margin-top: 2px; border-radius: 8px;" />`;
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
          <td style="text-align: center; padding: 10px;">${firstDistanceKm.toFixed(1) + 'K'}</td>
          <td style="text-align: center; padding: 10px;">${formatPace(firstRun.moving_time, firstRun.distance)}</td>
        </tr>
        <tr style="background-color: #fafafa; font-weight: bold;">
          <td style="padding: 10px;">Recent Long Run</td>
          <td style="padding: 10px;">${formatDate(latestRun.start_date)}</td>
          <td style="text-align: center; padding: 10px;">${latestDistanceKm.toFixed(1) + 'K'}</td>
          <td style="text-align: center; padding: 10px;">${formatPace(latestRun.moving_time, latestRun.distance)}</td>
        </tr>
      </tbody>
    </table>
  `;
}

async function fetchImageAsBase64(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result); // base64 string
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
module.exports = {
  formatPace,
  prepareRun,
  getQuickChartUrl,
  getConfidenceLevelText,
  generateRunningJourneySection,
  generateProgressTable,
  getISTTime,
  fetchImageAsBase64,
  getLongestRun,
  generateChartUrl
};
