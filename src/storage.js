const BEST_TIMES_KEY = 'karambe-water-run-best-times';
const BEST_TOTAL_KEY = 'karambe-water-run-best-total';
const FULL_RUN_UNLOCK_KEY = 'karambe-water-run-full-clear';

const validTime = (value) => {
  const time = Number(value);
  return Number.isFinite(time) && time >= 0 ? time : 0;
};

export function createRecordStore(enabled, levelCount) {
  const load = () => {
    if (!enabled) return { bestTimes: [], bestTotal: 0, fullRunUnlocked: false };
    let bestTimes = [];
    try {
      const stored = JSON.parse(localStorage.getItem(BEST_TIMES_KEY) || '[]');
      bestTimes = Array.isArray(stored) ? stored.slice(0, levelCount).map(validTime) : [];
    } catch {}
    let bestTotal = 0;
    let fullRunUnlocked = false;
    try {
      bestTotal = validTime(localStorage.getItem(BEST_TOTAL_KEY));
      fullRunUnlocked = localStorage.getItem(FULL_RUN_UNLOCK_KEY) === '1';
    } catch {}
    return { bestTimes, bestTotal, fullRunUnlocked };
  };

  const write = (key, value) => {
    if (!enabled) return;
    try { localStorage.setItem(key, value); } catch {}
  };

  return {
    load,
    saveBestTimes: (times) => write(BEST_TIMES_KEY, JSON.stringify(times)),
    saveBestTotal: (time) => write(BEST_TOTAL_KEY, String(time)),
    saveFullRunUnlocked: () => write(FULL_RUN_UNLOCK_KEY, '1')
  };
}
