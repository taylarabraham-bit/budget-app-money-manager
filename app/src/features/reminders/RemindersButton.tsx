import { Badge, Button } from '@budget-app/ui';
import { useReminders } from './store';
import './reminders.css';

const BellIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

/** The bell in every top-level header: opens the reminders sheet, with a count of what is outstanding. */
export function RemindersButton() {
  const { count, top, openDialog } = useReminders();
  const tone = top?.tone === 'danger' ? 'negative' : top?.tone === 'warning' ? 'warning' : 'info';
  return (
    <span className="reminders-button">
      <Button variant="ghost" size="sm" aria-label={count > 0 ? `Reminders, ${count} open` : 'Reminders'} title="Reminders" onClick={openDialog} iconStart={<BellIcon />}>
        <span className="bdg-sr-only">Reminders</span>
      </Button>
      {count > 0 && (
        <span className="reminders-button__count" aria-hidden="true">
          <Badge tone={tone} variant="solid" size="sm">
            {count}
          </Badge>
        </span>
      )}
    </span>
  );
}
