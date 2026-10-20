const PRONOUNS = ['yo', 'tú', 'él / ella', 'nosotros', 'vosotros', 'ellos / ellas'];

const TENSES = [
  { key: 'presente', name: '现在时' },
  { key: 'indefinido', name: '简单过去时' },
  { key: 'subjuntivo', name: '现在虚拟式' }
];

const VERBS = [
  {
    infinitive: 'hablar',
    meaning: '说',
    forms: {
      presente: ['hablo', 'hablas', 'habla', 'hablamos', 'habláis', 'hablan'],
      indefinido: ['hablé', 'hablaste', 'habló', 'hablamos', 'hablasteis', 'hablaron'],
      subjuntivo: ['hable', 'hables', 'hable', 'hablemos', 'habléis', 'hablen']
    }
  },
  {
    infinitive: 'comer',
    meaning: '吃',
    forms: {
      presente: ['como', 'comes', 'come', 'comemos', 'coméis', 'comen'],
      indefinido: ['comí', 'comiste', 'comió', 'comimos', 'comisteis', 'comieron'],
      subjuntivo: ['coma', 'comas', 'coma', 'comamos', 'comáis', 'coman']
    }
  },
  {
    infinitive: 'vivir',
    meaning: '生活；居住',
    forms: {
      presente: ['vivo', 'vives', 'vive', 'vivimos', 'vivís', 'viven'],
      indefinido: ['viví', 'viviste', 'vivió', 'vivimos', 'vivisteis', 'vivieron'],
      subjuntivo: ['viva', 'vivas', 'viva', 'vivamos', 'viváis', 'vivan']
    }
  },
  {
    infinitive: 'ser',
    meaning: '是',
    forms: {
      presente: ['soy', 'eres', 'es', 'somos', 'sois', 'son'],
      indefinido: ['fui', 'fuiste', 'fue', 'fuimos', 'fuisteis', 'fueron'],
      subjuntivo: ['sea', 'seas', 'sea', 'seamos', 'seáis', 'sean']
    }
  },
  {
    infinitive: 'estar',
    meaning: '处于；在',
    forms: {
      presente: ['estoy', 'estás', 'está', 'estamos', 'estáis', 'están'],
      indefinido: ['estuve', 'estuviste', 'estuvo', 'estuvimos', 'estuvisteis', 'estuvieron'],
      subjuntivo: ['esté', 'estés', 'esté', 'estemos', 'estéis', 'estén']
    }
  },
  {
    infinitive: 'tener',
    meaning: '有',
    forms: {
      presente: ['tengo', 'tienes', 'tiene', 'tenemos', 'tenéis', 'tienen'],
      indefinido: ['tuve', 'tuviste', 'tuvo', 'tuvimos', 'tuvisteis', 'tuvieron'],
      subjuntivo: ['tenga', 'tengas', 'tenga', 'tengamos', 'tengáis', 'tengan']
    }
  },
  {
    infinitive: 'ir',
    meaning: '去',
    forms: {
      presente: ['voy', 'vas', 'va', 'vamos', 'vais', 'van'],
      indefinido: ['fui', 'fuiste', 'fue', 'fuimos', 'fuisteis', 'fueron'],
      subjuntivo: ['vaya', 'vayas', 'vaya', 'vayamos', 'vayáis', 'vayan']
    }
  },
  {
    infinitive: 'hacer',
    meaning: '做',
    forms: {
      presente: ['hago', 'haces', 'hace', 'hacemos', 'hacéis', 'hacen'],
      indefinido: ['hice', 'hiciste', 'hizo', 'hicimos', 'hicisteis', 'hicieron'],
      subjuntivo: ['haga', 'hagas', 'haga', 'hagamos', 'hagáis', 'hagan']
    }
  },
  {
    infinitive: 'poder',
    meaning: '能够',
    forms: {
      presente: ['puedo', 'puedes', 'puede', 'podemos', 'podéis', 'pueden'],
      indefinido: ['pude', 'pudiste', 'pudo', 'pudimos', 'pudisteis', 'pudieron'],
      subjuntivo: ['pueda', 'puedas', 'pueda', 'podamos', 'podáis', 'puedan']
    }
  },
  {
    infinitive: 'saber',
    meaning: '知道；会',
    forms: {
      presente: ['sé', 'sabes', 'sabe', 'sabemos', 'sabéis', 'saben'],
      indefinido: ['supe', 'supiste', 'supo', 'supimos', 'supisteis', 'supieron'],
      subjuntivo: ['sepa', 'sepas', 'sepa', 'sepamos', 'sepáis', 'sepan']
    }
  },
  {
    infinitive: 'decir',
    meaning: '说',
    forms: {
      presente: ['digo', 'dices', 'dice', 'decimos', 'decís', 'dicen'],
      indefinido: ['dije', 'dijiste', 'dijo', 'dijimos', 'dijisteis', 'dijeron'],
      subjuntivo: ['diga', 'digas', 'diga', 'digamos', 'digáis', 'digan']
    }
  },
  {
    infinitive: 'venir',
    meaning: '来',
    forms: {
      presente: ['vengo', 'vienes', 'viene', 'venimos', 'venís', 'vienen'],
      indefinido: ['vine', 'viniste', 'vino', 'vinimos', 'vinisteis', 'vinieron'],
      subjuntivo: ['venga', 'vengas', 'venga', 'vengamos', 'vengáis', 'vengan']
    }
  }
];

module.exports = {
  PRONOUNS,
  TENSES,
  VERBS
};
