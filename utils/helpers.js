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

  return `You've crushed a <b>${longestStreak}-week streak 🔥</b> from ${formattedStart} to ${formattedEnd} — pure consistency and grit!`;
}

function getRunnerTitle(name, allRuns) {
  const totalRuns = allRuns.length;
  const totalKm =
    allRuns.reduce((sum, run) => sum + (run.distance || 0), 0) / 1000; // Convert to km

  const fastestPaceMinPerKm = getFastestPace(allRuns);

  // Adjective: Combines totalKm and totalRuns for a more accurate profile
  let adjective = "Curious";
  if (totalKm > 1000 || totalRuns > 200) adjective = "Legendary";
  else if (totalKm > 700 || totalRuns > 150) adjective = "Unstoppable";
  else if (totalKm > 500 || totalRuns > 100) adjective = "Resilient";
  else if (totalKm > 300 || totalRuns > 70) adjective = "Steady";
  else if (totalKm > 150 || totalRuns > 40) adjective = "Driven";
  else if (totalKm > 50 || totalRuns > 20) adjective = "Rising";

  // Power Word: Prioritizes pace, then total km
  let powerWord = "Runner";
  if (fastestPaceMinPerKm < 4.5) powerWord = "Sprinter";
  else if (fastestPaceMinPerKm < 5.5) powerWord = "Dasher";
  else if (totalKm > 300 || totalRuns > 100) powerWord = "Strider";
  else if (totalKm > 150 || totalRuns > 50) powerWord = "Charger";
  else powerWord = "Explorer";

  return `🏅 ${name}, the ${adjective} ${powerWord}!`;
}

function getFastestPace(allRuns) {
  if (!allRuns || allRuns.length === 0) return null;

  let fastestPace = Infinity;

  allRuns.forEach((run) => {
    if (run.distance > 0 && run.moving_time > 0) {
      const paceInMinPerKm = run.moving_time / 60 / (run.distance / 1000); // min/km
      if (paceInMinPerKm < fastestPace) {
        fastestPace = paceInMinPerKm;
      }
    }
  });

  return fastestPace === Infinity ? null : parseFloat(fastestPace.toFixed(2));
}

module.exports = {
  getLongestWeeklyStreakWithRange,
  getRunnerTitle,
};
