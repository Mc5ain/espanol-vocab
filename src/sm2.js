/**
 * SuperMemo 2 (SM-2) scheduler.
 *
 * Adapted from VienDinhCom/supermemo (MIT License):
 * https://github.com/VienDinhCom/supermemo
 *
 * Copyright (c) 2020 Vien Dinh
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files, to deal in the Software
 * without restriction, including without limitation the rights to use, copy,
 * modify, merge, publish, distribute, sublicense, and/or sell copies.
 */
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

  return {
    interval: interval,
    repetition: repetition,
    efactor: efactor
  };
}

module.exports = {
  supermemo
};
