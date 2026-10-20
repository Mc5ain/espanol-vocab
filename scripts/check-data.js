const fs = require('fs');
const path = require('path');
const { WORDS, CATEGORIES } = require('../src/data/words');

const root = path.resolve(__dirname, '..');
const book = JSON.parse(fs.readFileSync(path.join(root, 'src/data/dele-book.json'), 'utf8'));
const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

const ids = new Set();
const normalizedSpanish = new Set();
let duplicateIds = 0;
let duplicateWords = 0;

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
    !/^[B-ZÁÉÍÓÚÜÑ]\s+[a-záéíóúüñ]/.test(word.es),
    `词目可能含 OCR 断词：${word.id} (${word.es})`
  );
  if (ids.has(word.id)) duplicateIds += 1;
  ids.add(word.id);

  const normalized = word.es.trim().toLowerCase().replace(/\s+/g, ' ');
  if (normalizedSpanish.has(normalized)) duplicateWords += 1;
  normalizedSpanish.add(normalized);
}

check(duplicateIds === 0, `发现 ${duplicateIds} 个重复词条 ID`);
check(duplicateWords === 0, `发现 ${duplicateWords} 个重复西语词目`);

const levels = WORDS.reduce((result, word) => {
  result[word.level] = (result[word.level] || 0) + 1;
  return result;
}, {});
const examples = WORDS.filter(word => word.example).length;
const bookWords = WORDS.filter(word => word.category === 'dele_b2_book').length;

check(WORDS.length === 1657, `全站词条数应为 1657，当前为 ${WORDS.length}`);
check(levels.B2 === 1388, `B2 词条数应为 1388，当前为 ${levels.B2 || 0}`);
check(bookWords === 1304, `B2 原版分类应为 1304，当前为 ${bookWords}`);
check(examples === 1622, `带例句词条数应为 1622，当前为 ${examples}`);
check(book.length >= bookWords, 'B2 原书源数据少于去重后的分类词条数');

if (errors.length) {
  console.error(`词库检查失败，共 ${errors.length} 项：`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `词库检查通过：${WORDS.length} 个词条，${levels.B2} 个 B2，${bookWords} 个 B2 原版精选，${examples} 个含例句。`
);
