/** Control sizes shared by buttons, fields and chips. */
export type Size = 'sm' | 'md' | 'lg';

/** Status / money tones used by badges, alerts, progress and amounts. */
export type Tone = 'neutral' | 'positive' | 'negative' | 'warning' | 'info';

/**
 * The six household member colours. Each member of a household gets one;
 * it carries through avatars, chips and anything attributed to that member.
 */
export type MemberColor = 'coral' | 'violet' | 'sky' | 'lime' | 'rose' | 'amber';

export const MEMBER_COLORS: readonly MemberColor[] = ['coral', 'violet', 'sky', 'lime', 'rose', 'amber'];

/** A household member as components reference them (attribution, avatars). */
export interface Member {
  /** Stable id - the React key wherever a list of members is rendered, so two "Sam"s stay distinct (audit UX-14). */
  id?: string;
  /** Display name, e.g. "Priya". */
  name: string;
  /** Member colour; derived from the name when omitted. */
  color?: MemberColor;
  /** Optional photo URL; initials render when absent. */
  avatarUrl?: string;
}
