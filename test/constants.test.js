import { describe, expect, it } from 'vitest';
import {
  GRADES,
  ANALYSIS_COLOR_VALUES,
  ANALYSIS_RARITY_VALUES,
} from '../js/constants.js';

describe('GRADES', () => {
  it('contains A through E in order', () => {
    expect(GRADES).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
});

describe('ANALYSIS_COLOR_VALUES', () => {
  it('has one entry per colour plus colourless', () => {
    expect(ANALYSIS_COLOR_VALUES.map(v => v.value)).toEqual(['W', 'U', 'B', 'R', 'G', 'C']);
  });

  it('gives each entry a distinct css class', () => {
    const classes = ANALYSIS_COLOR_VALUES.map(v => v.cls);
    expect(new Set(classes).size).toBe(classes.length);
    expect(ANALYSIS_COLOR_VALUES[0].cls).toBe('d-w');
  });
});

describe('ANALYSIS_RARITY_VALUES', () => {
  it('lists every supported rarity', () => {
    expect(ANALYSIS_RARITY_VALUES).toEqual([
      'common',
      'uncommon',
      'rare',
      'mythic',
      'special',
      'bonus',
    ]);
  });
});
