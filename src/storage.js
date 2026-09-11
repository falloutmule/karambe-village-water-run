const BEST_TIMES_KEY = 'karambe-water-run-best-times';
const BEST_TOTAL_KEY = 'karambe-water-run-best-total';
const LEGACY_UNLOCK_KEY = 'karambe-water-run-full-clear';

const validTime = (value) => {
  const time = Number(value);
  return Number.isFinite(time) && time >= 0 ? time : 0;
};

export function createRecordStore(enabled, levelCount) {
  const load = () => {
    try { localStorage.removeItem(LEGACY_UNLOCK_KEY); } catch {}
    if (!enabled) return { bestTimes: [], bestTotal: 0 };
    try {
      const stored = JSON.parse(localStorage.getItem(BEST_TIMES_KEY) || '[]');
      return {
        bestTimes: Array.isArray(stored) ? stored.slice(0, levelCount).map(validTime) : [],
        bestTotal: validTime(localStorage.getItem(BEST_TOTAL_KEY))
      };
    } catch {
      return { bestTimes: [], bestTotal: 0 };
    }
  };

  const write = (key, value) => {
    if (!enabled) return;
    try { localStorage.setItem(key, value); } catch {}
  };

  return {
    load,
    saveBestTimes: (times) => write(BEST_TIMES_KEY, JSON.stringify(times)),
    saveBestTotal: (time) => write(BEST_TOTAL_KEY, String(time))
  };
}
