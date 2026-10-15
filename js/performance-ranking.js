export function rankMetricLevels(entries, metric) {
  const direction = metric === "efficiency" ? -1 : 1;
  let rank = 0;
  return [...entries].sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    if (!a.available) return a.altitudeFt - b.altitudeFt;
    return direction * (a.value - b.value) || a.altitudeFt - b.altitudeFt;
  }).map((entry) => ({ ...entry, rank: entry.available ? ++rank : null }));
}
