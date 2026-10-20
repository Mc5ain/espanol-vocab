const fs = require('fs');
const path = require('path');
const { WORDS, CATEGORIES } = require('../src/data/words');
const {
  PRONOUNS,
  TENSES,
  VERBS
} = require('../src/data/conjugations');

const root = path.resolve(__dirname, '..');
const book = JSON.parse(fs.readFileSync(path.join(root, 'src/data/dele-book.json'), 'utf8'));
const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

const ids = new Set();
const normalizedSpanish = new Set();
const normalizedMeanings = new Set();
let duplicateIds = 0;
let duplicateWords = 0;
let duplicateMeanings = 0;

for (const word of WORDS) {
  check(word.id && word.es && word.zh && word.category, `词条缺少必要字段：${word.id || word.es || '(未知)'}`);
  check(Boolean(CATEGORIES[word.category]), `词条分类不存在：${word.id} (${word.category})`);
  check(
    !word.example || Boolean(word.exampleZh),
    `例句缺少中文翻译：${word.id} (${word.es})`
  );
  check(!/\s{2,}/.test(word.example || ''), `例句含连续空格：${word.id}`);
  check(!/\s+[.,;!?]/.test(word.example || ''), `例句标点前含空格：${word.id}`);
  check(!/\s[A-ZÁÉÍÓÚÜÑ]$/.test(word.example || ''), `例句末尾含孤立大写字母：${word.id}`);
  check(
    !/[a-záéíóúüñ]-[a-záéíóúüñ]|[a-záéíóúüñ]\s+-\s*[a-záéíóúüñ]/i.test(word.example || ''),
    `例句可能含 OCR 断词：${word.id}`
  );
  check(
    !word.example || /[.!?。！？]$/.test(word.example.trim()),
    `例句缺少句末标点：${word.id} (${word.es})`
  );
  check(
    !/^[B-ZÁÉÍÓÚÜÑ]\s+[a-záéíóúüñ]/.test(word.es),
    `词目可能含 OCR 断词：${word.id} (${word.es})`
  );
  if (ids.has(word.id)) duplicateIds += 1;
  ids.add(word.id);

  const normalized = word.es.trim().toLowerCase().replace(/\s+/g, ' ');
  if (normalizedSpanish.has(normalized)) duplicateWords += 1;
  normalizedSpanish.add(normalized);
  const meaning = word.zh.trim().toLowerCase().replace(/\s+/g, ' ');
  if (normalizedMeanings.has(meaning)) duplicateMeanings += 1;
  normalizedMeanings.add(meaning);
}

check(duplicateIds === 0, `发现 ${duplicateIds} 个重复词条 ID`);
check(duplicateWords === 0, `发现 ${duplicateWords} 个重复西语词目`);
check(duplicateMeanings === 0, `发现 ${duplicateMeanings} 个重复中文释义`);

const infinitives = new Set();
for (const verb of VERBS) {
  check(Boolean(verb.infinitive && verb.meaning), `变位动词缺少词形或释义：${verb.infinitive || '(未知)'}`);
  check(!infinitives.has(verb.infinitive), `变位动词重复：${verb.infinitive}`);
  infinitives.add(verb.infinitive);
  check(Boolean(verb.forms) && typeof verb.forms === 'object', `变位数据缺失：${verb.infinitive}`);
  for (const tense of TENSES) {
    const forms = verb.forms && verb.forms[tense.key];
    check(
      Array.isArray(forms) && forms.length === PRONOUNS.length,
      `变位形式数量错误：${verb.infinitive} ${tense.name}`
    );
    check(
      Array.isArray(forms) && forms.every(form => typeof form === 'string' && form.trim() === form && form),
      `变位形式为空或含多余空格：${verb.infinitive} ${tense.name}`
    );
    const counts = Array.isArray(forms)
      ? forms.reduce((result, form) => {
          result[form] = (result[form] || 0) + 1;
          return result;
        }, {})
      : {};
    check(
      Object.values(counts).every(count => count <= 2),
      `同一时态内存在异常重复变位：${verb.infinitive} ${tense.name}`
    );
    check(
      new Set(forms || []).size >= 4,
      `变位干扰项不足：${verb.infinitive} ${tense.name}`
    );
  }
}
check(VERBS.length === 24, `变位动词数应为 24，当前为 ${VERBS.length}`);
const dar = VERBS.find(verb => verb.infinitive === 'dar');
check(dar && dar.forms.presente[0] === 'doy', 'dar 的现在时第一人称应为 doy');
check(dar && dar.forms.subjuntivo[0] === 'dé', 'dar 的现在虚拟式第一人称应为 dé');

const levels = WORDS.reduce((result, word) => {
  result[word.level] = (result[word.level] || 0) + 1;
  return result;
}, {});
const examples = WORDS.filter(word => word.example).length;
const bookWords = WORDS.filter(word => word.category === 'dele_b2_book').length;
const unlabeledPhrases = WORDS.filter(word =>
  !word.pos && /\s/.test(word.es.trim())
).length;

check(WORDS.length === 1657, `全站词条数应为 1657，当前为 ${WORDS.length}`);
check(levels.B2 === 1388, `B2 词条数应为 1388，当前为 ${levels.B2 || 0}`);
check(bookWords === 1304, `B2 原版分类应为 1304，当前为 ${bookWords}`);
check(examples === 1657, `带例句词条数应为 1657，当前为 ${examples}`);
check(examples === WORDS.length, `仍有 ${WORDS.length - examples} 个词条缺少例句`);
check(unlabeledPhrases === 0, `仍有 ${unlabeledPhrases} 个多词词条缺少词性`);
check(book.length >= bookWords, 'B2 原书源数据少于去重后的分类词条数');

if (errors.length) {
  console.error(`词库检查失败，共 ${errors.length} 项：`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `词库检查通过：${WORDS.length} 个词条，${levels.B2} 个 B2，${bookWords} 个 B2 原版精选，${examples} 个含例句，${VERBS.length} 个变位动词。`
);
