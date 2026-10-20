(() => {
  const DATA = window.SPANISH_DATA;
  const WORDS = DATA.words;
  const WORD_IDS = new Set(WORDS.map(word => word.id));
  const CATEGORIES = DATA.categories;
  const STORAGE_KEY = 'espanol_web_v1';
  const TARGET_KEY = 'espanol_dele_target';
  const GOAL_KEY = 'espanol_daily_goal';
  const QUIZ_MODE_KEY = 'espanol_quiz_mode';
  const SPEECH_ACCENT_KEY = 'espanol_speech_accent';
  const SPEECH_RATE_KEY = 'espanol_speech_rate';
  const STUDY_SESSION_KEY = 'espanol_study_session_v1';
  const QUIZ_SESSION_KEY = 'espanol_quiz_session_v1';
  const DRILL_SESSION_KEY = 'espanol_drill_session_v1';
  const DAY_MS = 86400000;
  const DAILY_GOALS = [10, 20, 30];
  const QUIZ_MODES = ['choice', 'spelling', 'dictation'];
  const SPEECH_ACCENTS = ['spain', 'latam'];
  const SPEECH_RATES = { slow: 0.68, normal: 0.82, fast: 1 };
  const VIEWS = ['home', 'study', 'quiz', 'mistakes', 'conjugation', 'vocabulary'];
  const app = document.querySelector('#app');
  const toast = document.querySelector('#toast');
  const aboutDialog = document.querySelector('#about-dialog');
  const conjugationDialog = document.querySelector('#conjugation-dialog');
  const conjugationReference = document.querySelector('#conjugation-reference');
  const importInput = document.querySelector('#import-file');

  function viewFromHash() {
    const view = location.hash.replace(/^#/, '');
    return VIEWS.includes(view) ? view : 'home';
  }

  let currentView = viewFromHash();
  let studySession = null;
  let quizSession = null;
  let drillSession = null;
  let stateCache = null;
  let stateCacheDate = '';
  let deferredInstallPrompt = null;
  let swipeStart = null;
  let suppressFlipUntil = 0;
  const storedTargetLevel = localStorage.getItem(TARGET_KEY);
  let targetLevel = ['B1', 'B2', 'C1'].includes(storedTargetLevel)
    ? storedTargetLevel
    : 'B2';
  const storedDailyGoal = Number(localStorage.getItem(GOAL_KEY));
  let dailyGoal = DAILY_GOALS.includes(storedDailyGoal) ? storedDailyGoal : 20;
  const storedQuizMode = localStorage.getItem(QUIZ_MODE_KEY);
  let quizMode = QUIZ_MODES.includes(storedQuizMode) ? storedQuizMode : 'choice';
  const storedSpeechAccent = localStorage.getItem(SPEECH_ACCENT_KEY);
  let speechAccent = SPEECH_ACCENTS.includes(storedSpeechAccent)
    ? storedSpeechAccent
    : 'spain';
  const storedSpeechRate = localStorage.getItem(SPEECH_RATE_KEY);
  let speechRate = Object.hasOwn(SPEECH_RATES, storedSpeechRate)
    ? storedSpeechRate
    : 'normal';
  let referenceVerb = DATA.verbs[0].infinitive;
  let referenceTense = DATA.tenses[0].key;
  const vocabularyState = {
    query: '',
    category: 'all',
    level: targetLevel,
    expanded: '',
    visibleLimit: 60,
    favoritesOnly: false
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function normalizeSpelling(value, stripAccents = false) {
    let result = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (stripAccents) {
      result = result.normalize('NFD').replace(/\u0301/g, '');
    }
    return result;
  }

  function speakSpanish(text) {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      showToast('当前浏览器不支持语音朗读');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const preferredLangs = speechAccent === 'latam'
      ? ['es-419', 'es-MX', 'es-US']
      : ['es-ES'];
    utterance.lang = preferredLangs[0];
    utterance.rate = SPEECH_RATES[speechRate] || SPEECH_RATES.normal;
    const voices = window.speechSynthesis.getVoices();
    const spanishVoice = preferredLangs
      .map(lang => voices.find(voice => voice.lang.toLowerCase().startsWith(lang.toLowerCase())))
      .find(Boolean) ||
      voices.find(voice => /^es(-|_)/i.test(voice.lang));
    if (spanishVoice) utterance.voice = spanishVoice;
    window.speechSynthesis.speak(utterance);
  }

  function updateSpeechSettingButtons() {
    document.querySelectorAll('[data-speech-accent]').forEach(button => {
      const active = button.dataset.speechAccent === speechAccent;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-speech-rate]').forEach(button => {
      const active = button.dataset.speechRate === speechRate;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function shuffle(list) {
    const result = list.slice();
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  }

  function todayKey(date) {
    const value = date || new Date();
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function activeStreakDays(streak) {
    const today = todayKey();
    const yesterday = todayKey(new Date(Date.now() - DAY_MS));
    return streak &&
      (streak.lastStudyDate === today || streak.lastStudyDate === yesterday)
      ? nonNegativeNumber(streak.days)
      : 0;
  }

  function nextReviewLabel(record) {
    if (!record || !Number.isFinite(Number(record.dueAt))) return '尚未安排';
    const dueAt = Number(record.dueAt);
    if (dueAt <= Date.now()) return '已到期';
    const dueDate = new Date(dueAt);
    const dueDay = todayKey(dueDate);
    const today = todayKey();
    const tomorrow = todayKey(new Date(Date.now() + DAY_MS));
    const time = `${String(dueDate.getHours()).padStart(2, '0')}:${String(
      dueDate.getMinutes()
    ).padStart(2, '0')}`;
    if (dueDay === today) return `今天 ${time}`;
    if (dueDay === tomorrow) return `明天 ${time}`;
    if (dueDate.getFullYear() === new Date().getFullYear()) {
      return `${dueDate.getMonth() + 1} 月 ${dueDate.getDate()} 日`;
    }
    return `${dueDate.getFullYear()} 年 ${dueDate.getMonth() + 1} 月 ${dueDate.getDate()} 日`;
  }

  function defaultState() {
    return {
      records: {},
      conjugations: {},
      favorites: {},
      daily: {
        date: todayKey(),
        newWords: 0,
        reviews: 0,
        correct: 0,
        total: 0,
        uniqueActivities: []
      },
      history: {},
      streak: { days: 0, lastStudyDate: '' }
    };
  }

  function nonNegativeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
  }

  function unresolvedMistakes(record) {
    if (!record || typeof record !== 'object') return 0;
    if (Number.isFinite(Number(record.mistakeDebt))) {
      return Math.max(0, Number(record.mistakeDebt));
    }
    return nonNegativeNumber(record.wrong) > 0 ? 1 : 0;
  }

  function nextMistakeDebt(previous, correct) {
    const current = unresolvedMistakes(previous);
    return correct ? Math.max(0, current - 1) : current + 1;
  }

  function normalizeRecord(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
    const correct = nonNegativeNumber(record.correct);
    const wrong = nonNegativeNumber(record.wrong);
    return {
      interval: nonNegativeNumber(record.interval),
      repetition: nonNegativeNumber(record.repetition),
      efactor: Math.max(1.3, nonNegativeNumber(record.efactor, 2.5)),
      dueAt: nonNegativeNumber(record.dueAt),
      seen: nonNegativeNumber(record.seen, correct + wrong),
      correct,
      wrong,
      lastSeenAt: nonNegativeNumber(record.lastSeenAt),
      lastSource: ['study', 'quiz'].includes(record.lastSource) ? record.lastSource : '',
      mistakeDebt: unresolvedMistakes(record)
    };
  }

  function normalizeHistoryEntry(entry) {
    const uniqueActivities = Array.isArray(entry && entry.uniqueActivities)
      ? entry.uniqueActivities.filter(item => typeof item === 'string')
      : [];
    return {
      newWords: nonNegativeNumber(entry && entry.newWords),
      reviews: nonNegativeNumber(entry && entry.reviews),
      correct: nonNegativeNumber(entry && entry.correct),
      total: nonNegativeNumber(entry && entry.total),
      activityCount: uniqueActivities.length ||
        nonNegativeNumber(entry && entry.activityCount)
    };
  }

  function loadState() {
    if (stateCache && stateCacheDate === todayKey()) return stateCache;
    let state;
    try {
      state = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (error) {
      state = null;
    }
    if (!state || typeof state !== 'object' || Array.isArray(state)) state = defaultState();
    if (!state.records || typeof state.records !== 'object' || Array.isArray(state.records)) {
      state.records = {};
    } else {
      const records = {};
      Object.entries(state.records).forEach(([id, record]) => {
        const normalized = normalizeRecord(record);
        if (WORD_IDS.has(id) && normalized) records[id] = normalized;
      });
      state.records = records;
    }
    if (!state.conjugations ||
        typeof state.conjugations !== 'object' ||
        Array.isArray(state.conjugations)) {
      state.conjugations = {};
    }
    if (!state.favorites || typeof state.favorites !== 'object' || Array.isArray(state.favorites)) {
      state.favorites = {};
    } else {
      const favorites = {};
      Object.entries(state.favorites).forEach(([id, addedAt]) => {
        if (WORD_IDS.has(id)) {
          favorites[id] = nonNegativeNumber(addedAt, Date.now());
        }
      });
      state.favorites = favorites;
    }
    if (!state.history || typeof state.history !== 'object' || Array.isArray(state.history)) {
      state.history = {};
    } else {
      const history = {};
      Object.entries(state.history).forEach(([date, entry]) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(date) && entry && typeof entry === 'object') {
          history[date] = normalizeHistoryEntry(entry);
        }
      });
      state.history = history;
    }
    const currentDate = todayKey();
    if (state.daily && typeof state.daily === 'object' && state.daily.date !== currentDate) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(state.daily.date) && state.daily.date < currentDate) {
        state.history[state.daily.date] = normalizeHistoryEntry(state.daily);
      }
      state.daily = defaultState().daily;
    }
    if (!state.daily || typeof state.daily !== 'object') {
      state.daily = defaultState().daily;
    } else if (state.daily.date === currentDate) {
      state.daily.newWords = nonNegativeNumber(state.daily.newWords);
      state.daily.reviews = nonNegativeNumber(state.daily.reviews);
      state.daily.correct = nonNegativeNumber(state.daily.correct);
      state.daily.total = nonNegativeNumber(state.daily.total);
      state.daily.uniqueActivities = Array.isArray(state.daily.uniqueActivities)
        ? state.daily.uniqueActivities.filter(item => typeof item === 'string')
        : [];
    }
    Object.keys(state.history)
      .sort()
      .slice(0, -90)
      .forEach(date => delete state.history[date]);
    if (!state.streak || typeof state.streak !== 'object' || Array.isArray(state.streak)) {
      state.streak = { days: 0, lastStudyDate: '' };
    } else {
      state.streak.days = nonNegativeNumber(state.streak.days);
      state.streak.lastStudyDate = typeof state.streak.lastStudyDate === 'string'
        ? state.streak.lastStudyDate
        : '';
    }
    stateCache = state;
    stateCacheDate = todayKey();
    return state;
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    stateCache = state;
    stateCacheDate = todayKey();
  }

  function invalidateStateCache() {
    stateCache = null;
    stateCacheDate = '';
  }

  function markDailyActivity(state, key) {
    if (!Array.isArray(state.daily.uniqueActivities)) {
      state.daily.uniqueActivities = [];
    }
    if (key && !state.daily.uniqueActivities.includes(key)) {
      state.daily.uniqueActivities.push(key);
    }
  }

  function markStudyDay(state) {
    const today = todayKey();
    if (state.streak.lastStudyDate === today) return;
    const yesterday = todayKey(new Date(Date.now() - DAY_MS));
    state.streak.days = state.streak.lastStudyDate === yesterday
      ? state.streak.days + 1
      : 1;
    state.streak.lastStudyDate = today;
  }

  function supermemo(item, grade) {
    let interval;
    let repetition;
    if (grade >= 3) {
      if (item.repetition === 0) {
        interval = 1;
        repetition = 1;
      } else if (item.repetition === 1) {
        interval = 6;
        repetition = 2;
      } else {
        interval = Math.round(item.interval * item.efactor);
        repetition = item.repetition + 1;
      }
    } else {
      interval = 1;
      repetition = 0;
    }
    let efactor = item.efactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
    if (efactor < 1.3) efactor = 1.3;
    return { interval, repetition, efactor };
  }

  function gradeWord(id, grade) {
    const state = loadState();
    const previous = state.records[id];
    const isNew = !previous;
    const next = supermemo({
      interval: previous ? previous.interval || 0 : 0,
      repetition: previous ? previous.repetition || 0 : 0,
      efactor: previous ? previous.efactor || 2.5 : 2.5
    }, grade);

    state.records[id] = {
      interval: next.interval,
      repetition: next.repetition,
      efactor: next.efactor,
      dueAt: Date.now() + (grade >= 3 ? Math.max(1, next.interval) * DAY_MS : 10 * 60000),
      seen: nonNegativeNumber(previous && previous.seen) + 1,
      correct: nonNegativeNumber(previous && previous.correct) + (grade >= 3 ? 1 : 0),
      wrong: nonNegativeNumber(previous && previous.wrong) + (grade < 3 ? 1 : 0),
      lastSeenAt: Date.now(),
      lastSource: 'study',
      mistakeDebt: nextMistakeDebt(previous, grade >= 3)
    };

    state.daily.total += 1;
    state.daily[isNew ? 'newWords' : 'reviews'] += 1;
    if (grade >= 3) state.daily.correct += 1;
    markDailyActivity(state, `word:${id}`);
    markStudyDay(state);
    saveState(state);
    updateHeader();
    return state;
  }

  function recordQuiz(id, correct) {
    const state = loadState();
    const previous = state.records[id];
    const isNew = !previous;
    const grade = correct ? 4 : 2;
    const next = supermemo({
      interval: previous ? previous.interval || 0 : 0,
      repetition: previous ? previous.repetition || 0 : 0,
      efactor: previous ? previous.efactor || 2.5 : 2.5
    }, grade);
    state.records[id] = {
      interval: next.interval,
      repetition: next.repetition,
      efactor: next.efactor,
      dueAt: Date.now() + (correct ? Math.max(1, next.interval) * DAY_MS : 10 * 60000),
      seen: nonNegativeNumber(previous && previous.seen) + 1,
      correct: nonNegativeNumber(previous && previous.correct) + (correct ? 1 : 0),
      wrong: nonNegativeNumber(previous && previous.wrong) + (correct ? 0 : 1),
      lastSeenAt: Date.now(),
      lastSource: 'quiz',
      mistakeDebt: nextMistakeDebt(previous, correct)
    };
    state.daily.total += 1;
    state.daily[isNew ? 'newWords' : 'reviews'] += 1;
    if (correct) state.daily.correct += 1;
    markDailyActivity(state, `word:${id}`);
    markStudyDay(state);
    saveState(state);
    updateHeader();
  }

  function recordConjugation(question, correct) {
    const state = loadState();
    const key = `${question.verb.infinitive}:${question.tense.key}:${question.pronoun}`;
    const previous = state.conjugations[key] || {
      attempts: 0,
      correct: 0,
      wrong: 0
    };
    state.conjugations[key] = {
      verb: question.verb.infinitive,
      verbMeaning: question.verb.meaning,
      tense: question.tense.name,
      pronoun: question.pronoun,
      attempts: nonNegativeNumber(previous.attempts) + 1,
      correct: nonNegativeNumber(previous.correct) + (correct ? 1 : 0),
      wrong: nonNegativeNumber(previous.wrong) + (correct ? 0 : 1),
      lastSeenAt: Date.now(),
      mistakeDebt: nextMistakeDebt(previous, correct)
    };
    state.daily.total += 1;
    if (correct) state.daily.correct += 1;
    markDailyActivity(state, `drill:${key}`);
    markStudyDay(state);
    saveState(state);
    updateHeader();
  }

  function mistakeWords() {
    const records = loadState().records;
    return wordsForLevel(targetLevel)
      .filter(word => unresolvedMistakes(records[word.id]) > 0)
      .sort((a, b) => {
        const recordA = records[a.id];
        const recordB = records[b.id];
        return unresolvedMistakes(recordB) - unresolvedMistakes(recordA) ||
          recordB.wrong - recordA.wrong ||
          recordA.correct - recordB.correct ||
          recordB.lastSeenAt - recordA.lastSeenAt;
      });
  }

  function getWeakQueue(limit) {
    return mistakeWords().slice(0, limit);
  }

  function getFavoriteQueue(limit) {
    const state = loadState();
    const favorites = wordsForLevel(targetLevel)
      .filter(word => state.favorites[word.id]);
    const due = favorites
      .filter(word => {
        const record = state.records[word.id];
        return record && record.dueAt <= Date.now();
      })
      .sort((a, b) => state.records[a.id].dueAt - state.records[b.id].dueAt);
    const dueIds = new Set(due.map(word => word.id));
    return [
      ...due,
      ...shuffle(favorites.filter(word => !dueIds.has(word.id)))
    ].slice(0, limit);
  }

  function overview() {
    const state = loadState();
    const now = Date.now();
    const levelWords = wordsForLevel(targetLevel);
    const records = levelWords
      .map(word => state.records[word.id])
      .filter(Boolean);
    const correct = records.reduce((sum, item) => sum + (item.correct || 0), 0);
    const attempts = records.reduce(
      (sum, item) => sum + (item.correct || 0) + (item.wrong || 0),
      0
    );
    const drills = Object.values(state.conjugations || {});
    const drillCorrect = drills.reduce((sum, item) => sum + (item.correct || 0), 0);
    const drillAttempts = drills.reduce((sum, item) => sum + (item.attempts || 0), 0);
    return {
      total: levelWords.length,
      learned: records.length,
      due: records.filter(item => item.dueAt <= now).length,
      fresh: levelWords.length - records.length,
      accuracy: attempts ? Math.round((correct / attempts) * 100) : null,
      mistakes: mistakeWords().length,
      drillAccuracy: drillAttempts ? Math.round((drillCorrect / drillAttempts) * 100) : null,
      today: state.daily,
      streak: state.streak
    };
  }

  function reviewForecast() {
    const state = loadState();
    const levelIds = new Set(wordsForLevel(targetLevel).map(word => word.id));
    const records = Object.entries(state.records)
      .filter(([id]) => levelIds.has(id))
      .map(([, record]) => record)
      .filter(record => record && Number.isFinite(Number(record.dueAt)));
    const now = Date.now();
    const endToday = new Date();
    endToday.setHours(23, 59, 59, 999);
    const endTomorrow = new Date(endToday);
    endTomorrow.setDate(endTomorrow.getDate() + 1);
    const endWindow = new Date(endToday);
    endWindow.setDate(endWindow.getDate() + 7);
    return {
      laterToday: records.filter(record =>
        Number(record.dueAt) > now && Number(record.dueAt) <= endToday.getTime()
      ).length,
      tomorrow: records.filter(record =>
        Number(record.dueAt) > endToday.getTime() &&
        Number(record.dueAt) <= endTomorrow.getTime()
      ).length,
      nextSevenDays: records.filter(record =>
        Number(record.dueAt) > now &&
        Number(record.dueAt) <= endWindow.getTime()
      ).length
    };
  }

  function weeklyActivity() {
    const state = loadState();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const days = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - offset);
      const key = todayKey(date);
      const count = key === state.daily.date
        ? state.daily.uniqueActivities.length
        : nonNegativeNumber(state.history[key] && state.history[key].activityCount);
      days.push({
        key,
        count,
        label: weekdays[date.getDay()],
        isToday: key === state.daily.date
      });
    }
    const maximum = Math.max(1, ...days.map(day => day.count));
    return {
      days: days.map(day => ({
        ...day,
        height: Math.round((day.count / maximum) * 100)
      })),
      total: days.reduce((sum, day) => sum + day.count, 0)
    };
  }

  function getQueue(limit) {
    const state = loadState();
    const due = [];
    const fresh = [];
    wordsForLevel(targetLevel).forEach(word => {
      const record = state.records[word.id];
      if (!record) fresh.push(word);
      else if (record.dueAt <= Date.now()) due.push(word);
    });
    due.sort((a, b) => state.records[a.id].dueAt - state.records[b.id].dueAt);
    return due.concat(shuffle(fresh)).slice(0, limit);
  }

  function getDueQueue(limit) {
    const state = loadState();
    return WORDS
      .filter(word => {
        const record = state.records[word.id];
        return wordLevel(word) === targetLevel && record && record.dueAt <= Date.now();
      })
      .sort((a, b) => state.records[a.id].dueAt - state.records[b.id].dueAt)
      .slice(0, limit);
  }

  function wordStatus(id) {
    const record = loadState().records[id];
    if (!record) return { key: 'new', label: '未学习', nextReview: '' };
    return {
      key: record.dueAt <= Date.now() ? 'due' : 'learned',
      label: record.dueAt <= Date.now() ? '待复习' : '已掌握',
      nextReview: nextReviewLabel(record)
    };
  }

  function toggleFavorite(id) {
    if (!WORD_IDS.has(id)) return false;
    const state = loadState();
    const active = !state.favorites[id];
    if (active) state.favorites[id] = Date.now();
    else delete state.favorites[id];
    saveState(state);
    return active;
  }

  function categoryProgress() {
    const records = loadState().records;
    return Object.keys(CATEGORIES).map(key => {
      const list = wordsForLevel(targetLevel).filter(word => word.category === key);
      const learned = list.filter(word => records[word.id]).length;
      return {
        key,
        ...CATEGORIES[key],
        total: list.length,
        learned,
        percent: list.length ? Math.round((learned / list.length) * 100) : 0
      };
    }).filter(item => item.total > 0);
  }

  function wordLevel(word) {
    return word.level || 'A1';
  }

  function wordsForLevel(level) {
    return WORDS.filter(word => wordLevel(word) === level);
  }

  function setView(view, syncHash = true) {
    if (!VIEWS.includes(view)) view = 'home';
    if (syncHash && location.hash !== `#${view}`) {
      history.pushState({ view }, '', `#${view}`);
    }
    currentView = view;
    document.querySelectorAll('[data-nav]').forEach(button => {
      const isActive = button.dataset.nav === view;
      button.classList.toggle('active', isActive);
      if (isActive) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    if (view === 'study' && !studySession) {
      studySession = restoreStudySession();
      if (!studySession) startStudy();
    }
    if (view === 'quiz' && !quizSession) {
      quizSession = restoreQuizSession();
      if (quizSession) {
        quizMode = quizSession.mode;
      } else {
        startQuiz();
      }
    }
    if (view === 'conjugation' && !drillSession) {
      drillSession = restoreDrillSession();
      if (!drillSession) startConjugation();
    }
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateHeader() {
    const meta = {
      home: [`DELE ${targetLevel}`, '今日学习'],
      study: ['SM-2 复习', '把词真正记住'],
      quiz: ['随机小测', '选择、拼写与听写'],
      mistakes: ['错题回炉', '错题复习'],
      conjugation: ['动词变位', '规则与不规则形式'],
      vocabulary: ['DELE 词库', `${targetLevel} 词库`]
    }[currentView];
    document.querySelector('#view-kicker').textContent = meta[0];
    document.querySelector('#view-title').textContent = meta[1];
    document.querySelector('#streak-pill').textContent =
      `连续 ${activeStreakDays(loadState().streak)} 天`;
  }

  function render() {
    updateHeader();
    if (currentView === 'home') renderHome();
    if (currentView === 'study') renderStudy();
    if (currentView === 'quiz') renderQuiz();
    if (currentView === 'mistakes') renderMistakes();
    if (currentView === 'conjugation') renderConjugation();
    if (currentView === 'vocabulary') renderVocabulary();
  }

  function renderHome() {
    const data = overview();
    const forecast = reviewForecast();
    const week = weeklyActivity();
    const categories = categoryProgress();
    const levelCounts = ['B1', 'B2', 'C1']
      .map(level => `${level} ${wordsForLevel(level).length}`)
      .join(' · ');
    const homeCategories = categories
      .slice()
      .sort((a, b) => b.learned - a.learned || b.total - a.total)
      .slice(0, 6);
    const dailyDone = (data.today.uniqueActivities || []).length;
    const dailyPercent = Math.min(100, Math.round((dailyDone / dailyGoal) * 100));
    const goalComplete = dailyDone >= dailyGoal;
    const queuedDue = Math.min(data.due, dailyGoal);
    const queuedFresh = Math.min(data.fresh, Math.max(0, dailyGoal - queuedDue));
    const queueCopy = [
      queuedDue ? `${queuedDue} 个待复习` : '',
      queuedFresh ? `${queuedFresh} 个新词` : ''
    ].filter(Boolean).join(' · ') || '暂无新词或到期复习';
    const accuracyCopy = data.accuracy === null ? '—' : `${data.accuracy}%`;
    app.innerHTML = `
      <section class="view">
        <div class="hero">
          <div class="hero-grid">
            <div>
              <span class="eyebrow">${goalComplete ? '今日目标已完成' : '今天的学习目标'}</span>
              <h1>DELE ${targetLevel}</h1>
              <p>先回想，再看答案。系统会自动安排下次复习。</p>
            </div>
            <div class="goal-panel">
              <div class="goal-head">
                <div><strong>${dailyDone}</strong><span> / ${dailyGoal} 项</span></div>
                <span>${dailyPercent}%</span>
              </div>
              <div class="progress-track" role="progressbar" aria-label="今日学习目标"
                   aria-valuemin="0" aria-valuemax="${dailyGoal}" aria-valuenow="${Math.min(dailyDone, dailyGoal)}">
                <div class="progress-fill" style="width:${dailyPercent}%"></div>
              </div>
              <div class="goal-foot">
                <span>${goalComplete ? '已达到今日目标，可以继续巩固' : '同一词或变位每天只计一次'}</span>
                <div class="goal-switch" role="group" aria-label="每日学习目标">
                  ${DAILY_GOALS.map(goal => `
                    <button class="${dailyGoal === goal ? 'active' : ''}" data-daily-goal="${goal}"
                            aria-pressed="${dailyGoal === goal}" title="每日 ${goal} 项">${goal}</button>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat"><strong>${data.learned}</strong><span>已接触</span></div>
          <div class="stat"><strong>${data.due}</strong><span>待复习</span></div>
          <div class="stat"><strong>${data.fresh}</strong><span>未学习</span></div>
          <div class="stat"><strong>${accuracyCopy}</strong><span>正确率</span></div>
        </div>

        <div class="review-forecast" aria-label="复习节奏">
          <span class="forecast-label">复习节奏</span>
          <div><strong>${data.due}</strong><span>现在</span></div>
          <div><strong>${forecast.laterToday}</strong><span>今天稍后</span></div>
          <div><strong>${forecast.tomorrow}</strong><span>明天</span></div>
          <div><strong>${forecast.nextSevenDays}</strong><span>未来 7 天</span></div>
        </div>

        <div class="weekly-activity">
          <div class="weekly-head">
            <div><strong>最近 7 天</strong><span>同一词或变位每天只计一次</span></div>
            <strong>${week.total} 项</strong>
          </div>
          <div class="week-chart" aria-label="最近七天学习活动">
            ${week.days.map(day => `
              <div class="week-column${day.isToday ? ' today' : ''}" title="${day.key}：${day.count} 项">
                <span>${day.count || ''}</span>
                <div class="week-bar"><div style="height:${day.height}%"></div></div>
                <small>${day.label}</small>
              </div>
            `).join('')}
          </div>
        </div>

        ${data.due ? `
          <button class="review-banner" data-start-due>
            <span><strong>${data.due}</strong> 个 ${targetLevel} 词今天到期</span>
            <span>开始专项复习 →</span>
          </button>
        ` : ''}
        ${data.mistakes ? `
          <button class="review-banner weak" data-start-weak>
            <span><strong>${data.mistakes}</strong> 个 ${targetLevel} 错词需要回炉</span>
            <span>开始错题重练 →</span>
          </button>
        ` : ''}

        <div class="dele-level-strip">
          <span>当前目标</span>
          <div class="level-switch">
            ${['B1', 'B2', 'C1'].map(level => `<button class="${targetLevel === level ? 'active' : ''}" data-target-level="${level}">DELE ${level}</button>`).join('')}
          </div>
          <small>${levelCounts} · 按公开 DELE 能力主题自主整理，非官方词表</small>
        </div>

        <div class="home-actions">
          <button class="quick-card primary" data-start-study>
            <span class="icon">▤</span>
            <h3>开始学习</h3>
            <p>${queueCopy}</p>
          </button>
          <button class="quick-card" data-nav="quiz">
            <span class="icon">?</span>
            <h3>小测</h3>
            <p>选择 / 拼写 / 听写</p>
          </button>
          <button class="quick-card" data-nav="mistakes">
            <span class="icon">↺</span>
            <h3>错题</h3>
            <p>${data.mistakes} 个词待巩固${data.drillAccuracy !== null ? ` · 变位 ${data.drillAccuracy}%` : ''}</p>
          </button>
          <button class="quick-card" data-nav="conjugation">
            <span class="icon">V</span>
            <h3>变位</h3>
            <p>三种常用时态</p>
          </button>
        </div>

        <div class="section-head">
          <div><h2>分类进度</h2><p>优先显示已学习和词量较大的 6 个分类</p></div>
          <button class="text-button" data-nav="vocabulary" style="width:auto;color:var(--muted)">查看词库 →</button>
        </div>
        <div class="category-grid">
          ${homeCategories.map(item => `
            <div class="category-card" style="--category-color:${item.color}">
              <div class="category-top">
                <div class="category-name"><span class="dot"></span>${escapeHtml(item.name)}</div>
                <span class="category-count">${item.learned}/${item.total}</span>
              </div>
              <div class="mini-track"><div class="mini-fill" style="width:${item.percent}%"></div></div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  function startStudy(mode) {
    const dueOnly = mode === 'due';
    const weakOnly = mode === 'weak';
    const favoritesOnly = mode === 'favorites';
    studySession = {
      queue: dueOnly
        ? getDueQueue(20)
        : weakOnly
          ? getWeakQueue(20)
          : favoritesOnly
            ? getFavoriteQueue(dailyGoal)
            : getQueue(dailyGoal),
      index: 0,
      flipped: false,
      known: 0,
      weak: 0,
      finished: false,
      history: [],
      mode: weakOnly ? 'weak' : dueOnly ? 'due' : favoritesOnly ? 'favorites' : 'daily'
    };
    saveStudySession();
  }

  function getSessionStore() {
    try {
      return window.sessionStorage || null;
    } catch (error) {
      return null;
    }
  }

  function clearStudySession() {
    const store = getSessionStore();
    if (store) store.removeItem(STUDY_SESSION_KEY);
  }

  function saveStudySession() {
    const store = getSessionStore();
    if (!store) return;
    if (!studySession || studySession.finished || !studySession.queue.length) {
      store.removeItem(STUDY_SESSION_KEY);
      return;
    }
    store.setItem(STUDY_SESSION_KEY, JSON.stringify({
      version: 1,
      mode: studySession.mode,
      queue: studySession.queue.map(word => word.id),
      index: studySession.index,
      flipped: studySession.flipped,
      known: studySession.known,
      weak: studySession.weak
    }));
  }

  function restoreStudySession() {
    const store = getSessionStore();
    if (!store) return null;
    try {
      const saved = JSON.parse(store.getItem(STUDY_SESSION_KEY));
      if (!saved ||
          saved.version !== 1 ||
          !['daily', 'due', 'weak', 'favorites'].includes(saved.mode) ||
          !Array.isArray(saved.queue) ||
          !saved.queue.length) {
        clearStudySession();
        return null;
      }
      const wordsById = new Map(WORDS.map(word => [word.id, word]));
      const queue = saved.queue.map(id => wordsById.get(id));
      const index = nonNegativeNumber(saved.index);
      const known = nonNegativeNumber(saved.known);
      const weak = nonNegativeNumber(saved.weak);
      if (queue.some(word => !word) ||
          !Number.isInteger(index) ||
          !Number.isInteger(known) ||
          !Number.isInteger(weak) ||
          index >= queue.length ||
          known + weak !== index) {
        clearStudySession();
        return null;
      }
      return {
        queue,
        index,
        flipped: Boolean(saved.flipped),
        known,
        weak,
        finished: false,
        history: [],
        mode: saved.mode
      };
    } catch (error) {
      clearStudySession();
      return null;
    }
  }

  function renderStudy() {
    const session = studySession;
    if (!session || session.finished) {
      const finishCopy = session && session.mode === 'weak'
        ? '错题已经重新过了一遍。仍有错误次数的词会继续留在错题本。'
        : session && session.mode === 'favorites'
          ? '收藏词已经重新过了一遍。可以继续补充重点词，或回到普通学习。'
        : '间隔复习比连续死记更牢。答错的内容会重新进入短周期复习。';
      app.innerHTML = finishPanel(
        '这一轮完成了',
        finishCopy,
        session ? session.known : 0,
        session ? session.weak : 0,
        session && session.history && session.history.length > 0
      );
      return;
    }
    if (!session.queue.length) {
      const emptyState = session.mode === 'weak'
        ? {
            title: '待巩固的错题已经清空',
            text: '可以继续小测，或回到首页开始今天的新词复习。',
            primary: ['data-nav="quiz"', '再测一轮'],
            secondary: ['data-nav="home"', '返回首页']
          }
        : session.mode === 'favorites'
          ? {
              title: '当前级别还没有可学习的收藏词',
              text: '可以在词库中收藏重点词，再回来开始专项学习。',
              primary: ['data-nav="vocabulary"', '去词库收藏'],
              secondary: ['data-nav="home"', '返回首页']
            }
        : session.mode === 'due'
          ? {
              title: '今天没有待复习内容',
              text: '可以去做一轮随机小测，或直接浏览专业词库。',
              primary: ['data-nav="quiz"', '开始小测'],
              secondary: ['data-nav="vocabulary"', '浏览词库']
            }
          : {
              title: '今天的学习已经完成',
              text: '新词和到期复习都已处理完，明天再按计划继续。',
              primary: ['data-nav="quiz"', '再做一组小测'],
              secondary: ['data-nav="home"', '返回首页']
            };
      app.innerHTML = `
        <section class="view">
          <div class="empty-state">
            <div class="finish-badge">✓</div>
            <h1>${emptyState.title}</h1>
            <p>${emptyState.text}</p>
            <div class="button-row">
              <button class="primary-button" ${emptyState.primary[0]}>${emptyState.primary[1]}</button>
              <button class="secondary-button" ${emptyState.secondary[0]}>${emptyState.secondary[1]}</button>
            </div>
          </div>
        </section>
      `;
      return;
    }

    const word = session.queue[session.index];
    const category = CATEGORIES[word.category];
    const studyTags = [word.pos, word.gender, word.level || 'A1'].filter(Boolean);
    const sideMeta = [targetLevel, word.pos, category.name].filter(Boolean);
    const favorite = Boolean(loadState().favorites[word.id]);
    const progress = Math.round((session.index / session.queue.length) * 100);
    app.innerHTML = `
      <section class="view study-layout">
        <div class="session-head">
          <span class="session-count">${session.index + 1} / ${session.queue.length}</span>
          <div class="session-tools">
            ${session.history.length ? '<button class="undo-chip" data-action="undo-card">撤销</button>' : ''}
            <button class="undo-chip${favorite ? ' active' : ''}" data-toggle-favorite="${escapeHtml(word.id)}"
                    aria-pressed="${favorite}">${favorite ? '★ 已收藏' : '☆ 收藏'}</button>
            <span class="badge">${escapeHtml(category.name)}</span>
          </div>
        </div>
        <div class="session-track" role="progressbar" aria-label="本轮学习进度"
             aria-valuemin="0" aria-valuemax="${session.queue.length}" aria-valuenow="${session.index}">
          <div class="session-fill" style="width:${progress}%"></div>
        </div>

        <div class="study-columns">
          <div class="study-focus">
            <article class="flashcard" data-flip tabindex="0"
                     aria-expanded="${session.flipped}">
              <div class="card-top">
                <span class="language-mark">ES</span>
                <div class="tags">
                  ${studyTags.map((tag, index) =>
                    `<span class="tag${index === studyTags.length - 1 ? ' level' : ''}">${escapeHtml(tag)}</span>`
                  ).join('')}
                </div>
              </div>
              <div class="card-main">
                ${session.flipped ? `
                  <div class="word-large word-back">${escapeHtml(word.zh)}</div>
                  <div class="speak-actions">
                    <button class="speak-button" data-action="speak" data-speak="${escapeHtml(word.es)}">🔊 朗读单词</button>
                    ${word.example ? `<button class="speak-button" data-action="speak" data-speak="${escapeHtml(word.example)}">🔊 朗读例句</button>` : ''}
                  </div>
                  ${word.register ? `<div class="word-register">${escapeHtml(word.register)} · ${escapeHtml(category.name)}</div>` : ''}
                  ${word.collocation ? `<div class="collocation"><strong>常见搭配：</strong><span lang="es">${escapeHtml(word.collocation)}</span></div>` : ''}
                  ${word.example ? `<div class="example-box" lang="es">${escapeHtml(word.example)}</div>` : ''}
                  ${word.exampleZh ? `<div class="example-zh" lang="zh-CN">${escapeHtml(word.exampleZh)}</div>` : ''}
                ` : `
                  <div class="word-large" lang="es">${escapeHtml(word.es)}</div>
                  <button class="speak-button" data-action="speak" data-speak="${escapeHtml(word.es)}">🔊 朗读</button>
                  <div class="card-hint">先在心里回想中文意思${word.collocation ? '和常见搭配' : ''}。</div>
                  <div class="card-hint" style="color:#b39a87">点击卡片揭晓答案</div>
                `}
              </div>
              <div class="card-bottom">
                <span>ESPANOL · ${escapeHtml(word.level || 'A1')}</span>
                <span>${session.flipped ? '再回忆一次，再判断' : '回忆完成后再翻面'}</span>
              </div>
            </article>

            ${session.flipped ? `
              <div class="study-action-row">
                <button class="secondary-button study-next" data-action="grade-weak">还不熟</button>
                <button class="primary-button study-next" data-action="grade-known">记住了</button>
              </div>
              <div class="swipe-hint">也可以左滑“还不熟”、右滑“记住了”</div>
              <div class="sm-note">系统会按 SM-2 间隔自动安排下次复习</div>
            ` : ''}
          </div>

          <aside class="study-side">
            <div class="side-panel">
              <span class="eyebrow">CURRENT WORD</span>
              <h3 lang="es">${escapeHtml(word.es)}</h3>
              <div class="side-meta">
                ${sideMeta.map(item => `<span>${escapeHtml(item)}</span>`).join('')}
              </div>
              <button class="secondary-button side-speak" data-action="speak" data-speak="${escapeHtml(word.es)}">🔊 听发音</button>
              <div class="side-divider"></div>
              <div class="side-label">本轮进度</div>
              <div class="side-progress-copy"><strong>${session.index + 1}</strong><span>/ ${session.queue.length}</span></div>
              <div class="side-label">键盘快捷键</div>
              <div class="shortcut-row"><kbd>←</kbd><span>还不熟</span></div>
              <div class="shortcut-row"><kbd>→</kbd><span>记住了</span></div>
              <div class="shortcut-row"><kbd>Space</kbd><span>翻面 / 记住</span></div>
              <div class="shortcut-row"><kbd>⌘ Z</kbd><span>撤销</span></div>
            </div>
          </aside>
        </div>
      </section>
    `;
  }

  function handleGrade(grade) {
    const session = studySession;
    if (!session || !session.flipped || session.finished) return;
    const word = session.queue[session.index];
    session.history.push({
      state: localStorage.getItem(STORAGE_KEY),
      index: session.index,
      known: session.known,
      weak: session.weak
    });
    gradeWord(word.id, grade);
    if (grade >= 3) session.known += 1;
    else session.weak += 1;
    session.index += 1;
    session.flipped = false;
    if (session.index >= session.queue.length) session.finished = true;
    saveStudySession();
    renderStudy();
  }

  function undoLastCard() {
    const session = studySession;
    if (!session || !session.history || !session.history.length) return;
    const previous = session.history.pop();
    if (previous.state == null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, previous.state);
    invalidateStateCache();
    session.index = previous.index;
    session.known = previous.known;
    session.weak = previous.weak;
    session.flipped = true;
    session.finished = false;
    saveStudySession();
    updateHeader();
    renderStudy();
    showToast('已撤销上一张');
  }

  function finishPanel(title, text, known, weak, canUndo) {
    return `
      <section class="view">
        <div class="finish-panel">
          <div class="finish-badge">✓</div>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(text)}</p>
          <div class="finish-stats">
            <div><strong>${known}</strong><span>记住了</span></div>
            <div><strong>${weak}</strong><span>还不熟</span></div>
            <div><strong>${known + weak}</strong><span>本轮复习</span></div>
          </div>
          <div class="button-row">
            <button class="primary-button" data-action="study-again">再学一轮</button>
            ${weak > 0 ? '<button class="secondary-button" data-nav="mistakes">查看错题</button>' : ''}
            ${canUndo ? '<button class="secondary-button" data-action="undo-card">撤销上一张</button>' : ''}
            <button class="secondary-button" data-nav="home">返回首页</button>
          </div>
        </div>
      </section>
    `;
  }

  function selectQuizWords(eligibleWords) {
    const state = loadState();
    const priority = eligibleWords.filter(word => {
      const record = state.records[word.id];
      return record && (unresolvedMistakes(record) > 0 || record.dueAt <= Date.now());
    });
    const priorityIds = new Set(priority.map(word => word.id));
    return [
      ...shuffle(priority).slice(0, 6),
      ...shuffle(eligibleWords.filter(word => !priorityIds.has(word.id)))
    ].slice(0, 10);
  }

  function buildQuiz() {
    const levelWords = wordsForLevel(targetLevel);
    const selected = selectQuizWords(levelWords);
    return selected.map((word, index) => {
      const toChinese = index % 2 === 0;
      const answer = toChinese ? word.zh : word.es;
      const otherTexts = [];
      shuffle(levelWords).forEach(item => {
        const text = toChinese ? item.zh : item.es;
        const sameMeaning = !toChinese &&
          normalizeText(item.zh) === normalizeText(word.zh);
        if (!sameMeaning && text !== answer && !otherTexts.includes(text)) {
          otherTexts.push(text);
        }
      });
      const options = shuffle([answer, ...otherTexts.slice(0, 3)]).map((text, optionIndex) => ({
        text,
        letter: 'ABCD'[optionIndex],
        correct: text === answer
      }));
      return {
        word,
        direction: toChinese ? '西 → 中' : '中 → 西',
        prompt: toChinese ? word.es : word.zh,
        answer,
        options,
        answered: false,
        selected: ''
      };
    });
  }

  function buildTypedQuiz(mode) {
    const eligibleWords = wordsForLevel(targetLevel).filter(word =>
      word.es.length <= 40 &&
      !/[(),/;:!?¿¡]/.test(word.es)
    );
    return selectQuizWords(eligibleWords).map(word => ({
      word,
      direction: mode === 'dictation' ? '听 → 西' : '中 → 西',
      prompt: mode === 'dictation' ? '' : word.zh,
      answer: word.es,
      answered: false,
      selected: '',
      exactMatch: false,
      correct: false
    }));
  }

  function startQuiz(mode = quizMode) {
    if (QUIZ_MODES.includes(mode)) {
      quizMode = mode;
      localStorage.setItem(QUIZ_MODE_KEY, quizMode);
    }
    quizSession = {
      mode: quizMode,
      questions: quizMode === 'choice' ? buildQuiz() : buildTypedQuiz(quizMode),
      index: 0,
      score: 0,
      finished: false
    };
    saveQuizSession();
  }

  function clearQuizSession() {
    const store = getSessionStore();
    if (store) store.removeItem(QUIZ_SESSION_KEY);
  }

  function saveQuizSession() {
    const store = getSessionStore();
    if (!store) return;
    if (!quizSession || quizSession.finished) {
      store.removeItem(QUIZ_SESSION_KEY);
      return;
    }
    store.setItem(QUIZ_SESSION_KEY, JSON.stringify({
      version: 1,
      mode: quizSession.mode,
      index: quizSession.index,
      score: quizSession.score,
      questions: quizSession.questions.map(question => quizSession.mode !== 'choice'
        ? {
            wordId: question.word.id,
            answered: question.answered,
            selected: question.selected,
            exactMatch: question.exactMatch,
            correct: question.correct
          }
        : {
            wordId: question.word.id,
            direction: question.direction,
            options: question.options,
            answered: question.answered,
            selected: question.selected
          })
    }));
  }

  function restoreQuizSession() {
    const store = getSessionStore();
    if (!store) return null;
    try {
      const saved = JSON.parse(store.getItem(QUIZ_SESSION_KEY));
      if (!saved ||
          saved.version !== 1 ||
          !Array.isArray(saved.questions) ||
          saved.questions.length !== 10) {
        clearQuizSession();
        return null;
      }
      const wordsById = new Map(WORDS.map(word => [word.id, word]));
      const index = Number(saved.index);
      const score = Number(saved.score);
      const mode = QUIZ_MODES.includes(saved.mode) ? saved.mode : 'choice';
      const questions = saved.questions.map(savedQuestion => {
        const word = wordsById.get(savedQuestion.wordId);
        if (!word) return null;
        const answered = Boolean(savedQuestion.answered);
        const selected = typeof savedQuestion.selected === 'string'
          ? savedQuestion.selected
          : '';
        if (mode !== 'choice') {
          return {
            word,
            direction: mode === 'dictation' ? '听 → 西' : '中 → 西',
            prompt: mode === 'dictation' ? '' : word.zh,
            answer: word.es,
            answered,
            selected: answered ? selected : '',
            exactMatch: Boolean(savedQuestion.exactMatch),
            correct: Boolean(savedQuestion.correct)
          };
        }
        const direction = savedQuestion.direction;
        const options = savedQuestion.options;
        if (!['西 → 中', '中 → 西'].includes(direction) ||
            !Array.isArray(options) ||
            options.length !== 4 ||
            options.some(option =>
              !option ||
              typeof option.text !== 'string' ||
              !['A', 'B', 'C', 'D'].includes(option.letter) ||
              typeof option.correct !== 'boolean'
            ) ||
            options.filter(option => option.correct).length !== 1) {
          return null;
        }
        const toChinese = direction === '西 → 中';
        const answer = toChinese ? word.zh : word.es;
        const correctOption = options.find(option => option.correct);
        if (correctOption.text !== answer ||
            (answered && !options.some(option => option.text === selected))) {
          return null;
        }
        return {
          word,
          direction,
          prompt: toChinese ? word.es : word.zh,
          answer,
          options,
          answered,
          selected: answered ? selected : ''
        };
      });
      if (questions.some(question => !question) ||
          !Number.isInteger(index) ||
          !Number.isInteger(score) ||
          index < 0 ||
          index >= questions.length ||
          score < 0 ||
          score > questions.length) {
        clearQuizSession();
        return null;
      }
      return { mode, questions, index, score, finished: false };
    } catch (error) {
      clearQuizSession();
      return null;
    }
  }

  function renderQuiz() {
    const session = quizSession;
    if (!session || session.finished) {
      const score = session ? session.score : 0;
      app.innerHTML = `
        <section class="view">
          <div class="finish-panel">
            <div class="finish-badge">${score >= 8 ? '¡B!' : '?'}</div>
            <h1>${score >= 8 ? '¡Muy bien!' : '继续练习'}</h1>
            <p>本轮答对 ${score} / 10 题。${score >= 8 ? '记忆正在变牢，保持节奏。' : '答错的已掌握词会进入短周期复习。'}</p>
            <div class="button-row">
              <button class="primary-button" data-action="quiz-restart">再来一组</button>
              ${score < 10 ? '<button class="secondary-button" data-nav="mistakes">查看错题</button>' : ''}
              <button class="secondary-button" data-nav="home">返回首页</button>
            </div>
          </div>
        </section>
      `;
      return;
    }

    const question = session.questions[session.index];
    const category = CATEGORIES[question.word.category];
    const favorite = Boolean(loadState().favorites[question.word.id]);
    const modeSwitch = `
      <div class="quiz-mode-switch" role="group" aria-label="小测模式">
        <button class="${session.mode === 'choice' ? 'active' : ''}" data-quiz-mode="choice"
                aria-pressed="${session.mode === 'choice'}">四选一</button>
        <button class="${session.mode === 'spelling' ? 'active' : ''}" data-quiz-mode="spelling"
                aria-pressed="${session.mode === 'spelling'}">拼写</button>
        <button class="${session.mode === 'dictation' ? 'active' : ''}" data-quiz-mode="dictation"
                aria-pressed="${session.mode === 'dictation'}">听写</button>
      </div>
    `;
    if (session.mode !== 'choice') {
      const isDictation = session.mode === 'dictation';
      const answerLabel = isDictation ? '听写正确' : '拼写正确';
      const feedbackClass = question.correct ? 'good' : '';
      app.innerHTML = `
        <section class="view quiz-layout">
          <div class="session-head">
            <span class="session-count">第 ${session.index + 1} / 10 题</span>
            <span class="badge">${question.direction}</span>
          </div>
          ${modeSwitch}
          <div class="session-track" role="progressbar" aria-label="${isDictation ? '听写' : '拼写'}小测进度"
               aria-valuemin="0" aria-valuemax="10" aria-valuenow="${session.index}">
            <div class="session-fill" style="width:${session.index * 10}%"></div>
          </div>
          <div class="spelling-card">
            <div class="question-label">${isDictation ? '听发音，写出西班牙语' : '看中文，写出西班牙语'}</div>
            ${isDictation ? `
              <button class="dictation-play" data-action="speak" data-speak="${escapeHtml(question.word.es)}">🔊 播放发音</button>
            ` : `
              <div class="question-word spelling-prompt" lang="zh-CN">${escapeHtml(question.prompt)}</div>
            `}
            <div class="spelling-category">${escapeHtml(category.name)} · ${escapeHtml(question.word.level || 'A1')}</div>
            ${question.answered ? `
              <div class="feedback-box ${feedbackClass}" role="status">
                <div class="feedback-title">${question.correct
                  ? question.exactMatch ? answerLabel : `${answerLabel}，注意重音符号`
                  : `正确答案：<span lang="es">${escapeHtml(question.answer)}</span>`}</div>
                <div class="spelling-answer-preview">你的答案：${question.selected
                  ? `<span lang="es">${escapeHtml(question.selected)}</span>`
                  : '未作答'}</div>
                <div class="feedback-meta">
                  <span lang="es">${escapeHtml(question.word.es)}</span>
                  <span>${escapeHtml(question.word.zh)}</span>
                  ${question.word.pos ? `<span>${escapeHtml(question.word.pos)}</span>` : ''}
                  ${question.word.gender ? `<span>${escapeHtml(question.word.gender)}</span>` : ''}
                </div>
                ${question.word.collocation ? `<div class="feedback-collocation"><strong>搭配：</strong><span lang="es">${escapeHtml(question.word.collocation)}</span></div>` : ''}
                ${question.word.example ? `<div class="feedback-example" lang="es">${escapeHtml(question.word.example)}</div>` : ''}
                ${question.word.exampleZh ? `<div class="feedback-zh" lang="zh-CN">${escapeHtml(question.word.exampleZh)}</div>` : ''}
                <div class="speak-actions">
                  <button class="inline-speak" data-action="speak" data-speak="${escapeHtml(question.word.es)}">🔊 朗读单词</button>
                  ${question.word.example ? `<button class="inline-speak" data-action="speak" data-speak="${escapeHtml(question.word.example)}">🔊 朗读例句</button>` : ''}
                  <button class="inline-speak favorite-toggle${favorite ? ' active' : ''}"
                          data-toggle-favorite="${escapeHtml(question.word.id)}" aria-pressed="${favorite}">
                    ${favorite ? '★ 已收藏' : '☆ 收藏'}
                  </button>
                </div>
                <button class="primary-button" data-action="quiz-next">${session.index === 9 ? '查看结果' : '下一题'}</button>
              </div>
            ` : `
              <form class="spelling-form" data-spelling-form>
                <label for="spelling-answer">西班牙语答案</label>
                <input id="spelling-answer" name="spelling-answer" class="spelling-input"
                       type="text" inputmode="text" autocomplete="off" autocapitalize="none"
                       spellcheck="false" placeholder="输入西班牙语">
                <div class="spelling-hint">大小写不敏感，重音符号可以省略。</div>
                <div class="typed-form-actions">
                  <button class="primary-button" type="submit" data-action="check-typed">${isDictation ? '检查听写' : '检查拼写'}</button>
                  <button class="secondary-button" type="button" data-action="reveal-typed">不会，显示答案</button>
                </div>
              </form>
            `}
          </div>
        </section>
      `;
      return;
    }
    app.innerHTML = `
      <section class="view quiz-layout">
        <div class="session-head">
          <span class="session-count">第 ${session.index + 1} / 10 题</span>
          <span class="badge">${question.direction}</span>
        </div>
        ${modeSwitch}
        <div class="session-track" role="progressbar" aria-label="小测进度"
             aria-valuemin="0" aria-valuemax="10" aria-valuenow="${session.index}">
          <div class="session-fill" style="width:${session.index * 10}%"></div>
        </div>
        <div class="quiz-columns">
          <div class="quiz-left">
            <div class="question-card">
              <div class="question-label">请选择正确的意思</div>
              <div class="question-word" lang="${question.direction === '西 → 中' ? 'es' : 'zh-CN'}">${escapeHtml(question.prompt)}</div>
              ${question.direction === '西 → 中' ? `<button class="question-speak" data-action="speak" data-speak="${escapeHtml(question.word.es)}">🔊 听发音</button>` : ''}
            </div>
          </div>
          <div class="quiz-right">
            <div class="options-list">
              ${question.options.map((option, index) => {
                let className = 'option-button';
                if (question.answered && option.correct) className += ' correct';
                if (question.answered && question.selected === option.text && !option.correct) className += ' wrong';
                return `
                  <button class="${className}" data-quiz-option="${index}" ${question.answered ? 'disabled' : ''}>
                    <span class="option-letter">${option.letter}</span>
                    <span lang="${question.direction === '中 → 西' ? 'es' : 'zh-CN'}">${escapeHtml(option.text)}</span>
                    ${question.answered && option.correct ? '<span style="margin-left:auto;color:#0d8a58">✓</span>' : ''}
                  </button>
                `;
              }).join('')}
            </div>
            <div class="quiz-keyboard-hint">键盘：A–D 选择 · Enter 下一题</div>
            ${question.answered ? `
              <div class="feedback-box ${question.selected === question.answer ? 'good' : ''}" role="status">
                <div class="feedback-title">${question.selected === question.answer
                  ? '答对了'
                  : `正确答案：<span lang="${question.direction === '中 → 西' ? 'es' : 'zh-CN'}">${escapeHtml(question.answer)}</span>`}</div>
                <div class="feedback-meta">
                  <span lang="es">${escapeHtml(question.word.es)}</span>
                  <span>${escapeHtml(question.word.zh)}</span>
                  ${question.word.pos ? `<span>${escapeHtml(question.word.pos)}</span>` : ''}
                  ${question.word.gender ? `<span>${escapeHtml(question.word.gender)}</span>` : ''}
                </div>
                ${question.word.collocation ? `<div class="feedback-collocation"><strong>搭配：</strong><span lang="es">${escapeHtml(question.word.collocation)}</span></div>` : ''}
                ${question.word.example ? `<div class="feedback-example" lang="es">${escapeHtml(question.word.example)}</div>` : ''}
                ${question.word.exampleZh ? `<div class="feedback-zh" lang="zh-CN">${escapeHtml(question.word.exampleZh)}</div>` : ''}
                <div class="speak-actions feedback-actions">
                  <button class="inline-speak" data-action="speak" data-speak="${escapeHtml(question.word.es)}">🔊 朗读单词</button>
                  ${question.word.example ? `<button class="inline-speak" data-action="speak" data-speak="${escapeHtml(question.word.example)}">🔊 朗读例句</button>` : ''}
                  <button class="inline-speak favorite-toggle${favorite ? ' active' : ''}"
                          data-toggle-favorite="${escapeHtml(question.word.id)}" aria-pressed="${favorite}">
                    ${favorite ? '★ 已收藏' : '☆ 收藏'}
                  </button>
                </div>
                <button class="primary-button" style="margin-top:14px" data-action="quiz-next">${session.index === 9 ? '查看结果' : '下一题'}</button>
              </div>
            ` : `
              <button class="secondary-button quiz-reveal" data-action="reveal-quiz">不会，显示答案</button>
            `}
          </div>
        </div>
      </section>
    `;
  }

  function chooseQuizOption(index) {
    const session = quizSession;
    const question = session && session.questions[session.index];
    if (!question || question.answered) return;
    const option = question.options[index];
    if (!option) return;
    question.answered = true;
    question.selected = option.text;
    if (option.correct) session.score += 1;
    recordQuiz(question.word.id, option.correct);
    saveQuizSession();
    renderQuiz();
  }

  function submitTypedAnswer() {
    const session = quizSession;
    const question = session && session.questions[session.index];
    const input = document.querySelector('#spelling-answer');
    if (!question || question.answered || session.mode === 'choice' || !input) return;
    const value = String(input.value || '').trim();
    if (!value) {
      showToast('请先输入西班牙语答案');
      return;
    }
    question.answered = true;
    question.selected = value;
    question.exactMatch = normalizeSpelling(value) === normalizeSpelling(question.answer);
    question.correct = normalizeSpelling(value, true) === normalizeSpelling(question.answer, true);
    if (question.correct) session.score += 1;
    recordQuiz(question.word.id, question.correct);
    saveQuizSession();
    renderQuiz();
  }

  function revealQuizAnswer() {
    const session = quizSession;
    const question = session && session.questions[session.index];
    if (!question || question.answered) return;
    question.answered = true;
    question.selected = '';
    question.exactMatch = false;
    question.correct = false;
    recordQuiz(question.word.id, false);
    saveQuizSession();
    renderQuiz();
  }

  function nextQuizQuestion() {
    const session = quizSession;
    if (!session) return;
    if (session.index >= session.questions.length - 1) {
      session.finished = true;
    } else {
      session.index += 1;
    }
    saveQuizSession();
    renderQuiz();
  }

  function renderMistakes() {
    const state = loadState();
    const words = mistakeWords();
    const visibleWords = words.slice(0, 100);
    const drillMistakes = Object.values(state.conjugations || {})
      .filter(item => unresolvedMistakes(item) > 0)
      .sort((a, b) =>
        unresolvedMistakes(b) - unresolvedMistakes(a) ||
        b.wrong - a.wrong ||
        b.lastSeenAt - a.lastSeenAt
      );
    const totalWordErrors = words.reduce(
      (sum, word) => sum + (state.records[word.id].wrong || 0),
      0
    );
    const totalDrillErrors = drillMistakes.reduce((sum, item) => sum + item.wrong, 0);

    app.innerHTML = `
      <section class="view">
        <div class="section-head" style="margin-top:0">
          <div>
            <h2>${targetLevel} 错题本</h2>
            <p>词和变位答错后自动汇总；答对一次减少一次待巩固，归零后移出。</p>
          </div>
          ${words.length ? '<button class="primary-button" data-start-weak>错题重练 20 个</button>' : ''}
        </div>

        <div class="mistake-summary">
          <div><strong>${words.length}</strong><span>待巩固错词</span></div>
          <div><strong>${totalWordErrors}</strong><span>词错次</span></div>
          <div><strong>${totalDrillErrors}</strong><span>变位错次</span></div>
        </div>

        ${words.length ? `
          <div class="mistake-list">
            ${visibleWords.map(word => {
              const record = state.records[word.id];
              const category = CATEGORIES[word.category];
              return `
                <div class="mistake-row">
                  <div class="mistake-copy">
                    <strong lang="es">${escapeHtml(word.es)}</strong>
                    <p>${escapeHtml(word.zh)} · ${escapeHtml(category.name)} · ${escapeHtml(word.level || 'A1')}</p>
                  </div>
                  <div class="mistake-metrics">
                    <div class="mistake-danger">待巩固 ${unresolvedMistakes(record)}</div>
                    <div>累计错 ${record.wrong || 0}</div>
                  </div>
                  <button class="inline-speak" data-action="speak" data-speak="${escapeHtml(word.es)}" style="margin:0">🔊</button>
                </div>
              `;
            }).join('')}
          </div>
          ${words.length > visibleWords.length
            ? `<div class="vocab-empty">错词较多，当前显示错误次数最高的 ${visibleWords.length} 个。</div>`
            : ''}
        ` : `
          <div class="empty-state" style="min-height:38vh">
            <div class="finish-badge" style="background:var(--green)">✓</div>
            <h1>暂时没有错词</h1>
            <p>先去小测或学习，答错的内容会自动进入这里。</p>
            <div class="button-row">
              <button class="primary-button" data-nav="quiz">开始小测</button>
              <button class="secondary-button" data-nav="study">继续学习</button>
            </div>
          </div>
        `}

        <div class="section-head">
          <div>
            <h2>薄弱变位</h2>
            <p>按错误次数排序，最多显示最近练过的 20 项。</p>
          </div>
          <button class="text-button" data-nav="conjugation" style="width:auto;color:var(--muted)">练习变位 →</button>
        </div>
        ${drillMistakes.length ? `
          <div class="mistake-list">
            ${drillMistakes.slice(0, 20).map(item => `
              <div class="mistake-row">
                <div class="mistake-copy">
                  <strong><span lang="es">${escapeHtml(item.verb)}</span> · ${escapeHtml(item.tense)} · <span lang="es">${escapeHtml(item.pronoun)}</span></strong>
                  <p>${escapeHtml(item.verbMeaning || '')}</p>
                </div>
                <div class="mistake-metrics">
                  <div class="mistake-danger">待巩固 ${unresolvedMistakes(item)}</div>
                  <div>累计错 ${item.wrong || 0}</div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : '<div class="vocab-empty">变位练习答错后，会在这里显示具体动词、时态和人称。</div>'}
      </section>
    `;
  }

  function buildConjugationQuestions() {
    const questions = [];
    const used = new Set();
    const weak = Object.values(loadState().conjugations || {})
      .filter(item => unresolvedMistakes(item) > 0)
      .sort((a, b) =>
        unresolvedMistakes(b) - unresolvedMistakes(a) ||
        b.wrong - a.wrong ||
        b.lastSeenAt - a.lastSeenAt
      )
      .map(item => {
        const verb = DATA.verbs.find(candidate => candidate.infinitive === item.verb);
        const tense = DATA.tenses.find(candidate => candidate.name === item.tense);
        const personIndex = DATA.pronouns.indexOf(item.pronoun);
        return verb && tense && personIndex >= 0 ? { verb, tense, personIndex } : null;
      })
      .filter(Boolean)
      .slice(0, 6);
    while (questions.length < 10) {
      const weakness = questions.length < 6 && weak.length
        ? weak.shift()
        : null;
      const verb = weakness
        ? weakness.verb
        : DATA.verbs[Math.floor(Math.random() * DATA.verbs.length)];
      const tense = weakness
        ? weakness.tense
        : DATA.tenses[Math.floor(Math.random() * DATA.tenses.length)];
      const personIndex = weakness
        ? weakness.personIndex
        : Math.floor(Math.random() * DATA.pronouns.length);
      const key = `${verb.infinitive}:${tense.key}:${personIndex}`;
      if (used.has(key)) continue;
      used.add(key);
      const forms = verb.forms[tense.key];
      const answer = forms[personIndex];
      const distractors = shuffle(forms.filter(form => form !== answer)).slice(0, 3);
      const options = shuffle([answer, ...distractors]).map((text, index) => ({
        text,
        letter: 'ABCD'[index],
        correct: text === answer
      }));
      questions.push({ verb, tense, pronoun: DATA.pronouns[personIndex], answer, options, answered: false, selected: '' });
    }
    return questions;
  }

  function startConjugation() {
    drillSession = {
      questions: buildConjugationQuestions(),
      index: 0,
      score: 0,
      finished: false
    };
    saveDrillSession();
  }

  function clearDrillSession() {
    const store = getSessionStore();
    if (store) store.removeItem(DRILL_SESSION_KEY);
  }

  function saveDrillSession() {
    const store = getSessionStore();
    if (!store) return;
    if (!drillSession || drillSession.finished) {
      store.removeItem(DRILL_SESSION_KEY);
      return;
    }
    store.setItem(DRILL_SESSION_KEY, JSON.stringify({
      version: 1,
      index: drillSession.index,
      score: drillSession.score,
      questions: drillSession.questions.map(question => ({
        verb: question.verb.infinitive,
        tense: question.tense.key,
        personIndex: DATA.pronouns.indexOf(question.pronoun),
        options: question.options,
        answered: question.answered,
        selected: question.selected
      }))
    }));
  }

  function restoreDrillSession() {
    const store = getSessionStore();
    if (!store) return null;
    try {
      const saved = JSON.parse(store.getItem(DRILL_SESSION_KEY));
      if (!saved ||
          saved.version !== 1 ||
          !Array.isArray(saved.questions) ||
          saved.questions.length !== 10) {
        clearDrillSession();
        return null;
      }
      const questions = saved.questions.map(savedQuestion => {
        const verb = DATA.verbs.find(candidate =>
          candidate.infinitive === savedQuestion.verb
        );
        const tense = DATA.tenses.find(candidate =>
          candidate.key === savedQuestion.tense
        );
        const personIndex = Number(savedQuestion.personIndex);
        const options = savedQuestion.options;
        if (!verb ||
            !tense ||
            !Number.isInteger(personIndex) ||
            personIndex < 0 ||
            personIndex >= DATA.pronouns.length ||
            !Array.isArray(options) ||
            options.length !== 4 ||
            options.some(option =>
              !option ||
              typeof option.text !== 'string' ||
              !['A', 'B', 'C', 'D'].includes(option.letter) ||
              typeof option.correct !== 'boolean'
            ) ||
            options.filter(option => option.correct).length !== 1) {
          return null;
        }
        const answer = verb.forms[tense.key][personIndex];
        const correctOption = options.find(option => option.correct);
        if (!answer || correctOption.text !== answer) return null;
        const answered = Boolean(savedQuestion.answered);
        const selected = typeof savedQuestion.selected === 'string'
          ? savedQuestion.selected
          : '';
        if (answered && !options.some(option => option.text === selected)) return null;
        return {
          verb,
          tense,
          pronoun: DATA.pronouns[personIndex],
          answer,
          options,
          answered,
          selected: answered ? selected : ''
        };
      });
      const index = Number(saved.index);
      const score = Number(saved.score);
      if (questions.some(question => !question) ||
          !Number.isInteger(index) ||
          !Number.isInteger(score) ||
          index < 0 ||
          index >= questions.length ||
          score < 0 ||
          score > questions.length) {
        clearDrillSession();
        return null;
      }
      return { questions, index, score, finished: false };
    } catch (error) {
      clearDrillSession();
      return null;
    }
  }

  function renderConjugationReference() {
    const verb = DATA.verbs.find(candidate =>
      candidate.infinitive === referenceVerb
    ) || DATA.verbs[0];
    const tense = DATA.tenses.find(candidate =>
      candidate.key === referenceTense
    ) || DATA.tenses[0];
    referenceVerb = verb.infinitive;
    referenceTense = tense.key;
    const forms = verb.forms[tense.key];
    conjugationReference.innerHTML = `
      <div class="reference-toolbar">
        <label for="reference-verb">选择动词</label>
        <select id="reference-verb" class="select-box">
          ${DATA.verbs.map(candidate => `
            <option value="${escapeHtml(candidate.infinitive)}" ${candidate.infinitive === verb.infinitive ? 'selected' : ''}>
              ${escapeHtml(candidate.infinitive)} — ${escapeHtml(candidate.meaning)}
            </option>
          `).join('')}
        </select>
      </div>
      <div class="reference-tense-switch" role="group" aria-label="选择时态">
        ${DATA.tenses.map(candidate => `
          <button class="${candidate.key === tense.key ? 'active' : ''}" data-reference-tense="${escapeHtml(candidate.key)}"
                  aria-pressed="${candidate.key === tense.key}">${escapeHtml(candidate.name)}</button>
        `).join('')}
      </div>
      <div class="reference-verb-head">
        <strong lang="es">${escapeHtml(verb.infinitive)}</strong>
        <span>${escapeHtml(verb.meaning)} · ${escapeHtml(tense.name)}</span>
      </div>
      <div class="reference-table-wrap">
        <table class="conjugation-table">
          <thead><tr><th>人称</th><th>变位</th><th><span class="sr-only">朗读</span></th></tr></thead>
          <tbody>
            ${DATA.pronouns.map((pronoun, index) => `
              <tr>
                <td lang="es">${escapeHtml(pronoun)}</td>
                <td lang="es">${escapeHtml(forms[index])}</td>
                <td><button class="inline-speak reference-speak" data-action="speak" data-speak="${escapeHtml(forms[index])}">🔊</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function openConjugationReference(verb, tense) {
    if (DATA.verbs.some(candidate => candidate.infinitive === verb)) {
      referenceVerb = verb;
    }
    if (DATA.tenses.some(candidate => candidate.key === tense)) {
      referenceTense = tense;
    }
    renderConjugationReference();
    if (!conjugationDialog.open) conjugationDialog.showModal();
  }

  function renderConjugation() {
    const session = drillSession;
    if (!session || session.finished) {
      const score = session ? session.score : 0;
      app.innerHTML = `
        <section class="view">
          <div class="finish-panel">
            <div class="finish-badge" style="background:var(--teal)">${score}/10</div>
            <h1>${score >= 9 ? '变位掌握得很稳' : score >= 7 ? '基础不错，继续巩固' : '不规则变位需要再练'}</h1>
            <p>本组覆盖现在时、简单过去时和现在虚拟式。</p>
            <div class="button-row">
              <button class="primary-button" data-action="drill-restart">再练一组</button>
              <button class="secondary-button" data-open-conjugation-reference>查看变位表</button>
              ${score < 10 ? '<button class="secondary-button" data-nav="mistakes">查看薄弱变位</button>' : ''}
              <button class="secondary-button" data-nav="home">返回首页</button>
            </div>
          </div>
        </section>
      `;
      return;
    }
    const question = session.questions[session.index];
    app.innerHTML = `
      <section class="view conjugation-layout">
        <div class="session-head">
          <span class="session-count">第 ${session.index + 1} / 10 题</span>
          <div class="session-tools">
            <button class="undo-chip" data-open-conjugation-reference="${escapeHtml(question.verb.infinitive)}"
                    data-open-conjugation-tense="${escapeHtml(question.tense.key)}">变位表</button>
            <span class="badge" style="background:#d8f3ee;color:#0f766e">答对 ${session.score}</span>
          </div>
        </div>
        <div class="session-track" role="progressbar" aria-label="变位练习进度"
             aria-valuemin="0" aria-valuemax="10" aria-valuenow="${session.index}">
          <div class="session-fill" style="width:${session.index * 10}%;background:linear-gradient(90deg,#0f766e,#2dd4bf)"></div>
        </div>
        <div class="quiz-columns">
          <div class="quiz-left">
            <div class="question-card verb">
              <div class="question-word" lang="es">${escapeHtml(question.verb.infinitive)}</div>
              <div class="question-meta">${escapeHtml(question.verb.meaning)}</div>
              <div class="question-meta">${escapeHtml(question.tense.name)} × <span lang="es">${escapeHtml(question.pronoun)}</span></div>
              <button class="question-speak" data-action="speak" data-speak="${escapeHtml(question.verb.infinitive)}">🔊 听动词</button>
            </div>
          </div>
          <div class="quiz-right">
            <div class="options-list">
              ${question.options.map((option, index) => {
                let className = 'option-button';
                if (question.answered && option.correct) className += ' correct';
                if (question.answered && question.selected === option.text && !option.correct) className += ' wrong';
                return `
                  <button class="${className}" data-drill-option="${index}" ${question.answered ? 'disabled' : ''}>
                    <span class="option-letter">${option.letter}</span>
                    <span lang="es">${escapeHtml(option.text)}</span>
                  </button>
                `;
              }).join('')}
            </div>
            <div class="quiz-keyboard-hint">键盘：A–D 选择 · Enter 下一题</div>
            ${question.answered ? `
              <div class="feedback-box ${question.selected === question.answer ? 'good' : ''}" role="status">
                <div class="feedback-title">${question.selected === question.answer
                  ? '正确'
                  : `正确答案：<span lang="es">${escapeHtml(question.answer)}</span>`}</div>
                <div class="feedback-zh"><span lang="es">${escapeHtml(question.verb.infinitive)}</span> · ${escapeHtml(question.tense.name)} · <span lang="es">${escapeHtml(question.pronoun)}</span></div>
                <div class="speak-actions conjugation-speak">
                  <button class="inline-speak" data-action="speak" data-speak="${escapeHtml(question.answer)}">🔊 朗读正确变位</button>
                </div>
                <button class="primary-button" style="margin-top:14px" data-action="drill-next">${session.index === 9 ? '查看结果' : '下一题'}</button>
              </div>
            ` : ''}
          </div>
        </div>
      </section>
    `;
  }

  function chooseDrillOption(index) {
    const session = drillSession;
    const question = session && session.questions[session.index];
    if (!question || question.answered) return;
    const option = question.options[index];
    if (!option) return;
    question.answered = true;
    question.selected = option.text;
    if (option.correct) session.score += 1;
    recordConjugation(question, option.correct);
    saveDrillSession();
    renderConjugation();
  }

  function nextDrillQuestion() {
    const session = drillSession;
    if (!session) return;
    if (session.index >= session.questions.length - 1) session.finished = true;
    else session.index += 1;
    saveDrillSession();
    renderConjugation();
  }

  function filteredWords() {
    const query = vocabularyState.query.trim().toLowerCase();
    const favorites = vocabularyState.favoritesOnly
      ? loadState().favorites
      : null;
    return WORDS.filter(word => {
      if (favorites && !favorites[word.id]) return false;
      if (vocabularyState.category !== 'all' && word.category !== vocabularyState.category) return false;
      if (vocabularyState.level !== 'all' && (word.level || 'A1') !== vocabularyState.level) return false;
      if (!query) return true;
      const normalizedQuery = normalizeText(query);
      return normalizeText(word.es).includes(normalizedQuery) ||
        normalizeText(word.zh).includes(normalizedQuery) ||
        normalizeText(word.example).includes(normalizedQuery) ||
        normalizeText(word.collocation).includes(normalizedQuery) ||
        normalizeText(word.pos).includes(normalizedQuery) ||
        normalizeText(word.register).includes(normalizedQuery) ||
        normalizeText(CATEGORIES[word.category].name).includes(normalizedQuery);
    });
  }

  function renderVocabulary() {
    const levelOptions = ['all', 'A1', 'A2', 'B1', 'B2', 'C1'];
    const favorites = loadState().favorites;
    const favoriteCount = Object.keys(favorites).length;
    const favoriteLevelCount = wordsForLevel(targetLevel)
      .filter(word => favorites[word.id]).length;
    app.innerHTML = `
      <section class="view">
        <div class="toolbar">
          <input class="search-box" id="vocab-search" type="search" placeholder="搜索西语、中文、词性、分类或例句" value="${escapeHtml(vocabularyState.query)}">
          <select class="select-box" id="category-filter">
            <option value="all">全部分类</option>
            ${Object.keys(CATEGORIES).map(key => `<option value="${key}" ${vocabularyState.category === key ? 'selected' : ''}>${escapeHtml(CATEGORIES[key].name)}</option>`).join('')}
          </select>
          <select class="select-box" id="level-filter">
            ${levelOptions.map(level => `<option value="${level}" ${vocabularyState.level === level ? 'selected' : ''}>${level === 'all' ? '全部等级' : level}</option>`).join('')}
          </select>
          <button class="favorite-filter${vocabularyState.favoritesOnly ? ' active' : ''}"
                  data-toggle-favorites-only aria-pressed="${vocabularyState.favoritesOnly}">
            ★ 收藏 ${favoriteCount}
          </button>
        </div>
        <div class="result-bar">
          <div class="result-line" id="vocab-count"></div>
          ${favoriteLevelCount ? `
            <button class="study-favorites" data-start-favorites>
              学习收藏 ${favoriteLevelCount}
            </button>
          ` : ''}
        </div>
        <div class="word-list" id="vocab-list"></div>
        <div class="load-more-wrap" id="vocab-more"></div>
      </section>
    `;
    renderVocabList();
  }

  function renderVocabList() {
    const list = filteredWords();
    const visibleWords = list.slice(0, vocabularyState.visibleLimit);
    const favorites = loadState().favorites;
    const count = document.querySelector('#vocab-count');
    const container = document.querySelector('#vocab-list');
    const more = document.querySelector('#vocab-more');
    if (!count || !container || !more) return;
    count.textContent = list.length > visibleWords.length
      ? `共 ${list.length} 个词 · 当前显示 ${visibleWords.length} 个`
      : `共 ${list.length} 个词`;
    container.innerHTML = visibleWords.map(word => {
      const category = CATEGORIES[word.category];
      const status = wordStatus(word.id);
      const expanded = vocabularyState.expanded === word.id;
      const favorite = Boolean(favorites[word.id]);
      const meta = [word.level || 'A1', word.pos, word.gender, word.register].filter(Boolean);
      return `
        <div class="word-row">
          <button class="toggle-row" data-toggle-word="${word.id}" style="margin:0">
            <span style="display:block;text-align:left;flex:1">
              <span class="word-line">
                <span>
                  <strong class="word-title" lang="es">${escapeHtml(word.es)}</strong>
                  <span class="word-meaning">${escapeHtml(word.zh)}</span>
                  <span class="word-meta">
                    <span style="color:${category.color}">${escapeHtml(category.name)}</span>
                    ${meta.map(item => `<span>·</span><span>${escapeHtml(item)}</span>`).join('')}
                  </span>
                </span>
                <span class="word-badges">
                  ${favorite ? '<span class="favorite-star" aria-label="已收藏">★</span>' : ''}
                  <span class="status-pill ${status.key}">${status.label}</span>
                </span>
              </span>
            </span>
            <span style="align-self:center">${expanded ? '⌃' : '⌄'}</span>
          </button>
          ${expanded ? `
            <div class="word-detail">
              <div class="speak-actions">
                <button class="inline-speak" data-action="speak" data-speak="${escapeHtml(word.es)}">🔊 朗读单词</button>
                ${word.example ? `<button class="inline-speak" data-action="speak" data-speak="${escapeHtml(word.example)}">🔊 朗读例句</button>` : ''}
                <button class="inline-speak favorite-toggle${favorite ? ' active' : ''}"
                        data-toggle-favorite="${escapeHtml(word.id)}" aria-pressed="${favorite}">
                  ${favorite ? '★ 已收藏' : '☆ 收藏'}
                </button>
              </div>
              ${status.nextReview ? `<div class="review-date">下次复习：${escapeHtml(status.nextReview)}</div>` : ''}
              ${word.collocation ? `<strong>搭配：</strong><span lang="es">${escapeHtml(word.collocation)}</span><br>` : ''}
              ${word.example
                ? `<span lang="es">${escapeHtml(word.example)}</span><small lang="zh-CN">${escapeHtml(word.exampleZh)}</small>`
                : '该词条暂无可展示例句。'}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
    if (!list.length) {
      container.innerHTML = '<div class="vocab-empty">没有找到匹配词条，试试更短的关键词。</div>';
    }
    more.innerHTML = list.length > visibleWords.length
      ? `<button class="secondary-button load-more-button" data-action="load-more-words">再显示 60 个 <span>剩余 ${list.length - visibleWords.length} 个</span></button>`
      : '';
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  function createExportPayload() {
    return {
      app: 'espanol-vocab',
      version: 2,
      exportedAt: new Date().toISOString(),
      targetLevel,
      dailyGoal,
      quizMode,
      speechAccent,
      speechRate,
      settings: {
        targetLevel,
        dailyGoal,
        quizMode,
        speechAccent,
        speechRate
      },
      state: loadState()
    };
  }

  function exportProgress() {
    const payload = createExportPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `espanol-progress-${todayKey()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('完整学习记录已导出');
  }

  function importProgress(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result);
        const imported = payload.state || payload;
        if (!imported ||
            typeof imported !== 'object' ||
            Array.isArray(imported) ||
            !imported.records ||
            typeof imported.records !== 'object' ||
            Array.isArray(imported.records)) {
          throw new Error('文件缺少学习记录');
        }
        if (!confirm('导入会覆盖当前学习记录，确定继续吗？')) return;
        const allowedIds = new Set(WORDS.map(word => word.id));
        const records = {};
        Object.keys(imported.records).forEach(id => {
          const record = normalizeRecord(imported.records[id]);
          if (allowedIds.has(id) && record) {
            records[id] = record;
          }
        });
        const favorites = {};
        if (imported.favorites && typeof imported.favorites === 'object' && !Array.isArray(imported.favorites)) {
          Object.entries(imported.favorites).forEach(([id, addedAt]) => {
            if (allowedIds.has(id)) {
              favorites[id] = nonNegativeNumber(addedAt, Date.now());
            }
          });
        }
        const conjugations = {};
        if (imported.conjugations && typeof imported.conjugations === 'object') {
          Object.keys(imported.conjugations).forEach(key => {
            const item = imported.conjugations[key];
            if (item && typeof item === 'object') {
              conjugations[key] = {
                verb: String(item.verb || ''),
                verbMeaning: String(item.verbMeaning || ''),
                tense: String(item.tense || ''),
                pronoun: String(item.pronoun || ''),
                attempts: nonNegativeNumber(item.attempts),
                correct: nonNegativeNumber(item.correct),
                wrong: nonNegativeNumber(item.wrong),
                lastSeenAt: nonNegativeNumber(item.lastSeenAt),
                mistakeDebt: unresolvedMistakes(item)
              };
            }
          });
        }
        const importedDaily = imported.daily &&
          typeof imported.daily === 'object' &&
          !Array.isArray(imported.daily)
          ? imported.daily
          : {};
        const daily = {
          date: todayKey(),
          newWords: nonNegativeNumber(importedDaily.newWords),
          reviews: nonNegativeNumber(importedDaily.reviews),
          correct: nonNegativeNumber(importedDaily.correct),
          total: nonNegativeNumber(importedDaily.total),
          uniqueActivities: Array.isArray(importedDaily.uniqueActivities)
            ? [...new Set(importedDaily.uniqueActivities.filter(item => typeof item === 'string'))]
            : []
        };
        const importedStreak = imported.streak &&
          typeof imported.streak === 'object' &&
          !Array.isArray(imported.streak)
          ? imported.streak
          : {};
        const streak = {
          days: nonNegativeNumber(importedStreak.days),
          lastStudyDate: typeof importedStreak.lastStudyDate === 'string'
            ? importedStreak.lastStudyDate
            : ''
        };
        const history = {};
        if (imported.history && typeof imported.history === 'object' && !Array.isArray(imported.history)) {
          Object.entries(imported.history).forEach(([date, entry]) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(date) &&
                date !== todayKey() &&
                entry &&
                typeof entry === 'object') {
              history[date] = normalizeHistoryEntry(entry);
            }
          });
        }
        Object.keys(history).sort().slice(0, -90).forEach(date => delete history[date]);
        const normalized = {
          records,
          conjugations,
          favorites,
          daily,
          history,
          streak
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        invalidateStateCache();
        const importedSettings = payload.settings &&
          typeof payload.settings === 'object' &&
          !Array.isArray(payload.settings)
          ? payload.settings
          : {};
        const importedTarget = importedSettings.targetLevel || payload.targetLevel;
        if (['B1', 'B2', 'C1'].includes(importedTarget)) {
          targetLevel = importedTarget;
          localStorage.setItem(TARGET_KEY, targetLevel);
          vocabularyState.level = targetLevel;
          vocabularyState.visibleLimit = 60;
        }
        const importedGoal = Number(importedSettings.dailyGoal || payload.dailyGoal);
        if (DAILY_GOALS.includes(importedGoal)) {
          dailyGoal = importedGoal;
          localStorage.setItem(GOAL_KEY, String(dailyGoal));
        }
        const importedQuizMode = importedSettings.quizMode || payload.quizMode;
        if (QUIZ_MODES.includes(importedQuizMode)) {
          quizMode = importedQuizMode;
          localStorage.setItem(QUIZ_MODE_KEY, quizMode);
        }
        const importedAccent = importedSettings.speechAccent || payload.speechAccent;
        if (SPEECH_ACCENTS.includes(importedAccent)) {
          speechAccent = importedAccent;
          localStorage.setItem(SPEECH_ACCENT_KEY, speechAccent);
        }
        const importedRate = importedSettings.speechRate || payload.speechRate;
        if (Object.hasOwn(SPEECH_RATES, importedRate)) {
          speechRate = importedRate;
          localStorage.setItem(SPEECH_RATE_KEY, speechRate);
        }
        clearStudySession();
        clearQuizSession();
        clearDrillSession();
        studySession = null;
        quizSession = null;
        drillSession = null;
        aboutDialog.close();
        updateSpeechSettingButtons();
        if (['study', 'quiz', 'conjugation'].includes(currentView)) {
          setView(currentView, false);
        } else {
          render();
        }
        showToast('学习记录已恢复');
      } catch (error) {
        showToast('导入失败：' + error.message);
      } finally {
        importInput.value = '';
      }
    };
    reader.readAsText(file);
  }

  document.addEventListener('click', event => {
    const speakButton = event.target.closest('[data-action="speak"]');
    if (speakButton) {
      event.preventDefault();
      speakSpanish(speakButton.dataset.speak);
      return;
    }
    const targetButton = event.target.closest('[data-target-level]');
    if (targetButton) {
      targetLevel = targetButton.dataset.targetLevel;
      localStorage.setItem(TARGET_KEY, targetLevel);
      vocabularyState.level = targetLevel;
      vocabularyState.visibleLimit = 60;
      clearStudySession();
      clearQuizSession();
      studySession = null;
      quizSession = null;
      render();
      showToast(`已切换到 DELE ${targetLevel}`);
      return;
    }
    const goalButton = event.target.closest('[data-daily-goal]');
    if (goalButton) {
      const nextGoal = Number(goalButton.dataset.dailyGoal);
      if (DAILY_GOALS.includes(nextGoal)) {
        dailyGoal = nextGoal;
        localStorage.setItem(GOAL_KEY, String(dailyGoal));
        clearStudySession();
        studySession = null;
        renderHome();
        showToast(`每日目标已设为 ${dailyGoal} 项`);
      }
      return;
    }
    const quizModeButton = event.target.closest('[data-quiz-mode]');
    if (quizModeButton) {
      const mode = quizModeButton.dataset.quizMode;
      if (QUIZ_MODES.includes(mode) && mode !== quizMode) {
        const currentQuestion = quizSession &&
          quizSession.questions[quizSession.index];
        const hasProgress = quizSession &&
          !quizSession.finished &&
          (quizSession.index > 0 || (currentQuestion && currentQuestion.answered));
        if (hasProgress &&
            !confirm('切换模式会重新开始一组题，当前进度将丢失。确定继续吗？')) {
          return;
        }
        startQuiz(mode);
        renderQuiz();
      }
      return;
    }
    const speechAccentButton = event.target.closest('[data-speech-accent]');
    if (speechAccentButton) {
      const accent = speechAccentButton.dataset.speechAccent;
      if (SPEECH_ACCENTS.includes(accent)) {
        speechAccent = accent;
        localStorage.setItem(SPEECH_ACCENT_KEY, speechAccent);
        updateSpeechSettingButtons();
      }
      return;
    }
    const speechRateButton = event.target.closest('[data-speech-rate]');
    if (speechRateButton) {
      const rate = speechRateButton.dataset.speechRate;
      if (Object.hasOwn(SPEECH_RATES, rate)) {
        speechRate = rate;
        localStorage.setItem(SPEECH_RATE_KEY, speechRate);
        updateSpeechSettingButtons();
      }
      return;
    }
    if (event.target.closest('[data-toggle-favorites-only]')) {
      vocabularyState.favoritesOnly = !vocabularyState.favoritesOnly;
      vocabularyState.visibleLimit = 60;
      vocabularyState.expanded = '';
      renderVocabulary();
      return;
    }
    const favoriteButton = event.target.closest('[data-toggle-favorite]');
    if (favoriteButton) {
      const active = toggleFavorite(favoriteButton.dataset.toggleFavorite);
      if (currentView === 'study') renderStudy();
      else if (currentView === 'vocabulary') renderVocabulary();
      else if (currentView === 'quiz') renderQuiz();
      showToast(active ? '已加入重点词收藏' : '已取消收藏');
      return;
    }
    const nav = event.target.closest('[data-nav]');
    if (nav) {
      event.preventDefault();
      setView(nav.dataset.nav);
      return;
    }
    if (event.target.closest('[data-start-study]')) {
      startStudy();
      setView('study');
      return;
    }
    if (event.target.closest('[data-start-due]')) {
      startStudy('due');
      setView('study');
      return;
    }
    if (event.target.closest('[data-start-weak]')) {
      startStudy('weak');
      setView('study');
      return;
    }
    if (event.target.closest('[data-start-favorites]')) {
      startStudy('favorites');
      setView('study');
      return;
    }
    if (event.target.closest('[data-flip]')) {
      if (Date.now() < suppressFlipUntil) return;
      if (studySession) {
        studySession.flipped = !studySession.flipped;
        saveStudySession();
        renderStudy();
      }
      return;
    }
    if (event.target.closest('[data-action="next-card"]')) {
      handleGrade(3);
      return;
    }
    if (event.target.closest('[data-action="grade-weak"]')) {
      handleGrade(2);
      return;
    }
    if (event.target.closest('[data-action="grade-known"]')) {
      handleGrade(5);
      return;
    }
    if (event.target.closest('[data-action="undo-card"]')) {
      undoLastCard();
      return;
    }
    const quizOption = event.target.closest('[data-quiz-option]');
    if (quizOption) {
      chooseQuizOption(Number(quizOption.dataset.quizOption));
      return;
    }
    if (event.target.closest('[data-action="check-typed"]')) {
      event.preventDefault();
      submitTypedAnswer();
      return;
    }
    if (event.target.closest('[data-action="reveal-typed"]')) {
      revealQuizAnswer();
      return;
    }
    if (event.target.closest('[data-action="reveal-quiz"]')) {
      revealQuizAnswer();
      return;
    }
    const drillOption = event.target.closest('[data-drill-option]');
    if (drillOption) {
      chooseDrillOption(Number(drillOption.dataset.drillOption));
      return;
    }
    if (event.target.closest('[data-action="quiz-next"]')) {
      nextQuizQuestion();
      return;
    }
    if (event.target.closest('[data-action="drill-next"]')) {
      nextDrillQuestion();
      return;
    }
    if (event.target.closest('[data-action="quiz-restart"]')) {
      startQuiz();
      renderQuiz();
      return;
    }
    if (event.target.closest('[data-action="drill-restart"]')) {
      startConjugation();
      renderConjugation();
      return;
    }
    if (event.target.closest('[data-action="study-again"]')) {
      const mode = studySession &&
        ['weak', 'favorites'].includes(studySession.mode)
        ? studySession.mode
        : 'daily';
      startStudy(mode);
      renderStudy();
      return;
    }
    const referenceButton = event.target.closest('[data-open-conjugation-reference]');
    if (referenceButton) {
      openConjugationReference(
        referenceButton.getAttribute('data-open-conjugation-reference'),
        referenceButton.getAttribute('data-open-conjugation-tense')
      );
      return;
    }
    const referenceTenseButton = event.target.closest('[data-reference-tense]');
    if (referenceTenseButton) {
      referenceTense = referenceTenseButton.dataset.referenceTense;
      renderConjugationReference();
      return;
    }
    if (event.target.closest('[data-close-conjugation]')) {
      conjugationDialog.close();
      return;
    }
    if (event.target.closest('[data-action="load-more-words"]')) {
      vocabularyState.visibleLimit += 60;
      renderVocabList();
      return;
    }
    const toggleWord = event.target.closest('[data-toggle-word]');
    if (toggleWord) {
      vocabularyState.expanded = vocabularyState.expanded === toggleWord.dataset.toggleWord
        ? ''
        : toggleWord.dataset.toggleWord;
      renderVocabList();
      return;
    }
    if (event.target.closest('[data-open-about]')) {
      aboutDialog.showModal();
      return;
    }
    if (event.target.closest('[data-close-about]')) {
      aboutDialog.close();
      return;
    }
    if (event.target.closest('[data-clear-progress]')) {
      if (confirm('确定清除全部学习记录吗？')) {
        localStorage.removeItem(STORAGE_KEY);
        invalidateStateCache();
        clearStudySession();
        clearQuizSession();
        clearDrillSession();
        studySession = null;
        quizSession = null;
        drillSession = null;
        aboutDialog.close();
        updateHeader();
        if (['study', 'quiz', 'conjugation'].includes(currentView)) {
          setView(currentView, false);
        } else {
          render();
        }
        showToast('学习记录已清除');
      }
      return;
    }
    if (event.target.closest('[data-export-progress]')) {
      exportProgress();
      return;
    }
    if (event.target.closest('[data-import-progress]')) {
      importInput.click();
    }
  });

  importInput.addEventListener('change', event => {
    importProgress(event.target.files && event.target.files[0]);
  });

  document.addEventListener('submit', event => {
    if (event.target && event.target.matches('[data-spelling-form]')) {
      event.preventDefault();
      submitTypedAnswer();
    }
  });

  document.addEventListener('change', event => {
    if (event.target.id === 'reference-verb') {
      referenceVerb = event.target.value;
      renderConjugationReference();
    }
  });

  app.addEventListener('input', event => {
    if (event.target.id === 'vocab-search') {
      vocabularyState.query = event.target.value;
      vocabularyState.visibleLimit = 60;
      vocabularyState.expanded = '';
      renderVocabList();
    }
  });

  app.addEventListener('change', event => {
    if (event.target.id === 'category-filter') {
      vocabularyState.category = event.target.value;
      vocabularyState.visibleLimit = 60;
      vocabularyState.expanded = '';
      renderVocabList();
    }
    if (event.target.id === 'level-filter') {
      vocabularyState.level = event.target.value;
      vocabularyState.visibleLimit = 60;
      vocabularyState.expanded = '';
      renderVocabList();
    }
  });

  app.addEventListener('touchstart', event => {
    const card = event.target.closest('.flashcard');
    const touch = event.touches && event.touches[0];
    if (!card || !touch || !studySession || !studySession.flipped) return;
    swipeStart = { x: touch.clientX, y: touch.clientY, at: Date.now() };
  }, { passive: true });

  app.addEventListener('touchend', event => {
    if (!swipeStart || !studySession || !studySession.flipped) {
      swipeStart = null;
      return;
    }
    const touch = event.changedTouches && event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - swipeStart.x;
    const dy = touch.clientY - swipeStart.y;
    const elapsed = Date.now() - swipeStart.at;
    swipeStart = null;
    if (elapsed > 900 || Math.abs(dx) < 62 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
    suppressFlipUntil = Date.now() + 350;
    if (dx > 0) {
      handleGrade(5);
      showToast('已记录：记住了');
    } else {
      handleGrade(2);
      showToast('已记录：稍后复习');
    }
  }, { passive: true });

  window.addEventListener('keydown', event => {
    const target = event.target;
    const textEntryTarget = target &&
      typeof target.matches === 'function' &&
      (target.matches('input, select, textarea') || target.isContentEditable);
    if (currentView === 'quiz' && quizSession && !quizSession.finished) {
      const question = quizSession.questions[quizSession.index];
      if (textEntryTarget) return;
      if (quizSession.mode === 'choice' && !question.answered && /^[a-d]$/i.test(event.key)) {
        event.preventDefault();
        chooseQuizOption(event.key.toLowerCase().charCodeAt(0) - 97);
        return;
      }
      if (question.answered && event.key === 'Enter') {
        event.preventDefault();
        nextQuizQuestion();
      }
      return;
    }
    if (currentView === 'conjugation' && drillSession && !drillSession.finished) {
      const question = drillSession.questions[drillSession.index];
      if (!question.answered && /^[a-d]$/i.test(event.key)) {
        event.preventDefault();
        chooseDrillOption(event.key.toLowerCase().charCodeAt(0) - 97);
        return;
      }
      if (question.answered && event.key === 'Enter') {
        event.preventDefault();
        nextDrillQuestion();
      }
      return;
    }
    if (currentView !== 'study' || !studySession) return;
    if (target &&
        typeof target.matches === 'function' &&
        (target.matches('button, input, select, textarea') || target.isContentEditable)) {
      return;
    }
    if (!studySession.flipped && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      studySession.flipped = true;
      saveStudySession();
      renderStudy();
      return;
    }
    if (!studySession.flipped) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      handleGrade(5);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      handleGrade(2);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleGrade(3);
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undoLastCard();
    }
  });

  function syncViewFromLocation() {
    const view = viewFromHash();
    if (view !== currentView) setView(view, false);
  }

  window.addEventListener('popstate', syncViewFromLocation);
  window.addEventListener('hashchange', syncViewFromLocation);
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY) invalidateStateCache();
  });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    document.querySelectorAll('[data-install-app]').forEach(button => {
      button.textContent = '安装到设备';
    });
  });

  async function handleInstall() {
    if (aboutDialog.open) aboutDialog.close();
    const standalone = window.matchMedia &&
      window.matchMedia('(display-mode: standalone)').matches;
    if (standalone || navigator.standalone === true) {
      showToast('应用已经安装到设备');
      return;
    }
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      showToast(choice && choice.outcome === 'accepted' ? '安装已开始' : '已取消安装');
      return;
    }
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent || '') ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) {
      showToast('请点 Safari 的分享按钮，再选“添加到主屏幕”');
      return;
    }
    showToast('请使用浏览器菜单中的“安装应用”或“添加到主屏幕”');
  }

  document.querySelectorAll('[data-install-app]').forEach(button => {
    button.addEventListener('click', handleInstall);
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  updateSpeechSettingButtons();
  setView(currentView, false);
})();
