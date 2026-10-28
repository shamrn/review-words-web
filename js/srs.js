export function ensureRuntimeDefaults(item) {
  if (typeof item.is_priority !== 'boolean') {
    item.is_priority = false;
  }
  if (typeof item.priority_countdown !== 'number') {
    item.priority_countdown = 0;
  }
  if (!item.word && item.phrase) {
    item.word = item.phrase;
  }
  return item;
}

export function pickPriorityReady(items, excludeIdx = null) {
  for (let i = 0; i < items.length; i++) {
    if (excludeIdx !== null && i === excludeIdx) continue;
    const it = items[i];
    if (it.is_priority && (it.priority_countdown || 0) <= 0) {
      return i;
    }
  }
  return null;
}

export function pickDueSequentialFromCursor(items, cursor, excludeIdx = null) {
  const n = items.length;
  if (n === 0) return [null, null];

  const now = new Date();
  const datedDue = [];

  for (let i = 0; i < n; i++) {
    if (excludeIdx !== null && i === excludeIdx) continue;
    const it = items[i];
    if (it.is_priority) continue;

    if (it.next_repeat) {
      const dt = new Date(it.next_repeat);
      if (!isNaN(dt.getTime()) && dt <= now) {
        datedDue.push({ index: i, date: dt });
      }
    }
  }

  if (datedDue.length > 0) {
    datedDue.sort((a, b) => a.date - b.date);
    return [datedDue[0].index, null];
  }

  for (let step = 0; step < n; step++) {
    const i = (cursor + step) % n;
    if (excludeIdx !== null && i === excludeIdx) continue;

    const it = items[i];
    if (it.is_priority) continue;

    if (!it.next_repeat) {
      return [i, (i + 1) % n];
    }
  }

  return [null, null];
}

export function tickPriorityCountdowns(items, excludeIdx = null) {
  for (let i = 0; i < items.length; i++) {
    if (excludeIdx !== null && i === excludeIdx) continue;
    const it = items[i];
    if (it.is_priority) {
      const c = Number(it.priority_countdown) || 0;
      if (c > 0) {
        it.priority_countdown = c - 1;
      }
    }
  }
}

export function getRandomPriorityCountdown(min = 3, max = 10) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function getStats(items) {
  const now = new Date();
  let due = 0;
  let newWords = 0;
  let learning = 0;
  let priority = 0;

  for (const it of items) {
    if (it.is_priority) {
      priority++;
      continue;
    }
    if (!it.next_repeat) {
      newWords++;
    } else {
      const dt = new Date(it.next_repeat);
      if (dt <= now) {
        due++;
      } else {
        learning++;
      }
    }
  }

  return {
    total: items.length,
    due,
    newWords,
    learning,
    priority
  };
}
