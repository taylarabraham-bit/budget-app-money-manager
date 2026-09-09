import { useState } from 'react';
import { Button, Dialog, EmptyState } from '@budget-app/ui';
import { useReminders } from './store';
import { PRIORITY_TITLE, type Reminder, type ReminderPriority, type ReminderTarget } from './types';
import './reminders.css';

interface RemindersDialogProps {
  /** Acts on a reminder: go to a screen, or open the log dialog. */
  onNavigate: (target: ReminderTarget) => void;
}

function Row({ reminder, dismissed, onAct, onDismiss, onRestore }: { reminder: Reminder; dismissed: boolean; onAct: () => void; onDismiss: () => void; onRestore: () => void }) {
  return (
    <div className={`reminder-row reminder-row--${reminder.tone}${dismissed ? ' reminder-row--dismissed' : ''}`}>
      <span className="reminder-row__icon" aria-hidden="true">
        {reminder.icon}
      </span>
      <div className="reminder-row__body">
        <div className="reminder-row__title">{reminder.title}</div>
        <div className="reminder-row__text bdg-text-sm bdg-text-muted">{reminder.body}</div>
      </div>
      <div className="reminder-row__actions">
        {dismissed ? (
          <Button size="sm" variant="ghost" onClick={onRestore}>
            Restore
          </Button>
        ) : (
          <>
            {reminder.action && (
              <Button size="sm" variant="secondary" onClick={onAct}>
                {reminder.action.label}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onDismiss} aria-label={`Dismiss ${reminder.title}`}>
              Dismiss
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** Everything that needs attention, grouped by urgency, with a dismissed section that can be restored. */
export function RemindersDialog({ onNavigate }: RemindersDialogProps) {
  const { reminders, all, dismissedIds, count, dismiss, dismissAll, restore, dialogOpen, closeDialog } = useReminders();
  const [showDismissed, setShowDismissed] = useState(false);
  const dismissed = all.filter((r) => dismissedIds.has(r.id));
  const groups = ([1, 2, 3] as ReminderPriority[]).map((p) => ({ priority: p, title: PRIORITY_TITLE[p], items: reminders.filter((r) => r.priority === p) })).filter((g) => g.items.length > 0);

  const act = (r: Reminder) => {
    if (!r.action) return;
    closeDialog();
    onNavigate(r.action.target);
  };

  return (
    <Dialog
      open={dialogOpen}
      onClose={closeDialog}
      title="Reminders"
      description={count > 0 ? `${count} need${count === 1 ? 's' : ''} attention` : 'Nothing outstanding'}
      footer={
        <>
          {count > 0 && (
            <Button variant="secondary" onClick={dismissAll}>
              Dismiss all
            </Button>
          )}
          <Button onClick={closeDialog}>Close</Button>
        </>
      }
    >
      <div className="bdg-stack">
        {groups.length === 0 && <EmptyState compact icon="🔔" title="All clear" description="Nothing needs your attention right now." />}
        {groups.map((g) => (
          <section key={g.priority} className="bdg-stack bdg-gap-2" aria-label={g.title}>
            <h3 className="bdg-section-title">{g.title}</h3>
            <div className="reminder-list">
              {g.items.map((r) => (
                <Row key={r.id} reminder={r} dismissed={false} onAct={() => act(r)} onDismiss={() => dismiss(r.id)} onRestore={() => restore(r.id)} />
              ))}
            </div>
          </section>
        ))}
        {dismissed.length > 0 && (
          <div className="bdg-stack bdg-gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowDismissed((s) => !s)}>
              {showDismissed ? 'Hide dismissed' : `Show ${dismissed.length} dismissed`}
            </Button>
            {showDismissed && (
              <div className="reminder-list">
                {dismissed.map((r) => (
                  <Row key={r.id} reminder={r} dismissed onAct={() => act(r)} onDismiss={() => dismiss(r.id)} onRestore={() => restore(r.id)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
