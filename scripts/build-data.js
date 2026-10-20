const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const wordsModule = require('../src/data/words');
const conjugations = require('../src/data/conjugations');

const payload = {
  version: '1.0.0',
  words: wordsModule.WORDS,
  categories: wordsModule.CATEGORIES,
  pronouns: conjugations.PRONOUNS,
  tenses: conjugations.TENSES,
  verbs: conjugations.VERBS
};

fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'assets', 'data.js'),
  'window.SPANISH_DATA=' + JSON.stringify(payload) + ';\n',
  'utf8'
);

console.log('Generated assets/data.js:', payload.words.length, 'words');
