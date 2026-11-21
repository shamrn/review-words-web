function assert(condition, message) {
  if (!condition) {
    throw new Error('FAILED: ' + message);
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`FAILED: ${message} (ожидалось: ${expected}, получено: ${actual})`);
  }
}

import {
  ensureRuntimeDefaults,
  pickPriorityReady,
  pickDueSequentialFromCursor,
  tickPriorityCountdowns,
  getRandomPriorityCountdown,
  getStats,
} from '../js/srs.js';

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    print(`  ✓ ${name}`);
  } catch (err) {
    print(`  ✗ ${name}: ${err.message}`);
  }
}

print('=== ЗАПУСК ТЕСТОВ SRS ===\n');

test('ensureRuntimeDefaults: нормализация полей', () => {
  const item = { phrase: 'test phrase', rus: 'тест' };
  ensureRuntimeDefaults(item);
  assertEquals(item.is_priority, false, 'is_priority должен быть false');
  assertEquals(item.priority_countdown, 0, 'priority_countdown должен быть 0');
  assertEquals(item.word, 'test phrase', 'word должен браться из phrase');
});

test('pickPriorityReady: выбор только готовых приоритетных карточек', () => {
  const items = [
    { word: 'w1', is_priority: true, priority_countdown: 3 },
    { word: 'w2', is_priority: false },
    { word: 'w3', is_priority: true, priority_countdown: 0 },
  ];

  const readyIdx = pickPriorityReady(items, null);
  assertEquals(readyIdx, 2, 'Должен выбраться индекс 2 с countdown <= 0');

  const excludeIdx = pickPriorityReady(items, 2);
  assertEquals(excludeIdx, null, 'Должен вернуть null, если индекс исключен');
});

test('pickDueSequentialFromCursor: приоритет карточек с наступившим сроком', () => {
  const pastDate1 = new Date(Date.now() - 3600000).toISOString();
  const pastDate2 = new Date(Date.now() - 7200000).toISOString();

  const items = [
    { word: 'new1', next_repeat: null, is_priority: false },
    { word: 'due1', next_repeat: pastDate1, is_priority: false },
    { word: 'due2', next_repeat: pastDate2, is_priority: false },
  ];

  const [idx, nextCur] = pickDueSequentialFromCursor(items, 0, null);
  assertEquals(idx, 2, 'Должен выбраться due2 (самый ранний срок повторения)');
  assertEquals(nextCur, null, 'Для просроченных карточек nextCursor должен быть null');
});

test('pickDueSequentialFromCursor: последовательный перебор новых слов по курсору', () => {
  const items = [
    { word: 'w0', next_repeat: null, is_priority: false },
    { word: 'w1', next_repeat: null, is_priority: false },
    { word: 'w2', next_repeat: null, is_priority: false },
  ];

  const [idx, nextCur] = pickDueSequentialFromCursor(items, 1, null);
  assertEquals(idx, 1, 'Должен вернуть слово под курсором 1');
  assertEquals(nextCur, 2, 'Курсор должен сдвинуться на 2');

  const [idx2, nextCur2] = pickDueSequentialFromCursor(items, 2, null);
  assertEquals(idx2, 2, 'Должен вернуть слово под курсором 2');
  assertEquals(nextCur2, 0, 'Курсор должен зациклиться на 0');
});

test('pickDueSequentialFromCursor: пропуск приоритетных карточек в обычной очереди', () => {
  const items = [
    { word: 'pri', next_repeat: null, is_priority: true, priority_countdown: 5 },
    { word: 'normal', next_repeat: null, is_priority: false },
  ];

  const [idx, _] = pickDueSequentialFromCursor(items, 0, null);
  assertEquals(idx, 1, 'Обычная очередь обязана игнорировать карточки с is_priority=true');
});

test('tickPriorityCountdowns: уменьшение счетчиков других приоритетных карточек', () => {
  const items = [
    { word: 'w0', is_priority: false },
    { word: 'p1', is_priority: true, priority_countdown: 4 },
    { word: 'p2', is_priority: true, priority_countdown: 1 },
    { word: 'p3', is_priority: true, priority_countdown: 0 },
  ];

  tickPriorityCountdowns(items, null);
  assertEquals(items[1].priority_countdown, 3, 'Счетчик p1 должен стать 3');
  assertEquals(items[2].priority_countdown, 0, 'Счетчик p2 должен стать 0');
  assertEquals(items[3].priority_countdown, 0, 'Счетчик p3 не должен быть меньше 0');
});

test('getRandomPriorityCountdown: диапазон значений', () => {
  for (let i = 0; i < 50; i++) {
    const val = getRandomPriorityCountdown(3, 10);
    assert(val >= 3 && val <= 10, `Значение ${val} должно быть от 3 до 10`);
  }
});

test('getStats: точный подсчет статистики', () => {
  const now = Date.now();
  const items = [
    { word: 'new1', next_repeat: null, is_priority: false },
    { word: 'due1', next_repeat: new Date(now - 1000).toISOString(), is_priority: false },
    { word: 'future1', next_repeat: new Date(now + 1000000).toISOString(), is_priority: false },
    { word: 'pri1', next_repeat: null, is_priority: true, priority_countdown: 2 },
  ];

  const stats = getStats(items);
  assertEquals(stats.total, 4, 'Всего слов');
  assertEquals(stats.newWords, 1, 'Новые слова');
  assertEquals(stats.due, 3, 'К повторению: новые, просроченные и приоритетные без даты');
  assertEquals(stats.learning, 1, 'В процессе');
  assertEquals(stats.priority, 1, 'Приоритетные');
});

print(`\nРезультат: ${passed} / ${total} тестов пройдено успешно!\n`);
if (passed !== total) {
  throw new Error('Некоторые тесты провалились');
}
