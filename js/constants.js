export const GRADES = ['A', 'B', 'C', 'D', 'E'];

// Actual grades derived from 17Lands data, ordered best to worst.
export const ACTUAL_GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'];

// Score thresholds for mapping a 0-100 percentile score to an actual grade.
export const GRADE_THRESHOLDS = [
  ['A+', 99],
  ['A', 95],
  ['A-', 90],
  ['B+', 85],
  ['B', 76],
  ['B-', 68],
  ['C+', 57],
  ['C', 45],
  ['C-', 36],
  ['D+', 27],
  ['D', 17],
  ['D-', 5],
  ['F', 0],
];

// Bucket an actual grade onto the app's own A-E scale for comparison.
export const ACTUAL_GRADE_BUCKETS = Object.freeze({
  'A+': 'A',
  A: 'A',
  'A-': 'A',
  'B+': 'B',
  B: 'B',
  'B-': 'B',
  'C+': 'C',
  C: 'C',
  'C-': 'C',
  'D+': 'D',
  D: 'D',
  'D-': 'D',
  F: 'E',
});

export const ANALYSIS_COLOR_VALUES = [
  { value: 'W', cls: 'd-w' },
  { value: 'U', cls: 'd-u' },
  { value: 'B', cls: 'd-b' },
  { value: 'R', cls: 'd-r' },
  { value: 'G', cls: 'd-g' },
  { value: 'C', cls: 'd-c' },
];

export const ANALYSIS_RARITY_VALUES = ['common', 'uncommon', 'rare', 'mythic', 'special', 'bonus'];
