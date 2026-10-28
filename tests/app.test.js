import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { FakeSupabase } from './helpers.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost:8080/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.confirm = () => true;
const { App } = await import('../js/app.js');
const { storage } = await import('../js/storage.js');
const app = new App();
await app.init();
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

test('HTML wiring initializes without a shared hardcoded PIN', () => {
  assert.equal(document.getElementById('lockOverlay'), null);
  assert.equal(document.getElementById('statTotal').textContent, '0');
  assert.equal(document.querySelector('label[for="sbKey"]').textContent, 'Publishable key');
  assert.equal(document.getElementById('importFileInput').multiple, true);
});

test('add, schedule, edit, and delete preserve card and dictionary behavior', async () => {
  app.addWordInput.value = 'apple';
  app.addRusInput.value = 'яблоко';
  await app.handleAddWord({ preventDefault() {} });
  assert.equal(app.items.length, 1);
  assert.equal(app.cardTerm.textContent, 'apple');
  app.schedule(86400000);
  await tick();
  assert.ok(Date.parse((await storage.loadWords())[0].next_repeat) > Date.now());
  app.openEditModal(app.items[0]);
  app.editRusInput.value = 'яблочко';
  await app.handleSaveEdit({ preventDefault() {} });
  assert.equal((await storage.loadWords())[0].rus, 'яблочко');
  await app.handleDeleteWord(app.items[0].id);
  assert.equal(app.items.length, 0);
  assert.equal(app.currentIdx, null);
});

test('multiple JSON files import together and imported HTML is rendered as text', async () => {
  const files = [
    { text: async () => JSON.stringify([{ id: 1, word: '<img src=x onerror=alert(1)>', rus: '<script>bad()</script>' }]) },
    { text: async () => JSON.stringify([{ id: 1, phrase: 'hello there', rus: 'привет' }]) },
  ];
  await app.handleImportJson({ target: { files, value: 'selected' } });
  assert.equal(app.items.length, 2);
  assert.equal(document.querySelectorAll('.word-row').length, 2);
  assert.equal(document.querySelector('.word-row img'), null);
  assert.equal(document.querySelector('.word-row script'), null);
  assert.equal(document.querySelector('.word-term').textContent, '<img src=x onerror=alert(1)>');
  await app.handleImportJson({ target: { files, value: 'selected' } });
  assert.equal(app.items.length, 2);
});

test('account form restores its deck and clears the visible deck on sign-out', async () => {
  const client = new FakeSupabase();
  storage.createClient = () => client;
  await storage.setSupabaseCredentials('https://example.supabase.co', 'sb_publishable_test');
  await app.refreshAfterCloudAuth();
  assert.equal(app.items.length, 0);
  client.tables.words.push({
    id: 1, entry_id: 'private', user_id: 'alice', word: 'private word', rus: 'личное',
    transcription: '', next_repeat: null, is_priority: false, priority_countdown: 0, priority_due_counter: null,
  });
  app.sbEmail.value = 'alice';
  app.sbPassword.value = 'correct';
  await app.handleSupabaseSignIn();
  await tick();
  assert.equal(app.items[0].word, 'private word');
  assert.equal(app.sbPassword.value, '');
  assert.match(app.syncStatusText.textContent, /Облако/);
  await app.handleSupabaseSignOut();
  await tick();
  assert.equal(app.items.length, 0);
  assert.equal(document.querySelectorAll('.word-row').length, 0);
  assert.match(app.syncStatusText.textContent, /войдите/);
});
