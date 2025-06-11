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

function getRunnerAdjective({ averagePace, totalRuns, totalKm, longestRunKm }) {
  const adjectives = [];

  // Pace categories (lower = faster)
  if (averagePace <= 6) adjectives.push("Blazing");
  else if (averagePace <= 7) adjectives.push("Swift");
  else if (averagePace <= 8.5) adjectives.push("Steady");
  else adjectives.push("Determined");

  // Distance/endurance
  if (longestRunKm >= 10 || totalKm > 100) adjectives.push("Enduring");
  else if (longestRunKm >= 5) adjectives.push("Resilient");
  else adjectives.push("Gritty");

  // Consistency
  if (totalRuns >= 20) adjectives.push("Disciplined");
  else if (totalRuns >= 10) adjectives.push("Committed");
  else adjectives.push("Passionate");

  // Combine randomly from the pool
  const finalAdjective =
    adjectives[Math.floor(Math.random() * adjectives.length)];
  return finalAdjective;
}

module.exports = {
  getLongestWeeklyStreakWithRange,
};
