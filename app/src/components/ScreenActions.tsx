import { Avatar, Button } from '@budget-app/ui';
import { useHousehold } from '../data/store';
import { RemindersButton } from '../features/reminders';
import { useNavigation } from '../navigation';

const GearIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

/**
 * The right-hand end of every top-level PageHeader: the reminders bell and
 * the signed-in member's avatar (the "who am I" cue from the household
 * guide), which opens Settings. One component so every screen gets the same
 * actions - drop `<ScreenActions />` into `actions`.
 */
export function ScreenActions() {
  const { members, currentMemberId } = useHousehold();
  const { openSettings } = useNavigation();
  const me = members.find((m) => m.id === currentMemberId);
  return (
    <div className="bdg-row bdg-gap-2">
      <RemindersButton />
      {me ? (
        <button type="button" className="app-avatar-button" aria-label={`Settings (signed in as ${me.name})`} title="Settings" onClick={openSettings}>
          <Avatar name={me.name} color={me.color} size="sm" status="active" />
        </button>
      ) : (
        // No signed-in member (a join that landed an empty members collection): the
        // bell and a plain Settings button stay, or a phone - which has no sidebar -
        // is left with no way into Settings at all (audit UI-30).
        <Button variant="ghost" size="sm" aria-label="Settings" title="Settings" onClick={openSettings} iconStart={<GearIcon />}>
          <span className="bdg-sr-only">Settings</span>
        </Button>
      )}
    </div>
  );
}
