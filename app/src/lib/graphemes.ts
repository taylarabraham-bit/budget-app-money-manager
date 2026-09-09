// Icon fields cap "characters as the user sees them". Slicing by UTF-16 units
// (or code points) can cut a multi-part emoji mid-sequence into broken glyphs.
type GraphemeSegmenter = { segment(input: string): Iterable<{ segment: string }> };
type SegmenterCtor = new (locales?: string, options?: { granularity: 'grapheme' }) => GraphemeSegmenter;

// tsconfig lib is ES2020, which predates Intl.Segmenter's typings.
const Segmenter = (Intl as { Segmenter?: SegmenterCtor }).Segmenter;

/** First `max` user-perceived characters (grapheme clusters) of `value`. */
export function clampGraphemes(value: string, max: number): string {
  if (!Segmenter) return [...value].slice(0, max).join('');
  let out = '';
  let count = 0;
  for (const { segment } of new Segmenter(undefined, { granularity: 'grapheme' }).segment(value)) {
    if (count === max) break;
    out += segment;
    count += 1;
  }
  return out;
}
