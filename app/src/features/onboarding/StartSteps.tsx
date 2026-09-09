import { useState } from 'react';
import { Alert, Button, TextField } from '@budget-app/ui';
import { isServerUrl, useSync, type ServerHousehold } from '../../sync';

// The first screen (new household or join the partner's) and the join flow.

interface StartStepProps {
  onNew: () => void;
  onJoin: () => void;
}

export function StartStep({ onNew, onJoin }: StartStepProps) {
  return (
    <div className="onboarding__choices">
      <button type="button" className="onboarding__choice" onClick={onNew}>
        <span className="onboarding__choice-icon" aria-hidden="true">
          🏡
        </span>
        <span className="onboarding__choice-title">Set up a new household</span>
        <span className="onboarding__choice-text bdg-text-sm bdg-text-muted">You're the first one here. A few minutes: the two of you, paydays, bills, budgets.</span>
      </button>
      <button type="button" className="onboarding__choice" onClick={onJoin}>
        <span className="onboarding__choice-icon" aria-hidden="true">
          🤝
        </span>
        <span className="onboarding__choice-title">Join your partner's household</span>
        <span className="onboarding__choice-text bdg-text-sm bdg-text-muted">They've already set it up. Connect to your home server and everything comes across.</span>
      </button>
    </div>
  );
}

/** Network failures arrive as bare fetch errors; say what to check instead. */
function readable(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return "Couldn't reach the server. Check the address, that this phone is on Tailscale, and that the laptop is awake.";
  }
  return message.replace(/^TypeError:\s*/, '');
}

interface JoinStepProps {
  /** The server had no household yet: stay connected and set one up on this device (Finish uploads it). */
  onServerEmpty: () => void;
  /** Joined: the household is on this device now. */
  onJoined: (household: ServerHousehold) => void;
}

export function JoinStep({ onServerEmpty, onJoined }: JoinStepProps) {
  const sync = useSync();
  const [url, setUrl] = useState(sync.config?.url ?? '');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<ServerHousehold | null>(null);
  const urlError = submitted && !isServerUrl(url) ? 'Enter the server URL, like https://laptop.tail1234.ts.net' : undefined;
  const keyError = submitted && key.trim().length < 20 ? 'Paste the anon key from the server' : undefined;

  const connect = async () => {
    setSubmitted(true);
    setError(null);
    if (!isServerUrl(url) || key.trim().length < 20) return;
    setBusy(true);
    try {
      const result = await sync.connect({ url: url.trim(), anonKey: key.trim() });
      switch (result.outcome) {
        case 'joined':
          onJoined(result.household);
          break;
        case 'empty':
          onServerEmpty();
          break;
        case 'needs-choice':
          // This device already has real data (re-running setup) and the server holds a different household.
          setChoice(result.household);
          break;
        default:
          // uploaded / merged / reconnected: this device's data is the household now - nothing to join.
          setError("This device already holds the household, so there was nothing to join. It's connected and syncing; carry on from Settings.");
      }
    } catch (e) {
      setError(readable(e));
    } finally {
      setBusy(false);
    }
  };

  const adopt = async () => {
    if (!choice) return;
    setBusy(true);
    try {
      await sync.adoptServer();
      onJoined(choice);
    } catch (e) {
      setError(readable(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bdg-stack bdg-gap-4">
      <p className="onboarding__p bdg-text-sm bdg-text-muted">Your partner's phone and this one share one household through the Supabase on your home laptop. Only devices on your Tailscale network can reach it, so there's no sign-in.</p>
      <TextField label="Server URL" placeholder="https://laptop.tail1234.ts.net" type="url" autoComplete="off" value={url} onChange={(e) => setUrl(e.target.value)} error={urlError} hint="The laptop's Tailscale HTTPS address (tailscale serve). Inside the app it must be https://." fullWidth autoFocus />
      <TextField label="Anon key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} error={keyError} hint="From the server's .env (ANON_KEY). It stays on this device." fullWidth />
      {error && (
        <Alert tone="danger" title="Couldn't join">
          {error}
        </Alert>
      )}
      {choice && (
        <Alert tone="warning" title={`The server has "${choice.name}" and this device has its own data`}>
          <div className="bdg-stack bdg-gap-2">
            <span>Joining replaces what is on this device with the household on the server.</span>
            <div className="bdg-row bdg-wrap bdg-gap-2">
              <Button size="sm" onClick={() => void adopt()} loading={busy}>
                Join {choice.name}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  sync.disconnect();
                  setChoice(null);
                }}
              >
                Keep this device's data
              </Button>
            </div>
          </div>
        </Alert>
      )}
      {!choice && (
        <div>
          <Button size="lg" onClick={() => void connect()} loading={busy}>
            Connect and join
          </Button>
        </div>
      )}
    </div>
  );
}
