import { describe, expect, it } from 'vitest';

import { filterSuburbs } from './suburbs';

const SAMPLE = [
  'Willetton',
  "O'Connor",
  'Armadale',
  'Belmont',
  'Cannington',
  'Fremantle',
  'Joondalup',
  'Kwinana',
  'Midland',
  'East Willetton'
];

describe('filterSuburbs', () => {
  it('returns Perth CBD first then alphabetical suburbs when empty', () => {
    expect(filterSuburbs(SAMPLE, '')).toEqual([
      'Perth CBD',
      'Armadale',
      'Belmont',
      'Cannington',
      'East Willetton',
      'Fremantle',
      'Joondalup',
      'Kwinana'
    ]);
  });

  it('ranks prefix matches before contains matches and caps at max', () => {
    expect(filterSuburbs(SAMPLE, 'wil')).toEqual(['Willetton', 'East Willetton']);
  });

  it('matches case- and apostrophe-insensitively', () => {
    expect(filterSuburbs(SAMPLE, 'ocon')).toEqual(["O'Connor"]);
    expect(filterSuburbs(SAMPLE, "O'CON")).toEqual(["O'Connor"]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterSuburbs(SAMPLE, 'zzzz')).toEqual([]);
  });
});
