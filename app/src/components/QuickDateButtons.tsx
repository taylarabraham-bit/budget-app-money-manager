import { Button } from '@budget-app/ui';
import { daysFromNow, firstOfNextMonth, todayIso } from '../lib/dates';

interface QuickDateButtonsProps {
  /** Highlights the pick that matches the field's current value; omit for no highlight. */
  value?: string;
  onPick: (iso: string) => void;
  /** Editing a schedule: adds "Skip one". The handler must advance along the anchor, not re-pick. */
  onSkip?: () => void;
  'aria-label'?: string;
}

/**
 * The "Today / In a week / 1st of next month" quick picks that sit under a
 * schedule's date field (bills, paydays, onboarding).
 */
export function QuickDateButtons({ value, onPick, onSkip, 'aria-label': ariaLabel = 'Quick dates' }: QuickDateButtonsProps) {
  // Thunks, not values: the date is computed when the button is CLICKED, so a
  // dialog left open across midnight still inserts the right day. (The
  // highlight compares at render time, which is all a highlight can do.)
  const picks: Array<[string, () => string]> = [
    ['Today', () => todayIso()],
    ['In a week', () => daysFromNow(7)],
    ['1st of next month', () => firstOfNextMonth()],
  ];
  return (
    <div className="bill-form__quick" aria-label={ariaLabel}>
      {picks.map(([label, iso]) => (
        <Button key={label} size="sm" variant={value === iso() ? 'secondary' : 'ghost'} onClick={() => onPick(iso())}>
          {label}
        </Button>
      ))}
      {onSkip && (
        <Button size="sm" variant="ghost" onClick={onSkip}>
          Skip one
        </Button>
      )}
    </div>
  );
}
