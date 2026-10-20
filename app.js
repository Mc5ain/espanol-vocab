(() => {
  const DATA = window.SPANISH_DATA;
  const WORDS = DATA.words;
  const CATEGORIES = DATA.categories;
  const STORAGE_KEY = 'espanol_web_v1';
  const TARGET_KEY = 'espanol_dele_target';
  const DAY_MS = 86400000;
  const app = document.querySelector('#app');
  const toast = document.querySelector('#toast');
  const aboutDialog = document.querySelector('#about-dialog');

  let currentView = 'home';
  let studySession = null;
  let quizSession = null;
  let drillSession = null;
  let deferredInstallPrompt = null;
  let targetLevel = localStorage.getItem(TARGET_KEY) || 'B2';
  const vocabularyState = {
    query: '',
    category: 'all',
    level: 'all',
    expanded: ''
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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

  function defaultState() {
    return {
      records: {},
      daily: { date: todayKey(), newWords: 0, reviews: 0, correct: 0, total: 0 },
      streak: { days: 0, lastStudyDate: '' }
    };
  }

  function loadState() {
    let state;
    try {
      state = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (error) {
      state = null;
    }
    if (!state || typeof state !== 'object') state = defaultState();
    if (!state.records) state.records = {};
    if (!state.daily) state.daily = defaultState().daily;
    if (state.daily.date !== todayKey()) {
      state.daily = defaultState().daily;
    }
    if (!state.streak) state.streak = { days: 0, lastStudyDate: '' };
    return state;
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
      seen: (previous ? previous.seen || 0 : 0) + 1,
      correct: (previous ? previous.correct || 0 : 0) + (grade >= 3 ? 1 : 0),
      wrong: (previous ? previous.wrong || 0 : 0) + (grade < 3 ? 1 : 0),
      lastSeenAt: Date.now()
    };

    state.daily.total += 1;
    state.daily[isNew ? 'newWords' : 'reviews'] += 1;
    if (grade >= 3) state.daily.correct += 1;

    const today = todayKey();
    if (state.streak.lastStudyDate !== today) {
      const yesterday = todayKey(new Date(Date.now() - DAY_MS));
      state.streak.days = state.streak.lastStudyDate === yesterday
        ? state.streak.days + 1
        : 1;
      state.streak.lastStudyDate = today;
    }
    saveState(state);
    updateHeader();
    return state;
  }

  function recordQuiz(id, correct) {
    const state = loadState();
    const record = state.records[id];
    if (record) {
      record.correct = (record.correct || 0) + (correct ? 1 : 0);
      record.wrong = (record.wrong || 0) + (correct ? 0 : 1);
      record.lastSeenAt = Date.now();
      if (!correct) {
        record.repetition = 0;
        record.interval = 1;
        record.dueAt = Date.now() + 10 * 60000;
      }
    }
    state.daily.total += 1;
    if (correct) state.daily.correct += 1;
    saveState(state);
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
    return {
      total: levelWords.length,
      learned: records.length,
      due: records.filter(item => item.dueAt <= now).length,
      fresh: levelWords.length - records.length,
      accuracy: attempts ? Math.round((correct / attempts) * 100) : 0,
      today: state.daily,
      streak: state.streak
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
    return due.concat(fresh).slice(0, limit);
  }

  function wordStatus(id) {
    const record = loadState().records[id];
    if (!record) return { key: 'new', label: '未学习' };
    if (record.dueAt <= Date.now()) return { key: 'due', label: '待复习' };
    return { key: 'learned', label: '已掌握' };
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

  function setView(view) {
    currentView = view;
    document.querySelectorAll('[data-nav]').forEach(button => {
      button.classList.toggle('active', button.dataset.nav === view);
    });
    if (view === 'study' && (!studySession || studySession.finished)) startStudy();
    if (view === 'quiz' && (!quizSession || quizSession.finished)) startQuiz();
    if (view === 'conjugation' && (!drillSession || drillSession.finished)) startConjugation();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateHeader() {
    const meta = {
      home: [`DELE ${targetLevel}`, `今天也背一点 DELE ${targetLevel} 词汇`],
      study: ['SM-2 复习', '把词真正记住'],
      quiz: ['随机小测', '双向回忆训练'],
      conjugation: ['动词变位', '规则与不规则形式'],
      vocabulary: ['DELE 词库', `共 ${WORDS.length} 词 · 当前 ${targetLevel}`]
    }[currentView];
    document.querySelector('#view-kicker').textContent = meta[0];
    document.querySelector('#view-title').textContent = meta[1];
    document.querySelector('#streak-pill').textContent =
      `连续 ${loadState().streak.days || 0} 天`;
  }

  function render() {
    updateHeader();
    if (currentView === 'home') renderHome();
    if (currentView === 'study') renderStudy();
    if (currentView === 'quiz') renderQuiz();
    if (currentView === 'conjugation') renderConjugation();
    if (currentView === 'vocabulary') renderVocabulary();
  }

  function renderHome() {
    const data = overview();
    const categories = categoryProgress();
    const dailyDone = data.today.newWords + data.today.reviews;
    const dailyPercent = Math.min(100, Math.round((dailyDone / 20) * 100));
    app.innerHTML = `
      <section class="view">
        <div class="hero">
          <div class="hero-grid">
            <div>
              <span class="eyebrow">APRENDE CADA DÍA</span>
              <h1>¡Hola!</h1>
              <p>按 DELE ${targetLevel} 级别组织词汇、篇章表达和动词变位训练。<br>先回忆，再揭晓，让复习间隔自动适应记忆难度。</p>
            </div>
            <div class="goal-panel">
              <div class="goal-head">
                <div><strong>${dailyDone}</strong><span> / 20 词</span></div>
                <span>${dailyPercent}%</span>
              </div>
              <div class="progress-track"><div class="progress-fill" style="width:${dailyPercent}%"></div></div>
              <div class="sm-note" style="color:rgba(255,255,255,.58);text-align:left">今日新词与复习总量</div>
            </div>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat"><strong>${data.learned}</strong><span>已接触</span></div>
          <div class="stat"><strong>${data.due}</strong><span>待复习</span></div>
          <div class="stat"><strong>${data.fresh}</strong><span>未学习</span></div>
          <div class="stat"><strong>${data.accuracy}%</strong><span>正确率</span></div>
        </div>

        <div class="dele-level-strip">
          <span>当前目标</span>
          <div class="level-switch">
            ${['B1', 'B2', 'C1'].map(level => `<button class="${targetLevel === level ? 'active' : ''}" data-target-level="${level}">DELE ${level}</button>`).join('')}
          </div>
          <small>按公开 DELE 能力主题自主整理，非官方词表</small>
        </div>

        <div class="home-actions">
          <button class="quick-card primary" data-start-study>
            <span class="icon">▤</span>
            <h3>开始今日学习</h3>
            <p>${data.due} 个 ${targetLevel} 待复习 · ${Math.min(20, data.fresh)} 个新词将进入队列</p>
          </button>
          <button class="quick-card" data-nav="quiz">
            <span class="icon">?</span>
            <h3>随机小测</h3>
            <p>西班牙语与中文双向四选一</p>
          </button>
          <button class="quick-card" data-nav="conjugation">
            <span class="icon">V</span>
            <h3>动词变位</h3>
            <p>现在时、简单过去时、虚拟式</p>
          </button>
        </div>

        <div class="section-head">
          <div><h2>分类进度</h2><p>先积累专业表达，再回到具体语境</p></div>
          <button class="text-button" data-nav="vocabulary" style="width:auto;color:var(--muted)">查看全部词库 →</button>
        </div>
        <div class="category-grid">
          ${categories.map(item => `
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

  function startStudy() {
    studySession = {
      queue: getQueue(20),
      index: 0,
      flipped: false,
      known: 0,
      weak: 0,
      finished: false
    };
  }

  function renderStudy() {
    const session = studySession;
    if (!session || session.finished) {
      app.innerHTML = finishPanel(
        '这一轮完成了',
        '间隔复习比连续死记更牢。答错的内容会重新进入短周期复习。',
        session ? session.known : 0,
        session ? session.weak : 0,
        'study-again'
      );
      return;
    }
    if (!session.queue.length) {
      app.innerHTML = `
        <section class="view">
          <div class="empty-state">
            <div class="finish-badge">✓</div>
            <h1>今天没有待复习内容</h1>
            <p>可以去做一轮随机小测，或直接浏览专业词库。</p>
            <div class="button-row">
              <button class="primary-button" data-nav="quiz">开始小测</button>
              <button class="secondary-button" data-nav="vocabulary">浏览词库</button>
            </div>
          </div>
        </section>
      `;
      return;
    }

    const word = session.queue[session.index];
    const category = CATEGORIES[word.category];
    const progress = Math.round((session.index / session.queue.length) * 100);
    app.innerHTML = `
      <section class="view study-layout">
        <div class="session-head">
          <span class="session-count">${session.index + 1} / ${session.queue.length}</span>
          <span class="badge">${escapeHtml(category.name)}</span>
        </div>
        <div class="session-track"><div class="session-fill" style="width:${progress}%"></div></div>

        <article class="flashcard" data-flip>
          <div class="card-top">
            <span class="language-mark">ES</span>
            <div class="tags">
              <span class="tag">${escapeHtml(word.pos)}</span>
              <span class="tag level">${escapeHtml(word.level || 'A1')}</span>
            </div>
          </div>
          <div class="card-main">
            ${session.flipped ? `
              <div class="word-large word-back">${escapeHtml(word.zh)}</div>
              ${word.collocation ? `<div class="collocation"><strong>常见搭配：</strong>${escapeHtml(word.collocation)}</div>` : ''}
              <div class="example-box">${escapeHtml(word.example)}</div>
              <div class="example-zh">${escapeHtml(word.exampleZh)}</div>
            ` : `
              <div class="word-large">${escapeHtml(word.es)}</div>
              <div class="card-hint">先在心里回想中文意思和常见搭配。</div>
              <div class="card-hint" style="color:#b39a87">点击卡片揭晓答案</div>
            `}
          </div>
          <div class="card-bottom">
            <span>ESPANOL · ${escapeHtml(word.level || 'A1')}</span>
            <span>${session.flipped ? '再回忆一次，再判断' : '回忆完成后再翻面'}</span>
          </div>
        </article>

        ${session.flipped ? `
          <button class="primary-button study-next" data-action="next-card">下一个</button>
          <div class="sm-note">系统会按 SM-2 间隔自动安排下次复习</div>
        ` : ''}
      </section>
    `;
  }

  function handleGrade(grade) {
    const session = studySession;
    if (!session || !session.flipped || session.finished) return;
    const word = session.queue[session.index];
    gradeWord(word.id, grade);
    if (grade >= 3) session.known += 1;
    else session.weak += 1;
    session.index += 1;
    session.flipped = false;
    if (session.index >= session.queue.length) session.finished = true;
    renderStudy();
  }

  function finishPanel(title, text, known, weak, action) {
    return `
      <section class="view">
        <div class="finish-panel">
          <div class="finish-badge">✓</div>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(text)}</p>
          <div class="finish-stats">
            <div><strong>${known + weak}</strong><span>本轮复习</span></div>
          </div>
          <div class="button-row">
            <button class="primary-button" data-action="study-again">再学一轮</button>
            <button class="secondary-button" data-nav="home">返回首页</button>
          </div>
        </div>
      </section>
    `;
  }

  function buildQuiz() {
    return shuffle(wordsForLevel(targetLevel)).slice(0, 10).map((word, index) => {
      const toChinese = index % 2 === 0;
      const answer = toChinese ? word.zh : word.es;
      const otherTexts = [];
      shuffle(wordsForLevel(targetLevel)).forEach(item => {
        const text = toChinese ? item.zh : item.es;
        if (text !== answer && !otherTexts.includes(text)) otherTexts.push(text);
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

  function startQuiz() {
    quizSession = {
      questions: buildQuiz(),
      index: 0,
      score: 0,
      finished: false
    };
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
              <button class="secondary-button" data-nav="home">返回首页</button>
            </div>
          </div>
        </section>
      `;
      return;
    }

    const question = session.questions[session.index];
    app.innerHTML = `
      <section class="view quiz-layout">
        <div class="session-head">
          <span class="session-count">第 ${session.index + 1} / 10 题</span>
          <span class="badge">${question.direction}</span>
        </div>
        <div class="session-track"><div class="session-fill" style="width:${session.index * 10}%"></div></div>
        <div class="question-card">
          <div class="question-label">请选择正确的意思</div>
          <div class="question-word">${escapeHtml(question.prompt)}</div>
        </div>
        <div class="options-list">
          ${question.options.map((option, index) => {
            let className = 'option-button';
            if (question.answered && option.correct) className += ' correct';
            if (question.answered && question.selected === option.text && !option.correct) className += ' wrong';
            return `
              <button class="${className}" data-quiz-option="${index}" ${question.answered ? 'disabled' : ''}>
                <span class="option-letter">${option.letter}</span>
                <span>${escapeHtml(option.text)}</span>
                ${question.answered && option.correct ? '<span style="margin-left:auto;color:#0d8a58">✓</span>' : ''}
              </button>
            `;
          }).join('')}
        </div>
        ${question.answered ? `
          <div class="feedback-box ${question.selected === question.answer ? 'good' : ''}">
            <div class="feedback-title">${question.selected === question.answer ? '答对了' : `正确答案：${escapeHtml(question.answer)}`}</div>
            <div class="feedback-example">${escapeHtml(question.word.example)}</div>
            <div class="feedback-zh">${escapeHtml(question.word.exampleZh)}</div>
            <button class="primary-button" style="margin-top:14px" data-action="quiz-next">${session.index === 9 ? '查看结果' : '下一题'}</button>
          </div>
        ` : ''}
      </section>
    `;
  }

  function chooseQuizOption(index) {
    const session = quizSession;
    const question = session && session.questions[session.index];
    if (!question || question.answered) return;
    const option = question.options[index];
    question.answered = true;
    question.selected = option.text;
    if (option.correct) session.score += 1;
    recordQuiz(question.word.id, option.correct);
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
    renderQuiz();
  }

  function buildConjugationQuestions() {
    const questions = [];
    const used = new Set();
    while (questions.length < 10) {
      const verb = DATA.verbs[Math.floor(Math.random() * DATA.verbs.length)];
      const tense = DATA.tenses[Math.floor(Math.random() * DATA.tenses.length)];
      const personIndex = Math.floor(Math.random() * DATA.pronouns.length);
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
          <span class="badge" style="background:#d8f3ee;color:#0f766e">答对 ${session.score}</span>
        </div>
        <div class="session-track"><div class="session-fill" style="width:${session.index * 10}%;background:linear-gradient(90deg,#0f766e,#2dd4bf)"></div></div>
        <div class="question-card verb">
          <div class="question-word">${escapeHtml(question.verb.infinitive)}</div>
          <div class="question-meta">${escapeHtml(question.verb.meaning)}</div>
          <div class="question-meta">${escapeHtml(question.tense.name)} × ${escapeHtml(question.pronoun)}</div>
        </div>
        <div class="options-list">
          ${question.options.map((option, index) => {
            let className = 'option-button';
            if (question.answered && option.correct) className += ' correct';
            if (question.answered && question.selected === option.text && !option.correct) className += ' wrong';
            return `
              <button class="${className}" data-drill-option="${index}" ${question.answered ? 'disabled' : ''}>
                <span class="option-letter">${option.letter}</span>
                <span>${escapeHtml(option.text)}</span>
              </button>
            `;
          }).join('')}
        </div>
        ${question.answered ? `
          <div class="feedback-box ${question.selected === question.answer ? 'good' : ''}">
            <div class="feedback-title">${question.selected === question.answer ? '正确' : `正确答案：${escapeHtml(question.answer)}`}</div>
            <div class="feedback-zh">${escapeHtml(question.verb.infinitive)} · ${escapeHtml(question.tense.name)} · ${escapeHtml(question.pronoun)}</div>
            <button class="primary-button" style="margin-top:14px" data-action="drill-next">${session.index === 9 ? '查看结果' : '下一题'}</button>
          </div>
        ` : ''}
      </section>
    `;
  }

  function chooseDrillOption(index) {
    const session = drillSession;
    const question = session && session.questions[session.index];
    if (!question || question.answered) return;
    const option = question.options[index];
    question.answered = true;
    question.selected = option.text;
    if (option.correct) session.score += 1;
    renderConjugation();
  }

  function nextDrillQuestion() {
    const session = drillSession;
    if (!session) return;
    if (session.index >= session.questions.length - 1) session.finished = true;
    else session.index += 1;
    renderConjugation();
  }

  function filteredWords() {
    const query = vocabularyState.query.trim().toLowerCase();
    return WORDS.filter(word => {
      if (vocabularyState.category !== 'all' && word.category !== vocabularyState.category) return false;
      if (vocabularyState.level !== 'all' && (word.level || 'A1') !== vocabularyState.level) return false;
      if (!query) return true;
      return word.es.toLowerCase().includes(query) ||
        word.zh.includes(query) ||
        word.example.toLowerCase().includes(query) ||
        (word.collocation || '').toLowerCase().includes(query);
    });
  }

  function renderVocabulary() {
    const levelOptions = ['all', 'A1', 'A2', 'B1', 'B2', 'C1'];
    app.innerHTML = `
      <section class="view">
        <div class="toolbar">
          <input class="search-box" id="vocab-search" type="search" placeholder="搜索西班牙语、中文、搭配或例句" value="${escapeHtml(vocabularyState.query)}">
          <select class="select-box" id="category-filter">
            <option value="all">全部分类</option>
            ${Object.keys(CATEGORIES).map(key => `<option value="${key}" ${vocabularyState.category === key ? 'selected' : ''}>${escapeHtml(CATEGORIES[key].name)}</option>`).join('')}
          </select>
          <select class="select-box" id="level-filter">
            ${levelOptions.map(level => `<option value="${level}" ${vocabularyState.level === level ? 'selected' : ''}>${level === 'all' ? '全部等级' : level}</option>`).join('')}
          </select>
        </div>
        <div class="result-line" id="vocab-count"></div>
        <div class="word-list" id="vocab-list"></div>
      </section>
    `;
    renderVocabList();
  }

  function renderVocabList() {
    const list = filteredWords();
    const count = document.querySelector('#vocab-count');
    const container = document.querySelector('#vocab-list');
    if (!count || !container) return;
    count.textContent = `共 ${list.length} 个词`;
    container.innerHTML = list.map(word => {
      const category = CATEGORIES[word.category];
      const status = wordStatus(word.id);
      const expanded = vocabularyState.expanded === word.id;
      return `
        <div class="word-row">
          <button class="toggle-row" data-toggle-word="${word.id}" style="margin:0">
            <span style="display:block;text-align:left;flex:1">
              <span class="word-line">
                <span>
                  <strong class="word-title">${escapeHtml(word.es)}</strong>
                  <span class="word-meaning">${escapeHtml(word.zh)}</span>
                  <span class="word-meta">
                    <span style="color:${category.color}">${escapeHtml(category.name)}</span>
                    <span>·</span><span>${escapeHtml(word.level || 'A1')}</span>
                    <span>·</span><span>${escapeHtml(word.pos)}</span>
                  </span>
                </span>
                <span class="status-pill ${status.key}">${status.label}</span>
              </span>
            </span>
            <span style="align-self:center">${expanded ? '⌃' : '⌄'}</span>
          </button>
          ${expanded ? `
            <div class="word-detail">
              ${word.collocation ? `<strong>搭配：</strong>${escapeHtml(word.collocation)}<br>` : ''}
              ${escapeHtml(word.example)}
              <small>${escapeHtml(word.exampleZh)}</small>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  document.addEventListener('click', event => {
    const targetButton = event.target.closest('[data-target-level]');
    if (targetButton) {
      targetLevel = targetButton.dataset.targetLevel;
      localStorage.setItem(TARGET_KEY, targetLevel);
      vocabularyState.level = targetLevel;
      studySession = null;
      quizSession = null;
      render();
      showToast(`已切换到 DELE ${targetLevel}`);
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
    if (event.target.closest('[data-flip]')) {
      if (studySession) {
        studySession.flipped = !studySession.flipped;
        renderStudy();
      }
      return;
    }
    if (event.target.closest('[data-action="next-card"]')) {
      handleGrade(3);
      return;
    }
    const quizOption = event.target.closest('[data-quiz-option]');
    if (quizOption) {
      chooseQuizOption(Number(quizOption.dataset.quizOption));
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
      startStudy();
      renderStudy();
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
        studySession = null;
        quizSession = null;
        aboutDialog.close();
        updateHeader();
        render();
        showToast('学习记录已清除');
      }
    }
  });

  app.addEventListener('input', event => {
    if (event.target.id === 'vocab-search') {
      vocabularyState.query = event.target.value;
      renderVocabList();
    }
  });

  app.addEventListener('change', event => {
    if (event.target.id === 'category-filter') {
      vocabularyState.category = event.target.value;
      renderVocabList();
    }
    if (event.target.id === 'level-filter') {
      vocabularyState.level = event.target.value;
      renderVocabList();
    }
  });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    document.querySelector('#install-button').textContent = '安装到设备';
  });

  document.querySelector('#install-button').addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      return;
    }
    showToast('iPhone 请点分享按钮，再选“添加到主屏幕”');
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  render();
})();
