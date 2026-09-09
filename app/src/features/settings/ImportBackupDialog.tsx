import { Alert, Button, Dialog } from '@budget-app/ui';
import { FEATURE_LABEL, type ParsedBackup } from '../../data/backup';
import { useSync } from '../../sync';

interface ImportBackupDialogProps {
  parsed: ParsedBackup | null;
  onClose: () => void;
  /** Replace everything on this device with the backup. */
  onConfirm: () => void;
  busy?: boolean;
}

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'unknown date' : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Confirms a backup import with a summary of what it contains, or explains why the file cannot be used. */
export function ImportBackupDialog({ parsed, onClose, onConfirm, busy = false }: ImportBackupDialogProps) {
  const sync = useSync();
  if (!parsed) return null;

  if (!parsed.ok) {
    return (
      <Dialog
        open
        onClose={onClose}
        size="sm"
        title="Couldn't read that backup"
        footer={<Button onClick={onClose}>Close</Button>}
      >
        <Alert tone="danger">{parsed.reason}</Alert>
      </Dialog>
    );
  }

  // A bound household is mirrored: the import is a wholesale replace here, and the
  // sync watcher pushes every changed row and a tombstone for every row missing from
  // the file - the partner's month of purchases disappears from their phone on the
  // next pull (audit OB-6 / SYN-8). Say so, and never import over unsent changes:
  // they would be thrown away by the same diff.
  const synced = !!sync.config && !!sync.householdId;
  const unsent = synced ? sync.pending : 0;
  const s = parsed.summary;
  return (
    <Dialog
      open
      onClose={busy ? undefined : onClose}
      size="sm"
      title="Replace your data with this backup?"
      description={`${s.householdName} · ${s.members} member${s.members === 1 ? '' : 's'} · ${s.transactions} purchase${s.transactions === 1 ? '' : 's'} · ${s.goals} goal${s.goals === 1 ? '' : 's'} · ${s.bills} bill${s.bills === 1 ? '' : 's'} · exported ${when(s.exportedAt)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={busy} disabled={unsent > 0}>
            Replace
          </Button>
        </>
      }
    >
      {synced ? (
        <Alert tone="warning" title="This replaces the household on both phones">
          This household syncs, so the file's purchases, goals, bills and members replace what is there now on your partner's phone too - not just this one. Anything logged since the backup was made is deleted on both. This cannot be undone.
        </Alert>
      ) : (
        <Alert tone="warning">Everything currently on this device - purchases, goals, bills and members - is replaced. This cannot be undone.</Alert>
      )}
      {unsent > 0 && (
        <Alert
          tone="danger"
          title={`${unsent} ${unsent === 1 ? 'change' : 'changes'} from this device ${unsent === 1 ? "hasn't" : "haven't"} reached the server yet`}
          action={
            <Button variant="ghost" size="sm" onClick={() => void sync.syncNow()} loading={sync.status === 'syncing' || sync.status === 'connecting'}>
              Sync now
            </Button>
          }
        >
          Importing now would throw them away. Sync first, with the laptop reachable, then import.
        </Alert>
      )}
      {s.missing.length > 0 && (
        <Alert tone="info" title="This backup is from an older version of the app">
          It carries no {s.missing.map((k) => FEATURE_LABEL[k]).join(', ')} - what this device has for those stays as it is.
        </Alert>
      )}
    </Dialog>
  );
}
