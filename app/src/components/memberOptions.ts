import type { HouseholdMember } from '../data/types';

export interface MemberOption {
  value: string;
  label: string;
}

/**
 * Options for a "Paid by" / "Whose" / "Who wants it" picker. When the current
 * value points at a member who has since been removed, a labelled entry keeps
 * that id visible: a native <select> whose value matches no option shows its
 * FIRST option while the form silently re-saves the dead id (audit UX-5).
 */
export function memberOptionsFor(members: ReadonlyArray<Pick<HouseholdMember, 'id' | 'name'>>, currentId: string | null | undefined): MemberOption[] {
  const options = members.map((m) => ({ value: m.id, label: m.name }));
  if (currentId && !members.some((m) => m.id === currentId)) options.push({ value: currentId, label: 'A member since removed' });
  return options;
}
