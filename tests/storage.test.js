import test from 'node:test';
import assert from 'node:assert/strict';
import { StorageService } from '../js/storage.js';
import { STORAGE_KEYS } from '../js/config.js';
import { parseWords } from '../js/data.js';
import { MemoryStorage, FakeSupabase, makeWord } from './helpers.js';

async function setup(user = { id: 'alice', email: 'alice' }, local = new MemoryStorage(), client = new FakeSupabase(user)) {
  local.setItem(STORAGE_KEYS.SUPABASE_URL, 'https://example.supabase.co');
  local.setItem(STORAGE_KEYS.SUPABASE_KEY, 'sb_publishable_test');
  const storage = new StorageService({ localStorage: local, createClient: () => client });
  await storage.sessionReady;
  return { storage, client, local };
}

test('signed-out clients do not expose or automatically upload legacy local data', async () => {
  const local = new MemoryStorage();
  local.setItem(STORAGE_KEYS.WORDS, JSON.stringify([makeWord('private')]));
  const { storage, client } = await setup(null, local);
  assert.deepEqual(await storage.loadWords(), []);
  await assert.rejects(storage.addWord(makeWord('x')), /Войдите/);
  await storage.signIn('alice', 'correct');
  assert.deepEqual(await storage.loadWords(), []);
  assert.equal(client.tables.words.length, 0);
});

test('all 3,146 rows are read through pagination, including a final partial page', async () => {
  const { storage, client } = await setup();
  client.tables.words = Array.from({ length: 3146 }, (_, i) => ({ ...makeWord(i), id: i + 1, entry_id: String(i), user_id: 'alice' }));
  assert.equal((await storage.loadWords()).length, 3146);
  assert.equal(client.requests.filter((r) => r.action === 'select').length, 7);
  assert.equal(storage.getSyncStatus().verified, true);
});

test('an empty cloud table replaces stale cache instead of resurrecting deleted records', async () => {
  const { storage } = await setup();
  storage.write('words', [makeWord('old')]);
  assert.deepEqual(await storage.loadWords(), []);
});

test('offline updates survive restart and replay without duplicate rows', async () => {
  const { storage, client, local } = await setup();
  await storage.loadWords();
  client.offline = true;
  const word = { ...makeWord('word:1'), next_repeat: '2027-01-01T00:00:00Z' };
  assert.equal(await storage.saveChanges([word]), false);
  assert.equal(storage.getSyncStatus().pending, 1);
  assert.match(storage.getSyncStatus().error, /Network/);
  const restarted = (await setup(client.user, local, client)).storage;
  assert.equal((await restarted.loadWords())[0].next_repeat, word.next_repeat);
  client.offline = false;
  assert.equal((await restarted.loadWords()).length, 1);
  assert.equal(restarted.getSyncStatus().pending, 0);
  assert.equal(client.tables.words.length, 1);
});

test('accounts have independent caches, queues, and matching entry IDs', async () => {
  const { storage, client } = await setup();
  await storage.loadWords();
  await storage.saveChanges([makeWord('same', 'Alice private')]);
  await storage.signOut();
  assert.deepEqual(await storage.loadWords(), []);
  await storage.signIn('bob', 'correct');
  assert.deepEqual(await storage.loadWords(), []);
  await storage.saveChanges([makeWord('same', 'Bob private')]);
  assert.equal(client.tables.words.length, 2);
  await storage.signIn('alice', 'correct');
  assert.equal((await storage.loadWords())[0].word, 'Alice private');
});

test('a newer update queued during an in-flight request is not lost', async () => {
  const { storage, client } = await setup();
  await storage.loadWords();
  let release;
  client.blockNext = new Promise((resolve) => { release = resolve; });
  const first = storage.saveChanges([makeWord('x', 'first')]);
  const second = storage.saveChanges([makeWord('x', 'latest')]);
  release();
  await Promise.all([first, second]);
  assert.equal(client.tables.words[0].word, 'latest');
  assert.equal(storage.getSyncStatus().pending, 0);
});

test('bulk import handles colliding source IDs and preserves progress on repeated import', async () => {
  const { storage, client } = await setup();
  const words = Array.from({ length: 2869 }, (_, i) => ({ ...makeWord(i + 1), id: i + 1 }));
  const phrases = Array.from({ length: 277 }, (_, i) => ({ id: i + 1, phrase: `phrase ${i + 1}`, rus: 'перевод' }));
  const first = await storage.importWords([...words, ...phrases]);
  assert.equal(first.added, 3146);
  assert.equal(first.words.length, 3146);
  assert.equal(client.tables.words.length, 3146);
  assert.ok(client.tables.words.some((row) => row.entry_id === 'word:1'));
  assert.ok(client.tables.words.some((row) => row.entry_id === 'phrase:1'));
  assert.ok(client.requests.filter((r) => r.action === 'upsert').every((r) => r.rows.length <= 200));
  assert.ok(client.tables.words.every((row) => row.user_id === 'alice'));
  const modified = { ...first.words[0], next_repeat: '2030-01-01T00:00:00Z' };
  await storage.saveChanges([modified]);
  const repeated = await storage.importWords([...words, ...phrases]);
  assert.equal(repeated.added, 0);
  assert.equal(repeated.words.find((row) => row.id === modified.id).next_repeat, modified.next_repeat);
});

test('incremental review writes preserve unrelated records changed on another device', async () => {
  const { storage, client } = await setup();
  await storage.saveChanges([makeWord('a'), makeWord('b')]);
  client.tables.words.find((row) => row.entry_id === 'b').word = 'changed elsewhere';
  client.requests = [];
  await storage.saveChanges([makeWord('a', 'reviewed')]);
  assert.equal(client.requests.find((r) => r.action === 'upsert').rows.length, 1);
  assert.equal((await storage.loadWords()).find((row) => row.id === 'b').word, 'changed elsewhere');
});

test('cursor uses account-scoped keys and survives offline replay', async () => {
  const { storage, client } = await setup();
  await storage.saveCursor(42);
  assert.equal(client.tables.app_state[0].key, 'cursor:alice');
  assert.equal(await storage.loadCursor(), 42);
  client.offline = true;
  await storage.saveCursor(100);
  assert.equal(await storage.loadCursor(), 100);
  client.offline = false;
  await storage.flush();
  assert.equal(client.tables.app_state[0].value, 100);
});

test('sign-in errors and confirmation-required signup are handled separately', async () => {
  const { storage } = await setup(null);
  await assert.rejects(storage.signIn('alice', 'wrong'), /Invalid login/);
  const response = await storage.signUp('alice', 'correct');
  assert.equal(response.session, null);
  assert.equal(storage.getUserId(), null);
});

test('SDK auth events clear the current identity when a session is removed', async () => {
  const { storage, client } = await setup();
  client.changeUser(null);
  assert.equal(storage.getUserId(), null);
  assert.deepEqual(await storage.loadWords(), []);
});

test('configuration rejects server keys before saving them', async () => {
  const { storage, local } = await setup();
  await assert.rejects(storage.setSupabaseCredentials('https://other.supabase.co', 'sb_secret_example'), /Publishable/);
  assert.equal(local.getItem(STORAGE_KEYS.SUPABASE_KEY), 'sb_publishable_test');
});

test('JSON normalization validates dates and handles phrase IDs independently', () => {
  assert.throws(() => parseWords([{ word: 'a', rus: 'b', next_repeat: 'not a date' }]), /дата/);
  const normalized = parseWords([{ id: 1, word: 'a', rus: 'b' }, { id: 1, phrase: 'c', rus: 'd' }]);
  assert.deepEqual(normalized.map((row) => row.id), ['word:1', 'phrase:1']);
  assert.throws(() => parseWords([{ id: 'x', word: 'a', rus: 'b' }, { id: 'x', word: 'a', rus: 'b' }]), /ID/);
});
