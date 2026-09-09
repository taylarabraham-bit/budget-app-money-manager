import { describe, expect, it } from 'vitest';
import { clampGraphemes } from './graphemes';

const ZWJ = '\u200D';
const VS16 = '\uFE0F';
// A ZWJ sequence like the one from the QA report: one visible glyph, 8 UTF-16 units.
const COUPLE = `\u{1F469}${ZWJ}\u2764${VS16}${ZWJ}\u{1F469}`;

describe('clampGraphemes', () => {
  it('slices plain text by characters', () => {
    expect(clampGraphemes('abc', 2)).toBe('ab');
    expect(clampGraphemes('ab', 2)).toBe('ab');
    expect(clampGraphemes('', 2)).toBe('');
  });

  it('keeps a surrogate-pair emoji whole at max 1', () => {
    expect(clampGraphemes('\u{1F4BC}x', 1)).toBe('\u{1F4BC}');
  });

  it('keeps variation-selector and skin-tone emoji whole', () => {
    expect(clampGraphemes(`\u{1F3F7}${VS16}`, 1)).toBe(`\u{1F3F7}${VS16}`);
    expect(clampGraphemes('\u{1F44D}\u{1F3FD}!', 1)).toBe('\u{1F44D}\u{1F3FD}');
  });

  it('keeps a flag emoji (two regional indicators) whole', () => {
    expect(clampGraphemes('\u{1F1E6}\u{1F1FA}x', 1)).toBe('\u{1F1E6}\u{1F1FA}');
  });

  it('never splits a ZWJ sequence (the QA icon-field regression)', () => {
    // Old code did value.slice(0, 2), which cut COUPLE to a lone \u{1F469}.
    expect(clampGraphemes(COUPLE, 2)).toBe(COUPLE);
    expect(clampGraphemes(`${COUPLE}\u{1F355}\u2615`, 2)).toBe(`${COUPLE}\u{1F355}`);
  });

  it('keeps combining marks attached', () => {
    // Decomposed e-acute: 'e' + U+0301 combining accent.
    expect(clampGraphemes('e\u0301f', 1)).toBe('e\u0301');
  });
});
