import { useState } from 'react';
import { Alert, Badge, Button, Card, Dialog, TextField } from '@budget-app/ui';
import { isServerUrl, useSync } from '../../sync';
import type { SyncStatus } from '../../sync';

// Settings → "Sync between devices": where the home server's URL and anon key
// are entered, what the sync is doing, and the first-connection choice when
// both the device and the server already hold a household.

function lastSyncLabel(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const STATUS_TEXT: Record<SyncStatus, string> = {
  off: 'Not connected',
  connecting: 'Connecting…',
  online: 'Connected',
  syncing: 'Syncing…',
  offline: 'Server not reachable',
  'needs-choice': 'Needs a decision',
  error: 'Problem',
};

const statusTone = (s: SyncStatus): 'neutral' | 'positive' | 'warning' | 'negative' | 'info' =>
  s === 'online' ? 'positive' : s === 'syncing' || s === 'connecting' ? 'info' : s === 'offline' || s === 'needs-choice' ? 'warning' : s === 'error' ? 'negative' : 'neutral';

const changes = (n: number) => `${n} ${n === 1 ? 'change' : 'changes'}`;

export function SyncCard() {
  const sync = useSync();
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const urlError = submitted && !isServerUrl(url) ? 'Enter the server URL, like https://laptop.tail1234.ts.net' : undefined;
  const keyError = submitted && key.trim().length < 20 ? 'Paste the anon key from the server' : undefined;

  const connect = async () => {
    setSubmitted(true);
    setConnectError(null);
    if (!isServerUrl(url) || key.trim().length < 20) return;
    setBusy(true);
    try {
      await sync.connect({ url: url.trim(), anonKey: key.trim() });
      setUrl('');
      setKey('');
      setSubmitted(false);
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Unsent changes survive a disconnect now, but the person tapping it deserves
  // to know they exist - the count sat on the card, not on the button (audit SYN-5).
  const disconnect = () => {
    if (sync.pending > 0) setConfirmDisconnect(true);
    else sync.disconnect();
  };

  const last = lastSyncLabel(sync.lastSyncedAt);
  const subtitle = !sync.config
    ? 'Keep this device and the other phone on the same numbers through the Supabase on your home laptop.'
    : sync.status === 'online' && last
      ? `Connected · last synced ${last}`
      : sync.status === 'offline'
        ? `${STATUS_TEXT.offline}${sync.pending ? ` · ${changes(sync.pending)} waiting` : ' · will retry'}`
        : STATUS_TEXT[sync.status];

  return (
    <Card
      title="Sync between devices"
      subtitle={subtitle}
      actions={
        sync.config ? (
          <Badge tone={statusTone(sync.status)} dot>
            {STATUS_TEXT[sync.status]}
          </Badge>
        ) : undefined
      }
    >
      <div className="bdg-stack bdg-gap-3">
        {!sync.config ? (
          <>
            <TextField
              label="Server URL"
              placeholder="https://laptop.tail1234.ts.net"
              type="url"
              autoComplete="off"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              error={urlError}
              hint="The laptop's Tailscale address and Supabase port."
              fullWidth
            />
            <TextField
              label="Anon key"
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              error={keyError}
              hint="From the server's .env (ANON_KEY). It stays on this device."
              fullWidth
            />
            {connectError && (
              <Alert tone="danger" title="Couldn't connect">
                {connectError}
              </Alert>
            )}
            <div>
              <Button onClick={connect} loading={busy}>
                Connect
              </Button>
            </div>
            <p className="bdg-text-xs bdg-text-muted" style={{ margin: 0 }}>
              Only devices on your Tailscale network can reach the server, so there is no sign-in. Setup steps for the laptop are in the project's supabase/README.md.
            </p>
            {sync.pending > 0 && (
              <p className="bdg-text-xs bdg-text-muted" style={{ margin: 0 }}>
                {changes(sync.pending)} made while disconnected will go through once this device reconnects to the same household.
              </p>
            )}
          </>
        ) : (
          <>
            {sync.status === 'needs-choice' && sync.serverHousehold && (
              <Alert tone="warning" title={`The server already has a household: ${sync.serverHousehold.name}`}>
                <div className="bdg-stack bdg-gap-2">
                  <span>This device has its own data too. Pick which one the household keeps - the other is replaced.</span>
                  <div className="bdg-row bdg-wrap bdg-gap-2">
                    {/* A failed choice keeps needs-choice (retry stays possible) and reports here (QA SY-9). */}
                    <Button size="sm" onClick={() => sync.adoptServer().catch((e: unknown) => setConnectError(e instanceof Error ? e.message : String(e)))}>
                      Use the server's data
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => sync.uploadLocal().catch((e: unknown) => setConnectError(e instanceof Error ? e.message : String(e)))}>
                      Upload this device's data
                    </Button>
                  </div>
                  {connectError && (
                    <Alert tone="danger" title="That didn't work">
                      {connectError}
                    </Alert>
                  )}
                </div>
              </Alert>
            )}
            {sync.status === 'error' && sync.error && (
              <Alert tone="danger" title="Sync stopped">
                {sync.error}
              </Alert>
            )}
            {sync.status === 'offline' && (
              <Alert tone="warning" title="Server not reachable">
                {`Check that this device is on Tailscale and the laptop is awake. ${sync.pending ? `${sync.pending} ${sync.pending === 1 ? 'change is' : 'changes are'} waiting to go through.` : 'Nothing is lost - changes queue up until it is back.'}`}
              </Alert>
            )}
            {sync.rejected > 0 && (
              // Rows the server refused outright are parked instead of blocking the queue (audit SEC-4).
              <Alert tone="warning" title={`${changes(sync.rejected)} couldn't be sent`}>
                <div className="bdg-stack bdg-gap-2">
                  <span>
                    The server refused {sync.rejected === 1 ? 'it' : 'them'} - usually a character it cannot store. Everything else keeps syncing. Try again after fixing the entry, or discard to keep the server's version.
                  </span>
                  <div className="bdg-row bdg-wrap bdg-gap-2">
                    <Button size="sm" onClick={sync.retryRejected}>
                      Try again
                    </Button>
                    <Button size="sm" variant="secondary" onClick={sync.discardRejected}>
                      Discard
                    </Button>
                  </div>
                </div>
              </Alert>
            )}
            {sync.clockSkewMinutes !== undefined && (
              <Alert tone="warning" title={`This device's clock is about ${Math.abs(sync.clockSkewMinutes)} minutes ${sync.clockSkewMinutes > 0 ? 'ahead of' : 'behind'} the server's`}>
                Changes made here are stamped with the server's time meanwhile, so they still line up with the other phone's. Turn on automatic date &amp; time on this device.
              </Alert>
            )}
            <div className="bdg-stack bdg-gap-1 bdg-text-sm">
              <div className="bdg-row-between">
                <span className="bdg-text-muted">Server</span>
                <span className="bdg-truncate" style={{ maxWidth: '70%' }}>
                  {sync.config.url}
                </span>
              </div>
              <div className="bdg-row-between">
                <span className="bdg-text-muted">Household</span>
                <span>{sync.householdId ?? '—'}</span>
              </div>
              <div className="bdg-row-between">
                <span className="bdg-text-muted">Waiting to send</span>
                <span>{sync.pending === 0 ? 'Nothing' : changes(sync.pending)}</span>
              </div>
            </div>
            <div className="bdg-row bdg-wrap bdg-gap-2">
              <Button size="sm" variant="secondary" onClick={() => void sync.syncNow()} loading={sync.status === 'syncing' || sync.status === 'connecting'} disabled={sync.status === 'needs-choice'}>
                Sync now
              </Button>
              <Button size="sm" variant="ghost" onClick={disconnect}>
                Disconnect
              </Button>
            </div>
            <Dialog
              open={confirmDisconnect}
              onClose={() => setConfirmDisconnect(false)}
              title="Disconnect with changes waiting?"
              size="sm"
              footer={
                <>
                  <Button variant="secondary" onClick={() => setConfirmDisconnect(false)}>
                    Keep syncing
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      setConfirmDisconnect(false);
                      sync.disconnect();
                    }}
                  >
                    Disconnect
                  </Button>
                </>
              }
            >
              <p style={{ margin: 0 }}>
                {changes(sync.pending)} {sync.pending === 1 ? "hasn't" : "haven't"} reached the server yet. {sync.pending === 1 ? 'It stays' : 'They stay'} on this device and {sync.pending === 1 ? 'goes' : 'go'} through the next time it connects to the same household.
              </p>
            </Dialog>
          </>
        )}
      </div>
    </Card>
  );
}
