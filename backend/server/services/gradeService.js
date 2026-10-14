const config = require('../config');

const GRADES = config.gradeThresholds.map(([letter, min]) => ({ letter, min }));

function gradeFor(stones) {
  let cur = GRADES[0];
  for (const g of GRADES) if (stones >= g.min) cur = g;
  return cur.letter;
}

function progress(stones) {
  const i = GRADES.findIndex((g) => g.letter === gradeFor(stones));
  const cur = GRADES[i];
  const next = GRADES[i + 1] || null;
  return {
    grade: cur.letter,
    next: next ? { letter: next.letter, min: next.min, remaining: next.min - stones } : null,
    ratio: next ? (stones - cur.min) / (next.min - cur.min) : 1,
  };
}

const gradeRank = (letter) => GRADES.findIndex((g) => g.letter === letter);

module.exports = { GRADES, gradeFor, progress, gradeRank };
