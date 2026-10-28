import {
  ensureRuntimeDefaults,
  pickPriorityReady,
  pickDueSequentialFromCursor,
  tickPriorityCountdowns,
  getRandomPriorityCountdown,
} from '../js/srs.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`FAILED: ${message} (ожидалось: ${expected}, получено: ${actual})`);
  }
}

print('=== ЗАПУСК СИМУЛЯЦИОННЫХ ТЕСТОВ ЖИЗНЕННОГО ЦИКЛА ===\n');

const items = [
  { id: 1, word: 'apple', rus: 'яблоко', next_repeat: null, is_priority: false, priority_countdown: 0 },
  { id: 2, word: 'banana', rus: 'банан', next_repeat: null, is_priority: false, priority_countdown: 0 },
  { id: 3, word: 'cherry', rus: 'вишня', next_repeat: null, is_priority: false, priority_countdown: 0 },
  { id: 4, word: 'date', rus: 'финик', next_repeat: null, is_priority: false, priority_countdown: 0 },
  { id: 5, word: 'elderberry', rus: 'бузина', next_repeat: null, is_priority: false, priority_countdown: 0 },
];

let cursor = 0;

let [idx, nextCur] = pickDueSequentialFromCursor(items, cursor, null);
assertEquals(idx, 0, 'Первое слово apple');
if (nextCur !== null) cursor = nextCur;
assertEquals(cursor, 1, 'Курсор сдвинулся на 1');

items[0].is_priority = true;
items[0].priority_countdown = 3;

[idx, nextCur] = pickDueSequentialFromCursor(items, cursor, 0);
assertEquals(idx, 1, 'Второе слово banana');
if (nextCur !== null) cursor = nextCur;

tickPriorityCountdowns(items, 1);
items[1].next_repeat = new Date(Date.now() + 2 * 86400000).toISOString();
assertEquals(items[0].priority_countdown, 2, 'Счетчик apple уменьшился до 2');

[idx, nextCur] = pickDueSequentialFromCursor(items, cursor, 1);
assertEquals(idx, 2, 'Третье слово cherry');
if (nextCur !== null) cursor = nextCur;

tickPriorityCountdowns(items, 2);
items[2].next_repeat = new Date(Date.now() + 2 * 86400000).toISOString();
assertEquals(items[0].priority_countdown, 1, 'Счетчик apple уменьшился до 1');

[idx, nextCur] = pickDueSequentialFromCursor(items, cursor, 2);
assertEquals(idx, 3, 'Четвертое слово date');
if (nextCur !== null) cursor = nextCur;

tickPriorityCountdowns(items, 3);
items[3].next_repeat = new Date(Date.now() + 2 * 86400000).toISOString();
assertEquals(items[0].priority_countdown, 0, 'Счетчик apple уменьшился до 0 (готов к повтору!)');

const priIdx = pickPriorityReady(items, 3);
assertEquals(priIdx, 0, 'Приоритетная карточка apple появилась сразу как countdown достиг 0');

print('  ✓ Симуляция приоритетной очереди и интервалов успешно пройдена!');
print('\nВсе симуляционные проверки пройдены!\n');
