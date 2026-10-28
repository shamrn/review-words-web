export const WORD_FIELDS = [
  'word', 'transcription', 'rus', 'next_repeat', 'is_priority',
  'priority_countdown', 'priority_due_counter',
];

export function normalizeWord(item, index = 0) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`Запись ${index + 1}: ожидается объект`);
  }
  const word = String(item.word || item.phrase || '').trim();
  const rus = String(item.rus || '').trim();
  if (!word || !rus) throw new Error(`Запись ${index + 1}: отсутствует слово или перевод`);
  const nextRepeat = item.next_repeat || null;
  if (nextRepeat && (typeof nextRepeat !== 'string' || Number.isNaN(Date.parse(nextRepeat)))) {
    throw new Error(`Запись ${index + 1}: неверная дата повторения`);
  }
  let id = item.entry_id ?? item.id;
  if (typeof id === 'number') id = `${item.phrase && !item.word ? 'phrase' : 'word'}:${id}`;
  if (id === undefined || id === null || id === '') id = crypto.randomUUID();
  const countdown = Number(item.priority_countdown || 0);
  const dueCounter = item.priority_due_counter == null ? null : Number(item.priority_due_counter);
  if (!Number.isSafeInteger(countdown) || (dueCounter !== null && !Number.isSafeInteger(dueCounter))) {
    throw new Error(`Запись ${index + 1}: неверный счётчик повторения`);
  }
  return {
    id: String(id), word, transcription: String(item.transcription || '').trim(), rus,
    next_repeat: nextRepeat,
    is_priority: item.is_priority === true,
    priority_countdown: Math.max(0, countdown),
    priority_due_counter: dueCounter,
  };
}

export function parseWords(json) {
  const rows = typeof json === 'string' ? JSON.parse(json) : json;
  if (!Array.isArray(rows)) throw new Error('JSON должен содержать массив записей');
  const result = rows.map(normalizeWord);
  const ids = new Set();
  for (const item of result) {
    if (ids.has(item.id)) throw new Error(`Повторяющийся ID: ${item.id}`);
    ids.add(item.id);
  }
  return result;
}

export function toDatabaseWord(item, userId) {
  const row = { entry_id: String(item.id), user_id: userId };
  for (const field of WORD_FIELDS) row[field] = item[field];
  return row;
}

export function fromDatabaseWord(row) {
  return normalizeWord({ ...row, id: row.entry_id });
}
