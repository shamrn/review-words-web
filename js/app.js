import { INTERVALS_ROW1, INTERVALS_ROW2, STORAGE_KEYS, DEFAULT_DAILY_GOAL } from './config.js';
import {
  ensureRuntimeDefaults,
  pickPriorityReady,
  pickDueSequentialFromCursor,
  tickPriorityCountdowns,
  getRandomPriorityCountdown,
  getStats,
} from './srs.js';
import { storage } from './storage.js';
import { tts } from './tts.js';

export class App {
  constructor() {
    this.items = [];
    this.cursor = 0;
    this.currentIdx = null;
    this.currentKind = 'none';
    this.currentDueNextCursor = null;
    this.translationShown = false;
    this.history = [];

    this.cacheDom();
    this.initIntervalButtons();
    this.bindEvents();
    this.initialized = false;
  }

  cacheDom() {

    this.tabButtons = document.querySelectorAll('.tab-btn');
    this.tabContents = document.querySelectorAll('.tab-content');

    this.syncBadge = document.getElementById('syncBadge');
    this.syncStatusText = document.getElementById('syncStatusText');

    this.dailyGoalCount = document.getElementById('dailyGoalCount');
    this.streakDaysCount = document.getElementById('streakDaysCount');
    this.dailyGoalFill = document.getElementById('dailyGoalFill');

    this.statDue = document.getElementById('statDue');
    this.statPriority = document.getElementById('statPriority');
    this.statLearning = document.getElementById('statLearning');
    this.statTotal = document.getElementById('statTotal');

    this.cardWrapper = document.getElementById('cardWrapper');
    this.emptyStudyState = document.getElementById('emptyStudyState');
    this.flashcard = document.getElementById('flashcard');
    this.btnQuickSpeak = document.getElementById('btnQuickSpeak');
    this.cardBadge = document.getElementById('cardBadge');
    this.cardTerm = document.getElementById('cardTerm');
    this.cardTranscription = document.getElementById('cardTranscription');
    this.cardRus = document.getElementById('cardRus');

    this.btnToggleTrans = document.getElementById('btnToggleTrans');
    this.btnSpeak = document.getElementById('btnSpeak');
    this.btnPrev = document.getElementById('btnPrev');
    this.btnSkip = document.getElementById('btnSkip');
    this.btnRepeat = document.getElementById('btnRepeat');
    this.intervalsRow1 = document.getElementById('intervalsRow1');
    this.intervalsRow2 = document.getElementById('intervalsRow2');
    this.btnAddFirstWord = document.getElementById('btnAddFirstWord');

    this.searchInput = document.getElementById('searchInput');
    this.filterSelect = document.getElementById('filterSelect');
    this.wordsListContainer = document.getElementById('wordsListContainer');

    this.addWordForm = document.getElementById('addWordForm');
    this.addWordInput = document.getElementById('addWord');
    this.addTranscriptionInput = document.getElementById('addTranscription');
    this.addRusInput = document.getElementById('addRus');
    this.btnTestSpeakNew = document.getElementById('btnTestSpeakNew');

    this.editModal = document.getElementById('editModal');
    this.editWordForm = document.getElementById('editWordForm');
    this.editWordId = document.getElementById('editWordId');
    this.editWordInput = document.getElementById('editWord');
    this.editTranscriptionInput = document.getElementById('editTranscription');
    this.editRusInput = document.getElementById('editRus');
    this.btnCloseModal = document.getElementById('btnCloseModal');
    this.btnCancelEdit = document.getElementById('btnCancelEdit');

    this.sbUrl = document.getElementById('sbUrl');
    this.sbKey = document.getElementById('sbKey');
    this.btnSaveSb = document.getElementById('btnSaveSb');
    this.btnDisconnectSb = document.getElementById('btnDisconnectSb');
    this.sbEmail = document.getElementById('sbEmail');
    this.sbPassword = document.getElementById('sbPassword');
    this.btnSignInSb = document.getElementById('btnSignInSb');
    this.btnSignUpSb = document.getElementById('btnSignUpSb');
    this.btnSignOutSb = document.getElementById('btnSignOutSb');
    this.sbAuthStatus = document.getElementById('sbAuthStatus');
    this.voiceSelect = document.getElementById('voiceSelect');
    this.voiceRate = document.getElementById('voiceRate');
    this.rateVal = document.getElementById('rateVal');
    this.autoPlaySpeech = document.getElementById('autoPlaySpeech');
    this.btnTestVoice = document.getElementById('btnTestVoice');
    this.btnExportJson = document.getElementById('btnExportJson');
    this.importFileInput = document.getElementById('importFileInput');
    this.toastContainer = document.getElementById('toastContainer');
  }

  async init() {
    this.updateSyncBadge();

    const creds = storage.getSupabaseCredentials();
    this.sbUrl.value = creds.url;
    this.sbKey.value = creds.key;

    this.items = await storage.loadWords();
    this.updateSyncBadge();
    for (const it of this.items) {
      ensureRuntimeDefaults(it);
    }

    const savedCursor = await storage.loadCursor();
    this.cursor = this.items.length > 0 ? savedCursor % this.items.length : 0;

    this.initDailyGoal();
    this.initAudioSettings();
    this.updateStats();
    this.showCurrentWithoutMutation(true);
    this.renderWordsList();
    this.updateCloudAuthStatus();
    this.initialized = true;
  }

  initDailyGoal() {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const raw = localStorage.getItem(storage.localKey('daily'));
    let data = {
      lastDate: todayStr,
      todayCount: 0,
      streakDays: 1,
      goal: DEFAULT_DAILY_GOAL,
    };

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.lastDate === todayStr) {
          data = { ...data, ...parsed };
        } else {

          const last = new Date(parsed.lastDate);
          const current = new Date(todayStr);
          const diffDays = Math.round((current - last) / (1000 * 60 * 60 * 24));

          if (diffDays === 1) {

            data.streakDays = (parsed.streakDays || 1) + 1;
          } else if (diffDays > 1) {

            data.streakDays = 1;
          }
          data.lastDate = todayStr;
          data.todayCount = 0;
          data.goal = parsed.goal || DEFAULT_DAILY_GOAL;
        }
      } catch (_) {}
    }

    this.dailyData = data;
    this.saveDailyGoal();
    this.updateDailyGoalUI();
  }

  saveDailyGoal() {
    localStorage.setItem(storage.localKey('daily'), JSON.stringify(this.dailyData));
  }

  recordReviewAction() {
    this.initDailyGoal();
    this.dailyData.todayCount++;
    this.saveDailyGoal();
    this.updateDailyGoalUI();

    if (this.dailyData.todayCount === this.dailyData.goal) {
      this.showToast(`🔥 Отлично! Дневная цель в ${this.dailyData.goal} слов выполнена!`);
    }
  }

  updateDailyGoalUI() {
    const count = this.dailyData.todayCount;
    const goal = this.dailyData.goal || DEFAULT_DAILY_GOAL;
    const pct = Math.min(100, Math.round((count / goal) * 100));

    if (this.dailyGoalCount) {
      this.dailyGoalCount.textContent = `${count} / ${goal} (${pct}%)`;
    }
    if (this.streakDaysCount) {
      this.streakDaysCount.textContent = this.dailyData.streakDays || 1;
    }
    if (this.dailyGoalFill) {
      this.dailyGoalFill.style.width = `${pct}%`;
      this.dailyGoalFill.classList.toggle('completed', count >= goal);
    }
  }

  initIntervalButtons() {

    this.intervalsRow1.innerHTML = '';
    INTERVALS_ROW1.forEach((item, idx) => {
      const btn = document.createElement('button');
      btn.className = 'btn-interval';
      btn.innerHTML = `${item.label} <span style="opacity:0.5;font-size:0.75rem;">(${idx + 1})</span>`;
      btn.addEventListener('click', () => this.schedule(item.ms));
      this.intervalsRow1.appendChild(btn);
    });

    this.intervalsRow2.innerHTML = '';
    INTERVALS_ROW2.forEach((item, idx) => {
      const btn = document.createElement('button');
      btn.className = 'btn-interval';
      btn.innerHTML = `${item.label} <span style="opacity:0.5;font-size:0.75rem;">(${idx + 6})</span>`;
      btn.addEventListener('click', () => this.schedule(item.ms));
      this.intervalsRow2.appendChild(btn);
    });
  }

  updateSyncBadge() {
    const status = storage.getSyncStatus();
    const connected = status.signedIn && status.verified && !status.pending && !status.error;
    this.syncBadge.classList.toggle('connected', connected);
    this.syncBadge.title = status.error || (status.pending ? `Ожидает отправки: ${status.pending}` : 'Статус синхронизации');
    this.syncStatusText.textContent = !status.configured ? 'Локально'
      : !status.signedIn ? 'Supabase: войдите'
      : status.pending ? `Ожидает синхронизации: ${status.pending}`
      : status.error ? 'Облако недоступно'
      : !status.verified ? 'Проверка облака…' : 'Облако (Supabase)';
  }

  async runAction(action) {
    try {
      return await action();
    } catch (error) {
      this.showToast(error.message || 'Не удалось выполнить действие', true);
      this.updateSyncBadge();
    }
  }

  initAudioSettings() {
    const voices = tts.getEnglishVoices();
    this.voiceSelect.innerHTML = '';
    voices.forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = `${v.name} (${v.lang})`;
      if (tts.selectedVoice && tts.selectedVoice.name === v.name) {
        opt.selected = true;
      }
      this.voiceSelect.appendChild(opt);
    });

    const settingsRaw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (settingsRaw) {
      try {
        const s = JSON.parse(settingsRaw);
        if (s.rate) {
          this.voiceRate.value = s.rate;
          this.rateVal.textContent = `${s.rate}x`;
          tts.setRate(s.rate);
        }
        if (s.autoPlay !== undefined) {
          this.autoPlaySpeech.checked = Boolean(s.autoPlay);
          tts.autoPlay = Boolean(s.autoPlay);
        }
        if (s.voiceName) {
          tts.setVoiceByName(s.voiceName);
          this.voiceSelect.value = s.voiceName;
        }
      } catch (_) {}
    }
  }

  bindEvents() {
    storage.subscribe(({ type }) => {
      if (type === 'auth' && this.initialized) {
        this.runAction(() => this.refreshAfterCloudAuth());
      } else {
        this.updateSyncBadge();
      }
    });
    window.addEventListener('online', () => {
      if (storage.getUserId()) this.runAction(() => this.refreshAfterCloudAuth());
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && storage.getUserId()) {
        this.runAction(() => this.refreshAfterCloudAuth());
      }
    });

    this.tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        this.switchTab(tabId);
      });
    });

    this.syncBadge.addEventListener('click', () => {
      this.switchTab('tabSettings');
    });

    this.btnAddFirstWord.addEventListener('click', () => {
      this.switchTab(storage.isSupabaseConnected && !storage.getUserId() ? 'tabSettings' : 'tabAdd');
    });

    this.flashcard.addEventListener('click', (e) => {
      if (e.target.closest('#btnQuickSpeak')) return;
      this.toggleTranslation();
    });
    this.btnQuickSpeak.addEventListener('click', (e) => {
      e.stopPropagation();
      this.speakCurrent();
    });
    this.btnToggleTrans.addEventListener('click', () => this.toggleTranslation());

    this.btnSpeak.addEventListener('click', () => this.speakCurrent());
    this.btnPrev.addEventListener('click', () => this.previous());
    this.btnSkip.addEventListener('click', () => this.skipNext());
    this.btnRepeat.addEventListener('click', () => this.repeatSoon());

    window.addEventListener('keydown', (e) => {

      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

      const activeTab = document.querySelector('.tab-content.active');
      if (!activeTab || activeTab.id !== 'tabStudy') return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.toggleTranslation();
      } else if (e.code === 'KeyS') {
        this.speakCurrent();
      } else if (e.code === 'KeyZ') {
        this.previous();
      } else if (e.code === 'KeyN') {
        this.skipNext();
      } else if (e.code === 'KeyR') {
        this.repeatSoon();
      } else if (e.key >= '1' && e.key <= '5') {
        const idx = parseInt(e.key, 10) - 1;
        if (INTERVALS_ROW1[idx]) this.schedule(INTERVALS_ROW1[idx].ms);
      } else if (e.key >= '6' && e.key <= '8') {
        const idx = parseInt(e.key, 10) - 6;
        if (INTERVALS_ROW2[idx]) this.schedule(INTERVALS_ROW2[idx].ms);
      }
    });

    this.searchInput.addEventListener('input', () => this.renderWordsList());
    this.filterSelect.addEventListener('change', () => this.renderWordsList());

    this.addWordForm.addEventListener('submit', (e) => this.runAction(() => this.handleAddWord(e)));
    this.btnTestSpeakNew.addEventListener('click', () => {
      const text = this.addWordInput.value.trim();
      if (text) tts.speak(text);
    });

    this.editWordForm.addEventListener('submit', (e) => this.runAction(() => this.handleSaveEdit(e)));
    this.btnCloseModal.addEventListener('click', () => this.closeEditModal());
    this.btnCancelEdit.addEventListener('click', () => this.closeEditModal());

    this.btnSaveSb.addEventListener('click', () => this.handleSaveSupabase());
    this.btnDisconnectSb.addEventListener('click', () => this.handleDisconnectSupabase());
    this.btnSignInSb.addEventListener('click', () => this.handleSupabaseSignIn());
    this.btnSignUpSb.addEventListener('click', () => this.handleSupabaseSignUp());
    this.btnSignOutSb.addEventListener('click', () => this.handleSupabaseSignOut());

    this.voiceSelect.addEventListener('change', (e) => {
      tts.setVoiceByName(e.target.value);
      this.saveAudioSettings();
    });
    this.voiceRate.addEventListener('input', (e) => {
      const val = e.target.value;
      this.rateVal.textContent = `${val}x`;
      tts.setRate(val);
      this.saveAudioSettings();
    });
    this.autoPlaySpeech.addEventListener('change', (e) => {
      tts.autoPlay = e.target.checked;
      this.saveAudioSettings();
    });
    this.btnTestVoice.addEventListener('click', () => {
      tts.speak('This is a test of English speech pronunciation.');
    });

    this.btnExportJson.addEventListener('click', () => this.runAction(() => this.handleExportJson()));
    this.importFileInput.addEventListener('change', (e) => this.runAction(() => this.handleImportJson(e)));
  }

  saveAudioSettings() {
    const s = {
      rate: this.voiceRate.value,
      autoPlay: this.autoPlaySpeech.checked,
      voiceName: this.voiceSelect.value,
    };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(s));
  }

  switchTab(tabId) {
    this.tabButtons.forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
    });
    this.tabContents.forEach((c) => {
      c.classList.toggle('active', c.id === tabId);
    });

    if (tabId === 'tabList') {
      this.renderWordsList();
    } else if (tabId === 'tabStudy') {
      this.updateStats();
      if (this.currentIdx === null) {
        this.showCurrentWithoutMutation(true);
      }
    }
  }

  setCard(idx, pushHistory = true) {
    if (pushHistory && this.currentIdx !== null) {
      this.history.push(this.currentIdx);
    }

    this.currentIdx = idx;
    this.translationShown = false;
    this.btnToggleTrans.textContent = '👁 Показать перевод';

    const item = this.items[idx];
    const term = item.word || item.phrase || '(нет слова)';
    const tr = item.transcription ? item.transcription : '';
    const rus = item.rus || '';

    this.cardTerm.textContent = term;
    this.cardTranscription.textContent = tr ? `[ ${tr.replace(/^\[|\]$/g, '')} ]` : '';
    this.cardRus.textContent = rus;
    this.cardRus.classList.add('hidden');

    if (item.is_priority) {
      this.cardBadge.className = 'card-badge badge-priority';
      const c = item.priority_countdown || 0;
      this.cardBadge.textContent = `Приоритет (${c > 0 ? c + ' карточек' : 'сейчас'})`;
    } else if (item.next_repeat) {
      this.cardBadge.className = 'card-badge badge-due';
      this.cardBadge.textContent = 'На повторение';
    } else {
      this.cardBadge.className = 'card-badge badge-new';
      this.cardBadge.textContent = 'Новое слово';
    }

    this.cardWrapper.style.display = 'block';
    this.emptyStudyState.style.display = 'none';

    if (tts.autoPlay) {
      tts.speak(term);
    }
  }

  showCurrentWithoutMutation(first = false) {
    if (this.items.length === 0) {
      this.showEmptyState();
      return;
    }

    const priIdx = pickPriorityReady(this.items, null);
    if (priIdx !== null) {
      this.currentKind = 'priority';
      this.currentDueNextCursor = null;
      this.setCard(priIdx, !first);
      return;
    }

    const [dueIdx, nextCur] = pickDueSequentialFromCursor(this.items, this.cursor, null);
    if (dueIdx !== null) {
      this.currentKind = 'due';
      this.currentDueNextCursor = nextCur;
      this.setCard(dueIdx, !first);
      return;
    }

    this.showEmptyState();
  }

  advanceToNext(excludeCurrent = true) {
    const excludeIdx = excludeCurrent ? this.currentIdx : null;

    const priIdx = pickPriorityReady(this.items, excludeIdx);
    if (priIdx !== null) {
      this.currentKind = 'priority';
      this.currentDueNextCursor = null;
      this.setCard(priIdx, true);
      this.updateStats();
      return;
    }

    const [dueIdx, nextCur] = pickDueSequentialFromCursor(this.items, this.cursor, excludeIdx);
    if (dueIdx !== null) {
      this.currentKind = 'due';
      this.currentDueNextCursor = nextCur;
      this.setCard(dueIdx, true);
      this.updateStats();
      return;
    }

    const pendingPriIdx = this.items.findIndex(
      (it, i) => it.is_priority && (excludeIdx === null || i !== excludeIdx)
    );
    if (pendingPriIdx !== -1) {
      this.items[pendingPriIdx].priority_countdown = 0;
      this.currentKind = 'priority';
      this.currentDueNextCursor = null;
      this.setCard(pendingPriIdx, true);
      this.updateStats();
      return;
    }

    this.showEmptyState();
    this.updateStats();
  }

  showEmptyState() {
    this.currentIdx = null;
    this.currentKind = 'none';
    this.currentDueNextCursor = null;
    this.cardWrapper.style.display = 'none';
    this.emptyStudyState.style.display = 'flex';
    const needsLogin = storage.isSupabaseConnected && !storage.getUserId();
    const empty = this.items.length === 0;
    this.emptyStudyState.querySelector('.empty-title').textContent = needsLogin ? 'Войдите в аккаунт' : empty ? 'Словарь пуст' : 'Всё повторено на сейчас!';
    this.emptyStudyState.querySelector('.empty-desc').textContent = needsLogin
      ? 'Откройте настройки и войдите, чтобы загрузить свои слова.'
      : empty ? 'Добавьте слово или загрузите JSON со словами и фразами в настройках.'
      : 'Сейчас нет карточек, требующих повторения.';
    this.btnAddFirstWord.textContent = needsLogin ? '⚙️ Открыть настройки' : '➕ Добавить слово';
  }

  toggleTranslation() {
    if (this.currentIdx === null) return;
    this.translationShown = !this.translationShown;
    this.cardRus.classList.toggle('hidden', !this.translationShown);
    this.btnToggleTrans.textContent = this.translationShown ? '🙈 Скрыть перевод' : '👁 Показать перевод';
  }

  speakCurrent() {
    if (this.currentIdx === null) return;
    const item = this.items[this.currentIdx];
    const term = item.word || item.phrase;
    tts.speak(term);
  }

  previous() {
    if (this.history.length === 0) {
      this.showToast('История пуста');
      return;
    }
    const prevIdx = this.history.pop();
    this.currentKind = 'history';
    this.currentDueNextCursor = null;
    this.setCard(prevIdx, false);
  }

  commitDueCursorIfNeeded() {
    if (this.currentKind === 'due' && this.currentDueNextCursor !== null) {
      this.cursor = this.currentDueNextCursor;
      this.runAction(() => storage.saveCursor(this.cursor));
    }
  }

  skipNext() {
    if (this.currentIdx === null) return;
    const before = JSON.stringify(this.items);
    const cur = this.currentIdx;
    const item = this.items[cur];

    if (!item.is_priority) {
      tickPriorityCountdowns(this.items, cur);
    } else {
      item.priority_countdown = getRandomPriorityCountdown(3, 10);
    }

    this.commitDueCursorIfNeeded();
    this.recordReviewAction();
    this.advanceToNext(true);
    this.persistReview(before);
  }

  repeatSoon() {
    if (this.currentIdx === null) return;
    const before = JSON.stringify(this.items);
    const cur = this.currentIdx;
    const item = this.items[cur];

    item.is_priority = true;
    item.priority_countdown = getRandomPriorityCountdown(3, 10);

    this.commitDueCursorIfNeeded();
    this.recordReviewAction();
    this.showToast(`Слово появится через 3–10 других карточек`);
    this.advanceToNext(true);
    this.persistReview(before);
  }

  schedule(msDelta) {
    if (this.currentIdx === null) return;
    const before = JSON.stringify(this.items);
    const cur = this.currentIdx;
    const item = this.items[cur];

    if (!item.is_priority) {
      tickPriorityCountdowns(this.items, cur);
    }

    const nextDate = new Date(Date.now() + msDelta);
    item.next_repeat = nextDate.toISOString();
    item.is_priority = false;
    item.priority_countdown = 0;

    this.commitDueCursorIfNeeded();
    this.recordReviewAction();
    this.advanceToNext(true);
    this.persistReview(before);
  }

  persistReview(beforeJson) {
    const before = new Map(JSON.parse(beforeJson).map((item) => [item.id, JSON.stringify(item)]));
    const changed = this.items.filter((item) => before.get(item.id) !== JSON.stringify(item));
    this.runAction(() => storage.saveChanges(changed));
  }

  escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }

  updateStats() {
    const stats = getStats(this.items);
    this.statDue.textContent = stats.due;
    this.statPriority.textContent = stats.priority;
    this.statLearning.textContent = stats.learning;
    this.statTotal.textContent = stats.total;
  }

  renderWordsList() {
    const query = this.searchInput.value.toLowerCase().trim();
    const filter = this.filterSelect.value;
    const now = new Date();

    const filtered = this.items.filter((it) => {

      const termMatch = (it.word || '').toLowerCase().includes(query);
      const rusMatch = (it.rus || '').toLowerCase().includes(query);
      if (query && !termMatch && !rusMatch) return false;

      if (filter === 'due') {
        return !it.is_priority && it.next_repeat && new Date(it.next_repeat) <= now;
      }
      if (filter === 'priority') {
        return it.is_priority;
      }
      if (filter === 'learning') {
        return !it.is_priority && it.next_repeat && new Date(it.next_repeat) > now;
      }
      if (filter === 'new') {
        return !it.is_priority && !it.next_repeat;
      }
      return true;
    });

    this.wordsListContainer.innerHTML = '';
    if (filtered.length === 0) {
      this.wordsListContainer.innerHTML = `
        <div style="padding: 30px; text-align: center; color: var(--text-muted);">
          Слова не найдены
        </div>
      `;
      return;
    }

    filtered.forEach((it) => {
      const row = document.createElement('div');
      row.className = 'word-row';

      let statusBadge = '';
      if (it.is_priority) {
        statusBadge = `<span class="card-badge badge-priority" style="position:static;font-size:0.65rem;padding:2px 8px;">Повтор (${it.priority_countdown || 0})</span>`;
      } else if (it.next_repeat) {
        const dt = new Date(it.next_repeat);
        const isPast = dt <= now;
        statusBadge = `<span class="card-badge ${isPast ? 'badge-due' : ''}" style="position:static;font-size:0.65rem;padding:2px 8px;">
          ${isPast ? 'Повторить сейчас' : dt.toLocaleDateString('ru')}
        </span>`;
      } else {
        statusBadge = `<span class="card-badge badge-new" style="position:static;font-size:0.65rem;padding:2px 8px;">Новое</span>`;
      }

      row.innerHTML = `
        <div class="word-info">
          <div class="word-main">
            <span class="word-term">${this.escapeHtml(it.word || it.phrase)}</span>
            ${it.transcription ? `<span class="word-transcription">[ ${this.escapeHtml(it.transcription.replace(/^\[|\]$/g, ''))} ]</span>` : ''}
            ${statusBadge}
          </div>
          <div class="word-rus">${this.escapeHtml(it.rus)}</div>
        </div>
        <div class="word-row-actions">
          <button class="icon-btn btn-row-speak" title="Прослушать">🔊</button>
          <button class="icon-btn btn-row-edit" title="Редактировать">✏️</button>
          <button class="icon-btn delete btn-row-del" title="Удалить">🗑️</button>
        </div>
      `;

      row.querySelector('.btn-row-speak').addEventListener('click', () => {
        tts.speak(it.word || it.phrase);
      });
      row.querySelector('.btn-row-edit').addEventListener('click', () => {
        this.openEditModal(it);
      });
      row.querySelector('.btn-row-del').addEventListener('click', () => {
        this.runAction(() => this.handleDeleteWord(it.id));
      });

      this.wordsListContainer.appendChild(row);
    });
  }

  async handleAddWord(e) {
    e.preventDefault();
    const word = this.addWordInput.value.trim();
    const transcription = this.addTranscriptionInput.value.trim();
    const rus = this.addRusInput.value.trim();

    if (!word || !rus) return;

    const newItem = await storage.addWord({ word, transcription, rus });
    this.items.push(newItem);
    this.updateStats();

    this.addWordForm.reset();
    this.showToast(`Слово "${word}" успешно добавлено!`);

    if (this.currentIdx === null) {
      this.switchTab('tabStudy');
      this.showCurrentWithoutMutation(true);
    }
  }

  openEditModal(item) {
    this.editWordId.value = item.id;
    this.editWordInput.value = item.word || item.phrase || '';
    this.editTranscriptionInput.value = item.transcription || '';
    this.editRusInput.value = item.rus || '';
    this.editModal.classList.add('open');
  }

  closeEditModal() {
    this.editModal.classList.remove('open');
  }

  async handleSaveEdit(e) {
    e.preventDefault();
    const rawId = this.editWordId.value;
    const id = isNaN(Number(rawId)) ? rawId : Number(rawId);
    const updated = {
      word: this.editWordInput.value.trim(),
      transcription: this.editTranscriptionInput.value.trim(),
      rus: this.editRusInput.value.trim(),
    };

    await storage.updateWord(id, updated);

    const idx = this.items.findIndex((w) => String(w.id) === String(id));
    if (idx !== -1) {
      this.items[idx] = { ...this.items[idx], ...updated };
      if (this.currentIdx === idx) {
        this.setCard(idx, false);
      }
    }

    this.closeEditModal();
    this.renderWordsList();
    this.showToast('Слово обновлено');
  }

  async handleDeleteWord(id) {
    if (!confirm('Вы уверены, что хотите удалить это слово?')) return;

    const currentWordId = this.currentIdx !== null ? this.items[this.currentIdx]?.id : null;
    this.items = await storage.deleteWord(id);
    this.history = [];

    if (this.cursor >= this.items.length) {
      this.cursor = 0;
      this.runAction(() => storage.saveCursor(this.cursor));
    }

    this.updateStats();
    this.renderWordsList();

    if (currentWordId !== null && String(currentWordId) === String(id)) {
      this.currentIdx = null;
      this.advanceToNext(false);
    } else if (this.currentIdx !== null) {
      const newIdx = this.items.findIndex((w) => String(w.id) === String(currentWordId));
      this.currentIdx = newIdx !== -1 ? newIdx : null;
    }
    this.showToast('Слово удалено');
  }

  async handleSaveSupabase() {
    await this.runAction(async () => {
      await storage.setSupabaseCredentials(this.sbUrl.value, this.sbKey.value);
      await this.refreshAfterCloudAuth();
      this.showToast('Настройки сохранены. Войдите в аккаунт.');
    });
  }

  async handleDisconnectSupabase() {
    await this.runAction(async () => {
      await storage.setSupabaseCredentials('', '');
      this.sbUrl.value = '';
      this.sbKey.value = '';
      this.sbPassword.value = '';
      await this.refreshAfterCloudAuth();
      this.showToast('Включён локальный режим');
    });
  }

  updateCloudAuthStatus(message) {
    if (!this.sbAuthStatus) return;
    this.syncAuthControls();
    if (message) {
      this.sbAuthStatus.textContent = message;
    } else if (!storage.isSupabaseConnected) {
      this.sbAuthStatus.textContent = 'Сначала сохраните Project URL и Publishable key';
    } else if (storage.getUserId()) {
      this.sbAuthStatus.textContent = `Вход выполнен: ${storage.currentUser.email}`;
    } else {
      this.sbAuthStatus.textContent = 'Вход не выполнен';
    }
  }

  syncAuthControls() {
    const signedIn = !!storage.getUserId();
    const busy = !!this.authBusy;
    this.btnSignInSb.disabled = busy || signedIn || !storage.isSupabaseConnected;
    this.btnSignUpSb.disabled = busy || signedIn || !storage.isSupabaseConnected;
    this.btnSignOutSb.disabled = busy || !signedIn;
    this.sbEmail.disabled = busy || signedIn;
    this.sbPassword.disabled = busy || signedIn;
    this.btnSaveSb.disabled = busy;
    this.btnDisconnectSb.disabled = busy;
  }

  async refreshAfterCloudAuth(message) {
    const refresh = this.refreshVersion = (this.refreshVersion || 0) + 1;
    const scope = storage.scope();
    this.items = [];
    this.history = [];
    this.currentIdx = null;
    this.updateStats();
    this.renderWordsList();
    this.showEmptyState();
    this.updateSyncBadge();
    this.updateCloudAuthStatus(message);
    const words = await storage.loadWords();
    const savedCursor = await storage.loadCursor();
    if (refresh !== this.refreshVersion || scope !== storage.scope()) return;
    this.items = words;
    for (const item of this.items) ensureRuntimeDefaults(item);
    this.cursor = this.items.length > 0 ? savedCursor % this.items.length : 0;
    this.initDailyGoal();
    this.updateSyncBadge();
    this.updateCloudAuthStatus(message);
    this.updateStats();
    this.renderWordsList();
    this.showCurrentWithoutMutation(true);
  }

  async handleSupabaseSignIn() {
    if (this.authBusy) return;
    const email = this.sbEmail.value.trim();
    const password = this.sbPassword.value;
    if (!email || !password) {
      this.showToast('Введите email и пароль аккаунта', true);
      return;
    }
    this.authBusy = true;
    this.syncAuthControls();
    try {
      const user = await storage.signIn(email, password);
      this.sbPassword.value = '';
      await this.refreshAfterCloudAuth(`Вход выполнен: ${user.email}`);
      this.showToast('Вход выполнен, облачная синхронизация включена');
    } catch (error) {
      this.showToast(`Не удалось войти: ${error.message}`, true);
    } finally {
      this.authBusy = false;
      this.syncAuthControls();
    }
  }

  async handleSupabaseSignUp() {
    if (this.authBusy) return;
    const email = this.sbEmail.value.trim();
    const password = this.sbPassword.value;
    if (!email || password.length < 6) {
      this.showToast('Введите email и пароль не короче 6 символов', true);
      return;
    }
    this.authBusy = true;
    this.syncAuthControls();
    try {
      const { user, session } = await storage.signUp(email, password);
      this.sbPassword.value = '';
      if (session) {
        await this.refreshAfterCloudAuth(`Аккаунт создан: ${user.email}`);
        this.showToast('Аккаунт создан, синхронизация включена');
      } else {
        this.updateCloudAuthStatus('Проверьте почту и подтвердите аккаунт, затем войдите');
        this.showToast('Аккаунт создан. Проверьте почту для подтверждения.');
      }
    } catch (error) {
      this.showToast(`Не удалось создать аккаунт: ${error.message}`, true);
    } finally {
      this.authBusy = false;
      this.syncAuthControls();
    }
  }

  async handleSupabaseSignOut() {
    if (this.authBusy) return;
    this.authBusy = true;
    this.syncAuthControls();
    try {
      await storage.signOut();
      this.sbPassword.value = '';
      this.sbEmail.value = '';
      await this.refreshAfterCloudAuth('Вы вышли из облачного аккаунта');
      this.showToast('Вы вышли из облачного аккаунта');
    } catch (error) {
      this.showToast(`Не удалось выйти: ${error.message}`, true);
    } finally {
      this.authBusy = false;
      this.syncAuthControls();
    }
  }

  async handleExportJson() {
    const jsonStr = await storage.exportWords();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `words_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('Файл бэкапа скачан');
  }

  async handleImportJson(e) {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    const rows = [];
    for (const file of files) {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) throw new Error(`${file.name}: ожидается массив JSON`);
      rows.push(...parsed);
    }
    const result = await storage.importWords(rows);
    this.items = result.words;
    this.history = [];
    this.currentIdx = null;
    this.updateStats();
    this.renderWordsList();
    this.showCurrentWithoutMutation(true);
    this.showToast(`Добавлено: ${result.added}. Всего записей: ${this.items.length}`);
  }

  showToast(msg, isError = false) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    if (isError) {
      toast.style.borderColor = 'var(--color-danger)';
      toast.style.color = '#f87171';
    }
    toast.textContent = msg;
    this.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 200);
    }, 2500);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init().catch((error) => {
    app.initialized = true;
    app.showToast(error.message, true);
    app.switchTab('tabSettings');
  });
});
