import { Alert, Button } from '@budget-app/ui';
import { useReminders } from './store';
import type { ReminderTarget } from './types';

interface ReminderAlertProps {
  onNavigate: (target: ReminderTarget) => void;
}

/** The single Alert at the top of Overview: only the most urgent reminder (the design guide allows one per screen). */
export function ReminderAlert({ onNavigate }: ReminderAlertProps) {
  const { top, count, dismiss, openDialog } = useReminders();
  if (!top) return null;
  const more = count - 1;
  return (
    <Alert
      tone={top.tone}
      title={top.title}
      onDismiss={() => dismiss(top.id)}
      action={
        <div className="bdg-row bdg-gap-2">
          {more > 0 && (
            <Button variant="ghost" size="sm" onClick={openDialog}>
              {more} more
            </Button>
          )}
          {top.action && (
            <Button variant="ghost" size="sm" onClick={() => onNavigate(top.action!.target)}>
              {top.action.label}
            </Button>
          )}
        </div>
      }
    >
      {top.body}
    </Alert>
  );
}
