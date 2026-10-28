import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const handlers = {};
const saved = new Map();
let fetchFails = false;
const context = {
  URL,
  self: {
    registration: { scope: 'https://example.github.io/review/' },
    addEventListener: (name, handler) => { handlers[name] = handler; },
    skipWaiting() {}, clients: { claim() {} },
  },
  caches: {
    open: async () => ({
      put: async (url, value) => saved.set(url, value),
      match: async (url) => saved.get(url),
      addAll: async () => {},
    }),
  },
  fetch: async () => {
    if (fetchFails) throw new Error('offline');
    return { ok: true, version: 'new', clone() { return this; } };
  },
};
vm.runInNewContext(source, context);

function request(url, method = 'GET') {
  let response;
  handlers.fetch({ request: { url, method }, respondWith: (value) => { response = value; } });
  return response;
}

test('service worker never caches authentication, API requests, private data, or mutations', () => {
  assert.equal(request('https://project.supabase.co/auth/v1/token'), undefined);
  assert.equal(request('https://example.github.io/review/private/words_data.json'), undefined);
  assert.equal(request('https://example.github.io/review/index.html', 'POST'), undefined);
});

test('static assets get fresh versions online and fall back to the same asset offline', async () => {
  const url = 'https://example.github.io/review/js/app.js';
  const fresh = await request(url);
  assert.equal(fresh.version, 'new');
  fetchFails = true;
  assert.equal((await request(url)).version, 'new');
  await assert.rejects(request('https://example.github.io/review/styles.css'), /offline/);
});
