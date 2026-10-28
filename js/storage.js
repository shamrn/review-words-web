import { STORAGE_KEYS } from './config.js';
import { normalizeWord, parseWords, toDatabaseWord, fromDatabaseWord } from './data.js';

export class StorageService {
  constructor(options = {}) {
    this.local = options.localStorage || globalThis.localStorage;
    this.createClient = options.createClient || globalThis.window?.supabase?.createClient;
    this.supabaseClient = null;
    this.currentUser = null;
    this.isSupabaseConnected = false;
    this.project = '';
    this.syncError = null;
    this.verifiedScope = null;
    this.listeners = new Set();
    this.flushes = new Map();
    this.generation = 0;
    this.sessionReady = this.initSupabase();
    this.sessionReady.catch((error) => {
      this.syncError = error.message;
      this.emit('sync');
    });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(type) {
    const event = { type, scope: this.scope(), user: this.currentUser };
    setTimeout(() => {
      for (const listener of this.listeners) listener(event);
    }, 0);
  }

  scope() {
    if (!this.isSupabaseConnected) return 'local';
    return `${this.project}:${this.currentUser?.id || 'signed-out'}`;
  }

  localKey(name, scope = this.scope()) {
    return `word-review:v2:${scope}:${name}`;
  }

  read(name, fallback, scope = this.scope()) {
    const raw = this.local.getItem(this.localKey(name, scope));
    if (raw === null) return fallback;
    return JSON.parse(raw);
  }

  write(name, value, scope = this.scope()) {
    this.local.setItem(this.localKey(name, scope), JSON.stringify(value));
  }

  setUser(user) {
    const previous = this.scope();
    this.currentUser = user || null;
    if (previous !== this.scope()) {
      this.syncError = null;
      this.verifiedScope = null;
      this.emit('auth');
    }
  }

  async initSupabase() {
    const generation = ++this.generation;
    this.authSubscription?.unsubscribe();
    this.authSubscription = null;
    this.currentUser = null;
    this.supabaseClient = null;
    this.isSupabaseConnected = false;
    this.syncError = null;
    const url = this.local.getItem(STORAGE_KEYS.SUPABASE_URL);
    const key = this.local.getItem(STORAGE_KEYS.SUPABASE_KEY);
    if (!url || !key) return;
    if (!this.createClient) {
      this.syncError = 'Не удалось загрузить библиотеку Supabase';
      throw new Error(this.syncError);
    }
    this.project = new URL(url).host;
    const client = this.createClient(url, key);
    this.supabaseClient = client;
    this.isSupabaseConnected = true;
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      if (generation === this.generation) this.setUser(session?.user || null);
    });
    this.authSubscription = listener.subscription;
    const { data, error } = await client.auth.getSession();
    if (generation !== this.generation) return;
    if (error) throw error;
    this.setUser(data.session?.user || null);
  }

  async setSupabaseCredentials(url, key) {
    url = url.trim();
    key = key.trim();
    if (!url && !key) {
      await this.signOut();
      this.local.removeItem(STORAGE_KEYS.SUPABASE_URL);
      this.local.removeItem(STORAGE_KEYS.SUPABASE_KEY);
    } else {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
        throw new Error('Project URL должен начинаться с https://');
      }
      let role = '';
      if (key.startsWith('eyJ')) {
        try { role = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role; } catch {}
      }
      if (!key.startsWith('sb_publishable_') && role !== 'anon') {
        throw new Error('Укажите Publishable key или legacy anon key');
      }
      const oldUrl = this.local.getItem(STORAGE_KEYS.SUPABASE_URL);
      if (oldUrl && oldUrl !== parsed.origin) await this.signOut();
      this.local.setItem(STORAGE_KEYS.SUPABASE_URL, parsed.origin);
      this.local.setItem(STORAGE_KEYS.SUPABASE_KEY, key);
    }
    this.sessionReady = this.initSupabase();
    await this.sessionReady;
    this.emit('auth');
    return this.isSupabaseConnected;
  }

  getSupabaseCredentials() {
    return {
      url: this.local.getItem(STORAGE_KEYS.SUPABASE_URL) || '',
      key: this.local.getItem(STORAGE_KEYS.SUPABASE_KEY) || '',
      connected: this.isSupabaseConnected,
    };
  }

  getUserId() {
    return this.currentUser?.id || null;
  }

  context() {
    if (this.isSupabaseConnected && !this.currentUser) throw new Error('Войдите в аккаунт для работы с облачными словами');
    return { scope: this.scope(), userId: this.getUserId(), client: this.supabaseClient };
  }

  async signIn(email, password) {
    await this.sessionReady;
    if (!this.supabaseClient) throw new Error('Сначала сохраните настройки Supabase');
    const { data, error } = await this.supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    this.setUser(data.user);
    return data.user;
  }

  async signUp(email, password) {
    await this.sessionReady;
    if (!this.supabaseClient) throw new Error('Сначала сохраните настройки Supabase');
    const { data, error } = await this.supabaseClient.auth.signUp({ email, password });
    if (error) throw error;
    this.setUser(data.session?.user || null);
    return data;
  }

  async signOut() {
    await this.sessionReady.catch(() => {});
    if (!this.supabaseClient) return;
    const { error } = await this.supabaseClient.auth.signOut({ scope: 'local' });
    if (error) throw error;
    this.setUser(null);
  }

  getSyncStatus() {
    return {
      configured: this.isSupabaseConnected,
      signedIn: !!this.currentUser,
      verified: this.verifiedScope === this.scope(),
      pending: this.currentUser ? this.read('pending', []).length : 0,
      error: this.syncError,
    };
  }

  enqueue(operations, context) {
    const current = this.read('pending', [], context.scope);
    const targets = new Set(operations.map((op) => `${op.kind === 'state' ? 'state' : 'word'}:${op.key || op.item.id}`));
    const remaining = current.filter((op) => !targets.has(`${op.kind === 'state' ? 'state' : 'word'}:${op.key || op.item.id}`));
    this.write('pending', [...remaining, ...operations.map((op) => ({ ...op, token: crypto.randomUUID() }))], context.scope);
    this.emit('sync');
  }

  async flush(context = this.context()) {
    if (!context.userId) return true;
    if (this.flushes.has(context.scope)) return this.flushes.get(context.scope);
    const operation = this.flushQueue(context).finally(() => this.flushes.delete(context.scope));
    this.flushes.set(context.scope, operation);
    return operation;
  }

  async flushQueue(context) {
    try {
      while (context.scope === this.scope()) {
        const pending = this.read('pending', [], context.scope);
        if (!pending.length) {
          this.syncError = null;
          this.emit('sync');
          return true;
        }
        const first = pending[0];
        const batch = first.kind === 'upsert' ? pending.slice(0, 200).filter((op) => op.kind === 'upsert') : [first];
        let result;
        if (first.kind === 'upsert') {
          result = await context.client.from('words').upsert(
            batch.map((op) => toDatabaseWord(op.item, context.userId)),
            { onConflict: 'user_id,entry_id' },
          );
        } else if (first.kind === 'delete') {
          result = await context.client.from('words').delete().eq('user_id', context.userId).eq('entry_id', first.item.id);
        } else {
          result = await context.client.from('app_state').upsert({
            key: `${first.key}:${context.userId}`, value: first.value, user_id: context.userId,
          }, { onConflict: 'key,user_id' });
        }
        if (result.error) throw result.error;
        if (context.scope === this.scope()) this.verifiedScope = context.scope;
        const tokens = new Set(batch.map((op) => op.token));
        this.write('pending', this.read('pending', [], context.scope).filter((op) => !tokens.has(op.token)), context.scope);
      }
      return false;
    } catch (error) {
      if (context.scope === this.scope()) this.syncError = error.message || String(error);
      this.emit('sync');
      return false;
    }
  }

  async loadWords() {
    await this.sessionReady;
    if (this.isSupabaseConnected && !this.currentUser) return [];
    const context = this.context();
    if (!context.userId) {
      const saved = this.read('words', null);
      if (saved !== null) return saved;
      const legacy = this.local.getItem(STORAGE_KEYS.WORDS);
      const words = legacy ? parseWords(legacy) : [];
      this.write('words', words);
      return words;
    }
    await this.flush(context);
    try {
      const all = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await context.client.from('words').select('*')
          .eq('user_id', context.userId).order('id', { ascending: true }).range(offset, offset + 499);
        if (error) throw error;
        all.push(...data.map(fromDatabaseWord));
        if (data.length < 500) break;
      }
      if (context.scope !== this.scope()) return [];
      const merged = new Map(all.map((word) => [word.id, word]));
      for (const operation of this.read('pending', [], context.scope)) {
        if (operation.kind === 'upsert') merged.set(operation.item.id, operation.item);
        if (operation.kind === 'delete') merged.delete(operation.item.id);
      }
      const words = [...merged.values()];
      this.write('words', words, context.scope);
      this.verifiedScope = context.scope;
      if (!this.read('pending', [], context.scope).length) this.syncError = null;
      this.emit('sync');
      return words;
    } catch (error) {
      if (context.scope !== this.scope()) return [];
      this.syncError = error.message || String(error);
      this.emit('sync');
      const cache = this.read('words', null, context.scope);
      if (cache === null) throw error;
      return cache;
    }
  }

  saveAllWords(words) {
    const context = this.context();
    const previous = new Map(this.read('words', [], context.scope).map((item) => [item.id, item]));
    const normalized = words.map(normalizeWord);
    const changed = normalized.filter((item) => JSON.stringify(item) !== JSON.stringify(previous.get(item.id)));
    this.write('words', normalized, context.scope);
    if (!context.userId || !changed.length) return Promise.resolve(true);
    this.enqueue(changed.map((item) => ({ kind: 'upsert', item })), context);
    return this.flush(context);
  }

  saveChanges(words) {
    const context = this.context();
    const normalized = words.map(normalizeWord);
    const current = new Map(this.read('words', [], context.scope).map((item) => [item.id, item]));
    for (const item of normalized) current.set(item.id, item);
    this.write('words', [...current.values()], context.scope);
    if (!context.userId || !normalized.length) return Promise.resolve(true);
    this.enqueue(normalized.map((item) => ({ kind: 'upsert', item })), context);
    return this.flush(context);
  }

  async addWord(wordData) {
    await this.sessionReady;
    const item = normalizeWord({ ...wordData, id: crypto.randomUUID() });
    const words = this.read('words', []);
    await this.saveAllWords([...words, item]);
    return item;
  }

  async updateWord(id, updatedFields) {
    const words = this.read('words', []);
    const index = words.findIndex((word) => word.id === String(id));
    if (index < 0) throw new Error('Слово не найдено');
    words[index] = normalizeWord({ ...words[index], ...updatedFields });
    await this.saveAllWords(words);
  }

  async deleteWord(id) {
    const context = this.context();
    const words = this.read('words', [], context.scope).filter((word) => word.id !== String(id));
    this.write('words', words, context.scope);
    if (context.userId) {
      this.enqueue([{ kind: 'delete', item: { id: String(id) } }], context);
      await this.flush(context);
    }
    return words;
  }

  async loadCursor() {
    await this.sessionReady;
    if (this.isSupabaseConnected && !this.currentUser) return 0;
    const context = this.context();
    const pending = this.read('pending', [], context.scope).find((op) => op.kind === 'state' && op.key === 'cursor');
    if (pending) return pending.value;
    if (context.userId) {
      try {
        const { data, error } = await context.client.from('app_state').select('value')
          .eq('key', `cursor:${context.userId}`).eq('user_id', context.userId).maybeSingle();
        if (!error && data) {
          this.write('cursor', data.value, context.scope);
          return Math.max(0, Number(data.value) || 0);
        }
      } catch {}
    }
    return Math.max(0, Number(this.read('cursor', 0, context.scope)) || 0);
  }

  saveCursor(cursor) {
    const context = this.context();
    this.write('cursor', cursor, context.scope);
    if (!context.userId) return Promise.resolve(true);
    this.enqueue([{ kind: 'state', key: 'cursor', value: cursor }], context);
    return this.flush(context);
  }

  async exportWords() {
    return JSON.stringify(await this.loadWords(), null, 2);
  }

  async importWords(json) {
    const imported = parseWords(json);
    const existing = await this.loadWords();
    const ids = new Set(existing.map((item) => item.id));
    const added = imported.filter((item) => !ids.has(item.id));
    await this.saveAllWords([...existing, ...added]);
    return { words: [...existing, ...added], added: added.length };
  }
}

export const storage = typeof window === 'undefined' ? null : new StorageService();
