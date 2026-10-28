export class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

export const makeWord = (id, word = `term ${id}`) => ({
  id: String(id), word, transcription: '', rus: 'перевод', next_repeat: null,
  is_priority: false, priority_countdown: 0, priority_due_counter: null,
});

export class FakeSupabase {
  constructor(user = null) {
    this.user = user;
    this.tables = { words: [], app_state: [] };
    this.requests = [];
    this.listeners = new Set();
    this.offline = false;
    this.nextId = 1;
    this.auth = {
      getSession: async () => ({ data: { session: this.user ? { user: this.user } : null }, error: null }),
      onAuthStateChange: (callback) => {
        this.listeners.add(callback);
        return { data: { subscription: { unsubscribe: () => this.listeners.delete(callback) } } };
      },
      signInWithPassword: async ({ email, password }) => {
        if (password !== 'correct') return { data: {}, error: new Error('Invalid login credentials') };
        this.changeUser({ id: email, email });
        return { data: { user: this.user, session: { user: this.user } }, error: null };
      },
      signUp: async ({ email }) => ({ data: { user: { id: email, email }, session: null }, error: null }),
      signOut: async () => { this.changeUser(null); return { error: null }; },
    };
  }
  changeUser(user) {
    this.user = user;
    for (const callback of this.listeners) callback(user ? 'SIGNED_IN' : 'SIGNED_OUT', user ? { user } : null);
  }
  from(table) {
    const client = this;
    const query = {
      table, action: 'select', filters: [], start: 0, end: Infinity,
      select() { return this; },
      eq(key, value) { this.filters.push([key, value]); return this; },
      order() { return this; },
      range(start, end) { this.start = start; this.end = end; return this; },
      maybeSingle() { this.single = true; return this; },
      upsert(rows, options) { this.action = 'upsert'; this.rows = structuredClone(Array.isArray(rows) ? rows : [rows]); this.options = options; return this; },
      delete() { this.action = 'delete'; return this; },
      then(resolve, reject) { return this.execute().then(resolve, reject); },
      async execute() {
        client.requests.push({ table, action: this.action, rows: this.rows, start: this.start, end: this.end });
        if (client.blockNext && this.action !== 'select') {
          const block = client.blockNext;
          client.blockNext = null;
          await block;
        }
        if (client.offline) return { data: null, error: new Error('Network unavailable') };
        if (!client.user) return { data: null, error: new Error('permission denied') };
        const matches = (row) => row.user_id === client.user.id && this.filters.every(([key, value]) => row[key] === value);
        if (this.action === 'select') {
          const data = client.tables[table].filter(matches).sort((a, b) => (a.id || 0) - (b.id || 0)).slice(this.start, this.end + 1);
          return { data: structuredClone(this.single ? data[0] || null : data), error: null };
        }
        if (this.action === 'delete') {
          client.tables[table] = client.tables[table].filter((row) => !matches(row));
          return { data: null, error: null };
        }
        for (const row of this.rows) {
          if (row.user_id !== client.user.id) return { data: null, error: new Error('RLS violation') };
          const key = table === 'words' ? 'entry_id' : 'key';
          const index = client.tables[table].findIndex((old) => old.user_id === row.user_id && old[key] === row[key]);
          if (index < 0) client.tables[table].push({ id: client.nextId++, ...row });
          else client.tables[table][index] = { ...client.tables[table][index], ...row };
        }
        return { data: null, error: null };
      },
    };
    return query;
  }
}
