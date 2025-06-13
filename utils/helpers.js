const { formatISO, startOfISOWeek } = require("date-fns");

function getLongestWeeklyStreakWithRange(runs) {
  if (!runs || runs.length === 0)
    return {
      longestStreak: 0,
      rangeStart: null,
      rangeEnd: null,
      streakWeeks: [],
    };

  const weekMap = new Map();

  runs.forEach((run) => {
    const date = new Date(run.start_date);
    const day = date.getUTCDay(); // Sunday = 0
    const mondayDiff = date.getUTCDate() - day + (day === 0 ? -6 : 1); // to Monday
    const weekStart = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), mondayDiff),
    );
    weekStart.setUTCHours(0, 0, 0, 0);

    const weekStartStr = weekStart.toISOString().slice(0, 10);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6); // Sunday

    if (!weekMap.has(weekStartStr)) {
      weekMap.set(weekStartStr, {
        start: weekStartStr,
        end: weekEnd.toISOString().slice(0, 10),
      });
    }
  });

  const sortedWeeks = [...weekMap.keys()].sort();

  let longestStreak = 1;
  let currentStreak = 1;
  let currentStreakWeeks = [weekMap.get(sortedWeeks[0])];
  let bestStreakWeeks = [...currentStreakWeeks];

  for (let i = 1; i < sortedWeeks.length; i++) {
    const prevWeek = new Date(sortedWeeks[i - 1]);
    const currWeek = new Date(sortedWeeks[i]);

    const diffInDays = (currWeek - prevWeek) / (1000 * 60 * 60 * 24);
    if (diffInDays === 7) {
      currentStreak++;
      currentStreakWeeks.push(weekMap.get(sortedWeeks[i]));
      if (currentStreak > longestStreak) {
        longestStreak = currentStreak;
        bestStreakWeeks = [...currentStreakWeeks];
      }
    } else {
      currentStreak = 1;
      currentStreakWeeks = [weekMap.get(sortedWeeks[i])];
    }
  }

  const streakDetails = {
    longestStreak,
    rangeStart: bestStreakWeeks[0]?.start || null,
    rangeEnd: bestStreakWeeks.at(-1)?.end || null,
    streakWeeks: bestStreakWeeks,
  };

  // Format to "Month, Year"
  const formatMonthYear = (isoDateStr) => {
    const date = new Date(isoDateStr);
    return date.toLocaleString("default", { month: "long", year: "numeric" });
  };

  const formattedStart = formatMonthYear(streakDetails.rangeStart);
  const formattedEnd = formatMonthYear(streakDetails.rangeEnd);

  return `<b>${longestStreak} weeks in a row 🔥</b> - longest weekly streak you've maintained , logging at least one run every single week from <b>${formattedStart} to ${formattedEnd} </b>. That’s real commitment!`;
}

function getRunnerTitleWithDescription(name, allRuns) {
  const totalRuns = allRuns.length;
  const totalKm = +(
    allRuns.reduce((sum, run) => sum + (run.distance || 0), 0) / 1000
  ).toFixed(1);
  const fastestPace = getFastestPace(allRuns); // in min/km

  // Tier: Adjective
  let adjective = "Curious";
  if (totalKm > 5000 || totalRuns > 700) adjective = "Titan";
  else if (totalKm > 3500 || totalRuns > 500) adjective = "Mythic";
  else if (totalKm > 2000 || totalRuns > 350) adjective = "Elite";
  else if (totalKm > 1200 || totalRuns > 250) adjective = "Legendary";
  else if (totalKm > 800 || totalRuns > 180) adjective = "Unstoppable";
  else if (totalKm > 500 || totalRuns > 100) adjective = "Resilient";
  else if (totalKm > 300 || totalRuns > 70) adjective = "Steady";
  else if (totalKm > 150 || totalRuns > 40) adjective = "Driven";
  else if (totalKm > 50 || totalRuns > 20) adjective = "Rising";

  // Power Word
  let powerWord = "Runner";
  if (fastestPace && fastestPace < 3.5) powerWord = "Pro";
  else if (fastestPace < 4.2) powerWord = "Sprinter";
  else if (fastestPace < 5.2) powerWord = "Dasher";
  else if (totalKm > 300 || totalRuns > 100) powerWord = "Strider";
  else if (totalKm > 150 || totalRuns > 50) powerWord = "Charger";
  else powerWord = "Explorer";

  const runnerTitle = `${name}, the ${adjective} ${powerWord}! 🏅`;

  // Dynamic description
  const descriptionParts = [];
  if (totalKm >= 50) descriptionParts.push(`over ${Math.round(totalKm)} km`);
  if (totalRuns >= 20) descriptionParts.push(`${totalRuns}+ runs`);
  if (fastestPace)
    descriptionParts.push(`a top pace of ${fastestPace.toFixed(2)} min/km`);

  const description =
    descriptionParts.length > 0
      ? `You've logged ${descriptionParts.join(", ")}. This is ${adjective.toLowerCase()} level dedication.`
      : "Your journey has just begun. Keep going!";

  return { runnerTitle, description };
}

function getWeeklyPaceData(runs) {
  const weeklyData = new Map();

  runs.forEach((run) => {
    const date = new Date(run.start_date);
    const weekKey = formatISO(startOfISOWeek(date), { representation: "date" }); // e.g., "2024-05-13"
    const pace = run.moving_time / (run.distance / 1000); // seconds/km

    if (!weeklyData.has(weekKey)) {
      weeklyData.set(weekKey, { totalPace: 0, count: 0 });
    }

    const week = weeklyData.get(weekKey);
    week.totalPace += pace;
    week.count += 1;
  });

  // Now format into an array for charting
  const chartData = Array.from(weeklyData.entries()).map(([week, data]) => ({
    week,
    avgPace: +(data.totalPace / data.count / 60).toFixed(2), // pace in minutes/km
  }));

  return chartData.sort((a, b) => new Date(a.week) - new Date(b.week));
}

module.exports = {
  getLongestWeeklyStreakWithRange,
  getRunnerTitle,
  getWeeklyPaceData,
};
