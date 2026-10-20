const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { WORDS } = require('../src/data/words');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const dataSource = fs.readFileSync(path.join(root, 'assets/data.js'), 'utf8');

function todayKey(date = new Date()) {
  const value = date;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createEnvironment({
  hash = '#home',
  storedState = null,
  sessionStorageData = new Map(),
  confirmResult = true
} = {}) {
  const listeners = {};
  const storage = new Map();
  let exportedText = '';
  let stateReads = 0;
  if (storedState) storage.set('espanol_web_v1', JSON.stringify(storedState));

  const app = {
    innerHTML: '',
    addEventListener(name, listener) {
      listeners[`app:${name}`] = listener;
    }
  };
  const toast = {
    textContent: '',
    classList: { add() {}, remove() {} }
  };
  const dialog = { open: false, showModal() {}, close() {} };
  const conjugationDialog = {
    open: false,
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    }
  };
  const conjugationReference = { innerHTML: '' };
  const importInput = { value: '', click() {}, addEventListener() {} };
  const installButton = {
    textContent: '',
    disabled: false,
    addEventListener(name, listener) {
      listeners[`install:${name}`] = listener;
    }
  };
  const viewKicker = { textContent: '' };
  const viewTitle = { textContent: '' };
  const streakNode = { textContent: '' };
  const vocabCount = { textContent: '', innerHTML: '' };
  const vocabList = { textContent: '', innerHTML: '' };
  const vocabMore = { textContent: '', innerHTML: '' };
  const spellingInput = { value: '' };
  const fallbackNode = { textContent: '', innerHTML: '' };
  class TestBlob {
    constructor(parts) {
      exportedText = parts.join('');
    }
  }
  const urlApi = {
    createObjectURL() {
      return 'blob:test';
    },
    revokeObjectURL() {}
  };
  const document = {
    querySelector(selector) {
      if (selector === '#app') return app;
      if (selector === '#toast') return toast;
      if (selector === '#about-dialog') return dialog;
      if (selector === '#conjugation-dialog') return conjugationDialog;
      if (selector === '#conjugation-reference') return conjugationReference;
      if (selector === '#import-file') return importInput;
      if (selector === '#view-kicker') return viewKicker;
      if (selector === '#view-title') return viewTitle;
      if (selector === '#streak-pill') return streakNode;
      if (selector === '#vocab-count') return vocabCount;
      if (selector === '#vocab-list') return vocabList;
      if (selector === '#vocab-more') return vocabMore;
      if (selector === '#spelling-answer') return spellingInput;
      return fallbackNode;
    },
    querySelectorAll(selector) {
      if (selector === '[data-install-app]') return [installButton];
      return [];
    },
    createElement() {
      return {
        href: '',
        download: '',
        click() {},
        remove() {}
      };
    },
    body: {
      appendChild() {}
    },
    addEventListener(name, listener) {
      listeners[`document:${name}`] = listener;
    }
  };
  const window = {
    addEventListener(name, listener) {
      listeners[`window:${name}`] = listener;
    },
    scrollTo() {}
  };
  const localStorage = {
    getItem(key) {
      if (key === 'espanol_web_v1') stateReads += 1;
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
    removeItem(key) {
      storage.delete(key);
    }
  };
  const sessionStorage = {
    getItem(key) {
      return sessionStorageData.has(key) ? sessionStorageData.get(key) : null;
    },
    setItem(key, value) {
      sessionStorageData.set(key, String(value));
    },
    removeItem(key) {
      sessionStorageData.delete(key);
    }
  };
  const location = { hash };
  const history = { pushState() {} };
  const context = {
    window,
    document,
    localStorage,
    location,
    history,
    navigator: {},
    console,
    Date,
    Number,
    Math,
    Set,
    Map,
    Blob: TestBlob,
    URL: urlApi,
    confirm: () => confirmResult,
    setTimeout: () => 0,
    clearTimeout() {}
  };

  Object.assign(window, { document, localStorage, sessionStorage, location, history });
  vm.createContext(context);
  vm.runInContext(dataSource, context);
  vm.runInContext(appSource, context);

  return {
    app,
    listeners,
    storage,
    sessionStorageData,
    toast,
    streakNode,
    vocabCount,
    vocabList,
    spellingInput,
    conjugationDialog,
    conjugationReference,
    getExportData() {
      return JSON.parse(exportedText);
    },
    getStateReads() {
      return stateReads;
    }
  };
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

const home = createEnvironment();
check(home.app.innerHTML.includes('/ 20 项'), '首页应显示默认每日 20 项目标');
check(home.getStateReads() === 1, '首页渲染应复用解析后的学习记录，避免重复读取本地数据');
check(home.app.innerHTML.includes('<strong>—</strong>'), '尚未练习时正确率应显示为未测，而不是 0%');
check(home.app.innerHTML.includes('20 个新词'), '默认学习队列文案应准确显示 20 个新词');

const goalTarget = {
  dataset: { dailyGoal: '10' },
  closest(selector) {
    return selector === '[data-daily-goal]' ? goalTarget : null;
  }
};
home.listeners['document:click']({ target: goalTarget, preventDefault() {} });
check(home.storage.get('espanol_daily_goal') === '10', '切换每日目标后应持久化到 localStorage');
check(home.app.innerHTML.includes('/ 10 项'), '切换每日目标后首页进度应立即刷新');
check(home.app.innerHTML.includes('10 个新词'), '每日目标切换后队列新词数量应同步调整');
home.listeners['install:click']();
check(
  home.toast.textContent.includes('浏览器菜单'),
  '桌面端无法直接唤起安装时应显示通用浏览器提示，而不是 iPhone 提示'
);

const speechSettings = createEnvironment();
const accentTarget = {
  dataset: { speechAccent: 'latam' },
  closest(selector) {
    return selector === '[data-speech-accent]' ? accentTarget : null;
  }
};
const rateTarget = {
  dataset: { speechRate: 'slow' },
  closest(selector) {
    return selector === '[data-speech-rate]' ? rateTarget : null;
  }
};
speechSettings.listeners['document:click']({ target: accentTarget, preventDefault() {} });
speechSettings.listeners['document:click']({ target: rateTarget, preventDefault() {} });
check(
  speechSettings.storage.get('espanol_speech_accent') === 'latam' &&
  speechSettings.storage.get('espanol_speech_rate') === 'slow',
  '朗读口音和语速设置应持久化到本地存储'
);

const favoriteEnv = createEnvironment();
const favoriteTarget = {
  dataset: { toggleFavorite: WORDS[0].id },
  closest(selector) {
    return selector === '[data-toggle-favorite]' ? favoriteTarget : null;
  }
};
favoriteEnv.listeners['document:click']({ target: favoriteTarget, preventDefault() {} });
check(
  Boolean(JSON.parse(favoriteEnv.storage.get('espanol_web_v1')).favorites[WORDS[0].id]),
  '收藏重点词后应写入学习记录'
);
favoriteEnv.listeners['document:click']({ target: favoriteTarget, preventDefault() {} });
check(
  !JSON.parse(favoriteEnv.storage.get('espanol_web_v1')).favorites[WORDS[0].id],
  '再次点击收藏应取消收藏'
);

const exportEnv = createEnvironment();
exportEnv.listeners['document:click']({ target: accentTarget, preventDefault() {} });
const fastRateTarget = {
  dataset: { speechRate: 'fast' },
  closest(selector) {
    return selector === '[data-speech-rate]' ? fastRateTarget : null;
  }
};
exportEnv.listeners['document:click']({ target: fastRateTarget, preventDefault() {} });
exportEnv.listeners['document:click']({ target: favoriteTarget, preventDefault() {} });
const exportTarget = {
  closest(selector) {
    return selector === '[data-export-progress]' ? exportTarget : null;
  }
};
exportEnv.listeners['document:click']({ target: exportTarget, preventDefault() {} });
const exportedPayload = exportEnv.getExportData();
check(exportedPayload.version === 2, '导出的完整备份应使用新版格式');
check(
  exportedPayload.settings.speechAccent === 'latam' &&
  exportedPayload.settings.speechRate === 'fast',
  '导出文件应包含朗读口音和语速设置'
);
check(
  Boolean(exportedPayload.state.favorites[WORDS[0].id]),
  '导出文件应包含重点词收藏'
);

const startTarget = {
  closest(selector) {
    return selector === '[data-start-study]' ? startTarget : null;
  }
};
home.listeners['document:click']({ target: startTarget, preventDefault() {} });
check(home.app.innerHTML.includes('1 / 10'), '每日目标切换后，新学习队列长度应同步调整');

const savedSession = JSON.parse(home.sessionStorageData.get('espanol_study_session_v1'));
check(savedSession.queue.length === 10 && savedSession.index === 0, '学习开始后应保存当前队列和进度');

const flipTarget = {
  closest(selector) {
    return selector === '[data-flip]' ? flipTarget : null;
  }
};
home.listeners['document:click']({ target: flipTarget, preventDefault() {} });
const flippedSession = JSON.parse(home.sessionStorageData.get('espanol_study_session_v1'));
check(flippedSession.flipped === true, '翻卡状态应写入会话存储');

const resumed = createEnvironment({
  hash: '#study',
  sessionStorageData: home.sessionStorageData
});
check(resumed.app.innerHTML.includes('1 / 10'), '刷新后应恢复同一学习队列和当前位置');
check(resumed.app.innerHTML.includes('word-back'), '刷新后应保留当前卡片的翻面状态');
check(resumed.app.innerHTML.includes('朗读例句'), '翻卡答案页应支持朗读完整例句');

const quiz = createEnvironment({ hash: '#quiz' });
const savedQuiz = JSON.parse(quiz.sessionStorageData.get('espanol_quiz_session_v1'));
check(savedQuiz.questions.length === 10, '小测开始后应保存完整题目队列');
check(savedQuiz.mode === 'choice', '小测默认应使用四选一模式');

const quizOptionTarget = {
  dataset: { quizOption: '0' },
  closest(selector) {
    return selector === '[data-quiz-option]' ? quizOptionTarget : null;
  }
};
quiz.listeners['document:click']({ target: quizOptionTarget, preventDefault() {} });
const answeredQuiz = JSON.parse(quiz.sessionStorageData.get('espanol_quiz_session_v1'));
check(answeredQuiz.questions[0].answered === true, '小测答题状态应写入会话存储');

const resumedQuiz = createEnvironment({
  hash: '#quiz',
  sessionStorageData: quiz.sessionStorageData
});
check(resumedQuiz.app.innerHTML.includes('data-action="quiz-next"'), '刷新后应恢复小测反馈和下一题按钮');

const cancelModeQuiz = createEnvironment({
  hash: '#quiz',
  sessionStorageData: new Map(quiz.sessionStorageData),
  confirmResult: false
});
const cancelModeTarget = {
  dataset: { quizMode: 'spelling' },
  closest(selector) {
    return selector === '[data-quiz-mode]' ? cancelModeTarget : null;
  }
};
cancelModeQuiz.listeners['document:click']({
  target: cancelModeTarget,
  preventDefault() {}
});
const cancelledModeSession = JSON.parse(
  cancelModeQuiz.sessionStorageData.get('espanol_quiz_session_v1')
);
check(
  cancelledModeSession.mode === 'choice' &&
  cancelledModeSession.questions[0].answered === true,
  '取消模式切换确认后应保留原小测进度'
);

const keyboardQuiz = createEnvironment({ hash: '#quiz' });
const keyboardTarget = { matches: () => false, isContentEditable: false };
keyboardQuiz.listeners['window:keydown']({
  target: keyboardTarget,
  key: 'b',
  preventDefault() {}
});
let keyboardSession = JSON.parse(
  keyboardQuiz.sessionStorageData.get('espanol_quiz_session_v1')
);
check(keyboardSession.questions[0].answered === true, '四选一小测应支持 A–D 键盘选择');
keyboardQuiz.listeners['window:keydown']({
  target: keyboardTarget,
  key: 'Enter',
  preventDefault() {}
});
keyboardSession = JSON.parse(
  keyboardQuiz.sessionStorageData.get('espanol_quiz_session_v1')
);
check(keyboardSession.index === 1, '四选一答题后应支持 Enter 进入下一题');
check(resumedQuiz.app.innerHTML.includes('朗读例句'), '小测反馈应支持朗读完整例句');
check(resumedQuiz.app.innerHTML.includes('data-toggle-favorite'), '小测反馈应支持直接收藏重点词');

const choiceRevealQuiz = createEnvironment({ hash: '#quiz' });
const choiceRevealTarget = {
  closest(selector) {
    return selector === '[data-action="reveal-quiz"]' ? choiceRevealTarget : null;
  }
};
choiceRevealQuiz.listeners['document:click']({
  target: choiceRevealTarget,
  preventDefault() {}
});
const choiceRevealed = JSON.parse(
  choiceRevealQuiz.sessionStorageData.get('espanol_quiz_session_v1')
);
check(
  choiceRevealed.questions[0].answered === true &&
  choiceRevealed.questions[0].selected === '' &&
  choiceRevealed.score === 0,
  '四选一选择“不会”时应按时未答对处理'
);
check(choiceRevealQuiz.app.innerHTML.includes('正确答案'), '四选一显示答案后应进入讲解状态');

const finishedQuiz = createEnvironment({ hash: '#quiz' });
for (let index = 0; index < 10; index += 1) {
  finishedQuiz.listeners['window:keydown']({
    target: keyboardTarget,
    key: 'a',
    preventDefault() {}
  });
  finishedQuiz.listeners['window:keydown']({
    target: keyboardTarget,
    key: 'Enter',
    preventDefault() {}
  });
}
check(
  finishedQuiz.app.innerHTML.includes('data-nav="mistakes"') &&
  finishedQuiz.app.innerHTML.includes('查看错题'),
  '小测结果页应能直接进入错题本'
);

const spellingQuiz = createEnvironment({ hash: '#quiz' });
const spellingModeTarget = {
  dataset: { quizMode: 'spelling' },
  closest(selector) {
    return selector === '[data-quiz-mode]' ? spellingModeTarget : null;
  }
};
spellingQuiz.listeners['document:click']({
  target: spellingModeTarget,
  preventDefault() {}
});
const savedSpelling = JSON.parse(
  spellingQuiz.sessionStorageData.get('espanol_quiz_session_v1')
);
check(savedSpelling.mode === 'spelling', '切换后应启动拼写小测并保存模式');
check(spellingQuiz.app.innerHTML.includes('id="spelling-answer"'), '拼写模式应显示文本输入框');

const spellingAnswer = WORDS.find(
  word => word.id === savedSpelling.questions[0].wordId
).es;
spellingQuiz.spellingInput.value = spellingAnswer;
const spellingCheckTarget = {
  closest(selector) {
    return selector === '[data-action="check-typed"]' ? spellingCheckTarget : null;
  }
};
spellingQuiz.listeners['document:click']({
  target: spellingCheckTarget,
  preventDefault() {}
});
const answeredSpelling = JSON.parse(
  spellingQuiz.sessionStorageData.get('espanol_quiz_session_v1')
);
check(
  answeredSpelling.questions[0].answered === true &&
  answeredSpelling.questions[0].correct === true,
  '拼写答案应被判定并写入会话存储'
);

const resumedSpelling = createEnvironment({
  hash: '#quiz',
  sessionStorageData: spellingQuiz.sessionStorageData
});
check(resumedSpelling.app.innerHTML.includes('拼写正确'), '刷新后应恢复拼写反馈和得分');

const revealQuiz = createEnvironment({ hash: '#quiz' });
revealQuiz.listeners['document:click']({
  target: spellingModeTarget,
  preventDefault() {}
});
const revealTarget = {
  closest(selector) {
    return selector === '[data-action="reveal-typed"]' ? revealTarget : null;
  }
};
revealQuiz.listeners['document:click']({
  target: revealTarget,
  preventDefault() {}
});
const revealedQuestion = JSON.parse(
  revealQuiz.sessionStorageData.get('espanol_quiz_session_v1')
).questions[0];
check(
  revealedQuestion.answered === true &&
  revealedQuestion.correct === false &&
  revealedQuestion.selected === '',
  '不会时显示答案应将空作答记为错误'
);
check(
  revealQuiz.app.innerHTML.includes('未作答') &&
  revealQuiz.app.innerHTML.includes('正确答案'),
  '显示答案后应进入讲解反馈状态'
);

const accentWord = WORDS.find(word =>
  word.level === 'B2' &&
  word.es.length <= 40 &&
  !/[(),/;:!?¿¡]/.test(word.es) &&
  /[áéíóú]/.test(word.es)
);
const accentQuiz = createEnvironment({
  hash: '#quiz',
  storedState: {
    records: {
      [accentWord.id]: {
        interval: 1,
        repetition: 1,
        efactor: 2.5,
        dueAt: Date.now() - 1000,
        seen: 1,
        correct: 0,
        wrong: 1,
        lastSeenAt: Date.now(),
        lastSource: 'study',
        mistakeDebt: 1
      }
    },
    conjugations: {},
    daily: {
      date: todayKey(),
      newWords: 0,
      reviews: 0,
      correct: 0,
      total: 0,
      uniqueActivities: []
    },
    streak: { days: 0, lastStudyDate: '' }
  }
});
const accentModeTarget = {
  dataset: { quizMode: 'spelling' },
  closest(selector) {
    return selector === '[data-quiz-mode]' ? accentModeTarget : null;
  }
};
accentQuiz.listeners['document:click']({ target: accentModeTarget, preventDefault() {} });
accentQuiz.spellingInput.value = accentWord.es.normalize('NFD').replace(/\u0301/g, '');
accentQuiz.listeners['document:click']({
  target: spellingCheckTarget,
  preventDefault() {}
});
const accentResult = JSON.parse(
  accentQuiz.sessionStorageData.get('espanol_quiz_session_v1')
);
check(
  accentResult.questions[0].correct === true &&
  accentResult.questions[0].exactMatch === false,
  '拼写测试应接受省略重音符号的答案，并记录重音差异'
);

const dictationQuiz = createEnvironment({ hash: '#quiz' });
const dictationModeTarget = {
  dataset: { quizMode: 'dictation' },
  closest(selector) {
    return selector === '[data-quiz-mode]' ? dictationModeTarget : null;
  }
};
dictationQuiz.listeners['document:click']({
  target: dictationModeTarget,
  preventDefault() {}
});
const savedDictation = JSON.parse(
  dictationQuiz.sessionStorageData.get('espanol_quiz_session_v1')
);
check(savedDictation.mode === 'dictation', '切换后应启动听写小测并保存模式');
check(dictationQuiz.app.innerHTML.includes('播放发音'), '听写模式应提供发音播放按钮');

const dictationAnswer = WORDS.find(
  word => word.id === savedDictation.questions[0].wordId
).es;
dictationQuiz.spellingInput.value = dictationAnswer;
dictationQuiz.listeners['document:click']({
  target: spellingCheckTarget,
  preventDefault() {}
});
const answeredDictation = JSON.parse(
  dictationQuiz.sessionStorageData.get('espanol_quiz_session_v1')
);
check(answeredDictation.questions[0].correct === true, '听写答案应被判定并写入会话存储');

const resumedDictation = createEnvironment({
  hash: '#quiz',
  sessionStorageData: dictationQuiz.sessionStorageData
});
check(resumedDictation.app.innerHTML.includes('听写正确'), '刷新后应恢复听写反馈和得分');

const drill = createEnvironment({ hash: '#conjugation' });
const savedDrill = JSON.parse(drill.sessionStorageData.get('espanol_drill_session_v1'));
check(savedDrill.questions.length === 10, '变位练习开始后应保存完整题目队列');

const drillOptionTarget = {
  dataset: { drillOption: '0' },
  closest(selector) {
    return selector === '[data-drill-option]' ? drillOptionTarget : null;
  }
};
drill.listeners['document:click']({ target: drillOptionTarget, preventDefault() {} });
const answeredDrill = JSON.parse(drill.sessionStorageData.get('espanol_drill_session_v1'));
check(answeredDrill.questions[0].answered === true, '变位答题状态应写入会话存储');

const resumedDrill = createEnvironment({
  hash: '#conjugation',
  sessionStorageData: drill.sessionStorageData
});
check(resumedDrill.app.innerHTML.includes('data-action="drill-next"'), '刷新后应恢复变位反馈和下一题按钮');
check(resumedDrill.app.innerHTML.includes('朗读正确变位'), '变位反馈应支持朗读正确形式');

const referenceOpenTarget = {
  getAttribute(attribute) {
    return attribute === 'data-open-conjugation-reference' ? 'querer' : null;
  },
  closest(selector) {
    return selector === '[data-open-conjugation-reference]' ? referenceOpenTarget : null;
  }
};
resumedDrill.listeners['document:click']({
  target: referenceOpenTarget,
  preventDefault() {}
});
check(resumedDrill.conjugationDialog.open === true, '点击变位表按钮应打开参考对话框');
check(
  resumedDrill.conjugationReference.innerHTML.includes('querer') &&
  resumedDrill.conjugationReference.innerHTML.includes('quiere'),
  '变位表应显示所选动词和当前时态的全部人称'
);

const referenceTenseTarget = {
  dataset: { referenceTense: 'indefinido' },
  closest(selector) {
    return selector === '[data-reference-tense]' ? referenceTenseTarget : null;
  }
};
resumedDrill.listeners['document:click']({
  target: referenceTenseTarget,
  preventDefault() {}
});
check(resumedDrill.conjugationReference.innerHTML.includes('quise'), '切换时态后变位表应同步更新');

const referencePresentTarget = {
  dataset: { referenceTense: 'presente' },
  closest(selector) {
    return selector === '[data-reference-tense]' ? referencePresentTarget : null;
  }
};
resumedDrill.listeners['document:click']({
  target: referencePresentTarget,
  preventDefault() {}
});
resumedDrill.listeners['document:change']({
  target: { id: 'reference-verb', value: 'dar' }
});
check(
  resumedDrill.conjugationReference.innerHTML.includes('dar') &&
  resumedDrill.conjugationReference.innerHTML.includes('doy'),
  '切换动词后变位表应显示对应变位'
);

const clearedQuiz = createEnvironment({ hash: '#quiz' });
const clearTarget = {
  closest(selector) {
    return selector === '[data-clear-progress]' ? clearTarget : null;
  }
};
clearedQuiz.listeners['document:click']({ target: clearTarget, preventDefault() {} });
check(clearedQuiz.app.innerHTML.includes('第 1 / 10 题'), '清除记录后当前小测页应立即开始一组新题');

const zeroDrill = createEnvironment({
  storedState: {
    records: {},
    conjugations: {
      'hablar:presente:yo': {
        verb: 'hablar',
        verbMeaning: '说',
        tense: '现在时',
        pronoun: 'yo',
        attempts: 1,
        correct: 0,
        wrong: 1,
        lastSeenAt: Date.now(),
        mistakeDebt: 1
      }
    },
    daily: {
      date: todayKey(),
      newWords: 0,
      reviews: 0,
      correct: 0,
      total: 0,
      uniqueActivities: []
    },
    streak: { days: 0, lastStudyDate: '' }
  }
});
check(zeroDrill.app.innerHTML.includes('变位 0%'), '真实为 0% 的变位正确率不应被隐藏');

const dueRecords = {};
for (const word of WORDS.filter(candidate => candidate.level === 'B2').slice(0, 15)) {
  dueRecords[word.id] = {
    interval: 1,
    repetition: 1,
    efactor: 2.5,
    dueAt: Date.now() - 1000,
    seen: 1,
    correct: 1,
    wrong: 0,
    lastSeenAt: Date.now(),
    lastSource: 'study',
    mistakeDebt: 0
  };
}
const futureWord = WORDS.filter(candidate => candidate.level === 'B2')[20];
dueRecords[futureWord.id] = {
  interval: 3,
  repetition: 2,
  efactor: 2.5,
  dueAt: Date.now() + 2 * 86400000,
  seen: 2,
  correct: 2,
  wrong: 0,
  lastSeenAt: Date.now(),
  lastSource: 'study',
  mistakeDebt: 0
};
const dueHome = createEnvironment({
  storedState: {
    records: dueRecords,
    conjugations: {},
    daily: {
      date: todayKey(),
      newWords: 0,
      reviews: 0,
      correct: 0,
      total: 0,
      uniqueActivities: []
    },
    streak: { days: 0, lastStudyDate: '' }
  }
});
check(
  dueHome.app.innerHTML.includes('15 个待复习 · 5 个新词'),
  '学习队列文案应按每日目标准确拆分复习词和新词'
);
check(
  /<div><strong>1<\/strong><span>未来 7 天<\/span><\/div>/.test(dueHome.app.innerHTML),
  '复习节奏应统计未来七天内的到期词数'
);

const completedGoal = createEnvironment({
  storedState: {
    records: {},
    conjugations: {},
    daily: {
      date: todayKey(),
      newWords: 20,
      reviews: 0,
      correct: 20,
      total: 20,
      uniqueActivities: Array.from({ length: 20 }, (_, index) => `word:test-${index}`)
    },
    streak: { days: 0, lastStudyDate: '' }
  }
});
check(completedGoal.app.innerHTML.includes('今日目标已完成'), '达到每日目标后首页应显示完成状态');

const staleStreak = createEnvironment({
  storedState: {
    records: {},
    conjugations: {},
    daily: {
      date: todayKey(),
      newWords: 0,
      reviews: 0,
      correct: 0,
      total: 0,
      uniqueActivities: []
    },
    streak: { days: 12, lastStudyDate: '2000-01-01' }
  }
});
check(staleStreak.streakNode.textContent === '连续 0 天', '连续学习中断后不应继续显示旧天数');

const yesterdayDate = new Date();
yesterdayDate.setHours(12, 0, 0, 0);
yesterdayDate.setDate(yesterdayDate.getDate() - 1);
const twoDaysAgoDate = new Date(yesterdayDate);
twoDaysAgoDate.setDate(twoDaysAgoDate.getDate() - 1);
const weekly = createEnvironment({
  storedState: {
    records: {},
    conjugations: {},
    daily: {
      date: todayKey(yesterdayDate),
      newWords: 2,
      reviews: 0,
      correct: 2,
      total: 2,
      uniqueActivities: ['word:a', 'word:b']
    },
    history: {
      [todayKey(twoDaysAgoDate)]: {
        newWords: 3,
        reviews: 0,
        correct: 3,
        total: 3,
        activityCount: 3
      }
    },
    streak: { days: 2, lastStudyDate: todayKey(yesterdayDate) }
  }
});
check(
  weekly.app.innerHTML.includes('<strong>5 项</strong>'),
  '最近七天活动应合并历史记录并归档前一天数据'
);

const vocab = createEnvironment({ hash: '#vocabulary' });
vocab.listeners['app:input']({
  target: { id: 'vocab-search', value: 'DELE B2 原版精选' }
});
check(vocab.vocabCount.textContent.includes('共 1304 个词'), '词库搜索应支持按分类名称筛选');

const favoriteVocabWord = WORDS.find(word => word.level === 'B2');
const favoriteVocab = createEnvironment({
  hash: '#vocabulary',
  storedState: {
    records: {},
    conjugations: {},
    favorites: { [favoriteVocabWord.id]: Date.now() },
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
  }
});
const favoritesOnlyTarget = {
  closest(selector) {
    return selector === '[data-toggle-favorites-only]' ? favoritesOnlyTarget : null;
  }
};
favoriteVocab.listeners['document:click']({
  target: favoritesOnlyTarget,
  preventDefault() {}
});
check(
  favoriteVocab.vocabCount.textContent.includes('共 1 个词'),
  '只看收藏模式应只显示已收藏词条'
);
const startFavoritesTarget = {
  closest(selector) {
    return selector === '[data-start-favorites]' ? startFavoritesTarget : null;
  }
};
favoriteVocab.listeners['document:click']({
  target: startFavoritesTarget,
  preventDefault() {}
});
const favoriteStudy = JSON.parse(
  favoriteVocab.sessionStorageData.get('espanol_study_session_v1')
);
check(
  favoriteStudy.mode === 'favorites' &&
  favoriteStudy.queue.length === 1 &&
  favoriteStudy.queue[0] === favoriteVocabWord.id,
  '学习收藏应生成只含当前级别收藏词的队列'
);

const reviewWord = WORDS.find(word => word.level === 'B2');
const vocabReviewState = {
  records: {
    [reviewWord.id]: {
      interval: 1,
      repetition: 1,
      efactor: 2.5,
      dueAt: Date.now() + 86400000,
      seen: 1,
      correct: 1,
      wrong: 0,
      lastSeenAt: Date.now(),
      lastSource: 'study',
      mistakeDebt: 0
    }
  },
  conjugations: {},
  daily: {
    date: todayKey(),
    newWords: 0,
    reviews: 0,
    correct: 0,
    total: 0,
    uniqueActivities: []
  },
  streak: { days: 0, lastStudyDate: '' }
};
const reviewVocab = createEnvironment({
  hash: '#vocabulary',
  storedState: vocabReviewState
});
const reviewWordTarget = {
  dataset: { toggleWord: reviewWord.id },
  closest(selector) {
    return selector === '[data-toggle-word]' ? reviewWordTarget : null;
  }
};
reviewVocab.listeners['document:click']({
  target: reviewWordTarget,
  preventDefault() {}
});
check(reviewVocab.vocabList.innerHTML.includes('下次复习：明天'), '词库详情应显示可读的下次复习时间');
check(reviewVocab.vocabList.innerHTML.includes('朗读例句'), '词库详情应支持朗读完整例句');

const freshNoPosWord = WORDS.find(word => word.level === 'B2' && !word.pos);
check(Boolean(freshNoPosWord), '测试数据中应存在无词性的 B2 词条');

const records = {};
for (const word of WORDS.filter(candidate => candidate.level === 'B2')) {
  if (word.id === freshNoPosWord.id) continue;
  records[word.id] = {
    interval: 1,
    repetition: 1,
    efactor: 2.5,
    dueAt: Date.now() + 86400000,
    seen: 1,
    correct: 1,
    wrong: 0,
    lastSeenAt: Date.now(),
    lastSource: 'study',
    mistakeDebt: 0
  };
}

const study = createEnvironment({
  hash: '#study',
  storedState: {
    records,
    conjugations: {},
    daily: {
      date: todayKey(),
      newWords: 0,
      reviews: 0,
      correct: 0,
      total: 0,
      uniqueActivities: []
    },
    streak: { days: 0, lastStudyDate: '' }
  }
});

check(study.app.innerHTML.includes('1 / 1'), '直接打开学习页锚点时应立即开始学习，而不是显示空完成页');
check(!study.app.innerHTML.includes('<span class="tag"></span>'), '学习卡不应渲染空词性标签');
check(study.app.innerHTML.includes('<span class="tag level">B2</span>'), '无词性词条仍应显示 CEFR 等级标签');
check(study.app.innerHTML.includes('<div class="word-large" lang="es">'), '西语学习卡应标记 lang="es"');

console.log('应用交互检查通过：完整备份、状态缓存、每日目标、复习节奏、七日历史、四选一、拼写与听写、结果页错题入口、反馈详情、不会题讲解、键盘操作、变位朗读、模式切换保护、变位表、收藏专项训练、训练续接、搜索、连续天数、朗读设置和空字段展示均正常。');
