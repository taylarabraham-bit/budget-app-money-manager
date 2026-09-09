import { useRef, useState } from 'react';
import { Alert, Button, Card, Dialog, MemberChip, PageHeader, Select, Switch } from '@budget-app/ui';
import { FEATURE_LABEL, backupFilename, buildBackup, parseBackup, transactionsToCsv, type ParsedBackup } from '../../data/backup';
import { STORAGE_KEYS, clearCorruptCopy, hasCorruptCopy } from '../../data/persist';
import { useSettings } from '../../data/settings';
import { useHousehold, type HouseholdData } from '../../data/store';
import { isNativeShell } from '../../data/durable';
import { useAnyRealStore } from '../../data/useAnyRealStore';
import { APP_NAME } from '../../lib/app-name';
import { FileTooLargeError, exportText, readFileText } from '../../lib/download';
import { useSync } from '../../sync';
import { useAccounts } from '../accounts';
import { useBills } from '../bills';
import { useLists } from '../lists';
import { usePaydays } from '../paydays';
import { useQuickAdds } from '../quickadd';
import { useReminders } from '../reminders';
import { useSettlements } from '../settle';
import { currencyOptions } from '../setup/defaults';
import { ImportBackupDialog } from './ImportBackupDialog';
import { SyncCard } from './SyncCard';
import './settings.css';

interface SettingsScreenProps {
  onBack: () => void;
  /** Start the setup wizard in "fresh" mode (wipes this device's data at the end). */
  onStartFresh: () => void;
  /** The Household tab owns name, daily target, members and category limits. */
  onOpenHousehold: () => void;
}

type Notice = { tone: 'success' | 'info' | 'warning' | 'danger'; title: string; body?: string } | null;

function savedLabel(savedAt: string): string {
  const d = new Date(savedAt);
  if (Number.isNaN(d.getTime())) return 'Saved on this device';
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `Saved on this device · today at ${time}` : `Saved on this device · ${d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} at ${time}`;
}

/**
 * Settings - device preferences and the data on this device. Household
 * details (name, target, members, limits) stay on the Household tab; this
 * screen owns appearance, who is using the device, currency and backups.
 */
export function SettingsScreen({ onBack, onStartFresh, onOpenHousehold }: SettingsScreenProps) {
  const store = useHousehold();
  const { household, members, currentMemberId, isSample, savedAt, storageError, setCurrentMember, updateHousehold, hydrate, resetToSample } = store;
  const bills = useBills();
  const settlements = useSettlements();
  const paydays = usePaydays();
  const lists = useLists();
  const quickAdds = useQuickAdds();
  const accounts = useAccounts();
  const reminders = useReminders();
  const sync = useSync();
  // Bound to the household on the server: a reset here is not local (QA SY-16, audit OB-9).
  const synced = !!sync.config && !!sync.householdId;
  const anyRealStore = useAnyRealStore();
  const { theme, setTheme } = useSettings();
  const [notice, setNotice] = useState<Notice>(null);
  const [parsed, setParsed] = useState<ParsedBackup | null>(null);
  const [importing, setImporting] = useState(false);
  const [reading, setReading] = useState(false);
  const [confirm, setConfirm] = useState<'fresh' | 'sample' | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [corrupt, setCorrupt] = useState(() => hasCorruptCopy(STORAGE_KEYS.household));
  const dismissCorrupt = () => {
    clearCorruptCopy(STORAGE_KEYS.household);
    setCorrupt(false);
  };

  const data: HouseholdData = {
    household: store.household,
    members: store.members,
    categories: store.categories,
    transactions: store.transactions,
    goals: store.goals,
    goalContributions: store.goalContributions,
  };

  // On the phone the file goes to the share sheet, so "not ok" means the user
  // backed out of it - nothing was saved, and the notice must not claim otherwise.
  const exportFailed = (): Notice => ({ tone: 'danger', title: "Couldn't export", body: isNativeShell() ? 'Nothing was saved - try again and pick where to put it.' : 'Your browser blocked the download.' });

  const exportBackup = async () => {
    const ok = await exportText(
      backupFilename('backup'),
      JSON.stringify(buildBackup(data, { bills: bills.bills, settlements: settlements.settlements, paydays: paydays.schedules, lists: lists.items, quickAdds: quickAdds.quickAdds, accounts: accounts.accounts, accountTransfers: accounts.transfers }), null, 2),
      'application/json',
    );
    setNotice(ok ? { tone: 'success', title: 'Backup saved', body: 'Keep the file somewhere safe - import it here to restore.' } : exportFailed());
  };

  const exportCsv = async () => {
    const ok = await exportText(backupFilename('transactions'), transactionsToCsv(data, { accounts: accounts.accounts }), 'text/csv;charset=utf-8');
    setNotice(ok ? { tone: 'success', title: 'Purchases exported', body: `${data.transactions.length} rows as CSV - opens in Excel or Google Sheets.` } : exportFailed());
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    try {
      setParsed(parseBackup(await readFileText(file)));
    } catch (e) {
      // The size refusal happens before a byte is read and says how big the file was (audit SEC-7).
      setParsed({ ok: false, reason: e instanceof FileTooLargeError ? e.message : "The file couldn't be read." });
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const confirmImport = () => {
    if (!parsed?.ok) return;
    setImporting(true);
    const { household: h } = parsed.backup;
    const missing = new Set(parsed.summary.missing);
    // Keep this device's identity when that member exists in the backup; only fall back to the first member otherwise (QA UX-1).
    hydrate(
      { household: h.household, members: h.members, categories: h.categories, transactions: h.transactions, goals: h.goals, goalContributions: h.goalContributions },
      { currentMemberId: h.members.some((m) => m.id === currentMemberId) ? currentMemberId : h.members[0]?.id },
    );
    // Only the stores the file actually carries are replaced; an older build's
    // backup without (say) paydays leaves this device's paydays untouched.
    if (!missing.has('bills')) bills.replaceAll(parsed.backup.bills);
    if (!missing.has('settlements')) settlements.replaceAll(parsed.backup.settlements);
    if (!missing.has('paydays')) paydays.replaceAll(parsed.backup.paydays);
    if (!missing.has('lists')) lists.replaceAll(parsed.backup.lists);
    if (!missing.has('quickAdds')) quickAdds.replaceAll(parsed.backup.quickAdds);
    if (!missing.has('accounts')) accounts.replaceAllAccounts(parsed.backup.accounts);
    if (!missing.has('accountTransfers')) accounts.replaceAllTransfers(parsed.backup.accountTransfers);
    setImporting(false);
    setParsed(null);
    const kept = parsed.summary.missing.map((k) => FEATURE_LABEL[k]).join(', ');
    setNotice({
      tone: 'success',
      title: `Imported ${parsed.summary.householdName}`,
      body: `${parsed.summary.transactions} purchases, ${parsed.summary.goals} goals and ${parsed.summary.bills} bills are now on this device.${kept ? ` The backup carried no ${kept}; those were kept as they were.` : ''}`,
    });
  };

  const restoreSample = () => {
    // On a bound device the reset used to wipe every receipt photo and then the
    // sync provider re-adopted the household from the server within seconds:
    // the data came back, the photos did not (audit OB-9). Leave the household
    // first - the server and the partner's phone keep it, this device stops
    // syncing - so the sample really is what stays.
    const left = synced;
    if (left) sync.disconnect();
    resetToSample();
    bills.resetToSample();
    settlements.resetToSample();
    paydays.resetToSample();
    lists.resetToSample();
    quickAdds.resetToSample();
    accounts.resetToSample();
    setConfirm(null);
    setNotice({
      tone: 'info',
      title: 'Sample household restored',
      body: left ? "This device left the household and stopped syncing; your partner's phone keeps everything. Reconnect from Settings → Sync to join it again." : 'Your own data was removed from this device.',
    });
  };

  const enableNotifications = async (on: boolean) => {
    const granted = await reminders.setNotificationsEnabled(on);
    if (on && !granted) setNotice({ tone: 'warning', title: "Notifications weren't allowed", body: 'Allow them for this site in your browser settings, then try again.' });
  };

  const changeCurrency = (code: string) => {
    if (code === household.currency) return;
    updateHousehold({ currency: code });
    setNotice({ tone: 'info', title: `Currency changed to ${code}`, body: 'Existing amounts are not converted - only the symbol changes.' });
  };

  return (
    <div className="bdg-stack settings">
      <PageHeader size="lg" title="Settings" subtitle={household.name} onBack={onBack} backLabel="Back" />

      {corrupt && (
        <Alert tone="warning" title="Couldn't read the data saved on this device" onDismiss={dismissCorrupt}>
          The sample household is showing instead. A copy of the unreadable data was kept as <code>{STORAGE_KEYS.household}.corrupt</code> in this browser's storage. Dismissing this forgets that copy.
        </Alert>
      )}
      {storageError && (
        <Alert
          tone="danger"
          title="Changes aren't being saved"
          action={
            <Button variant="ghost" size="sm" onClick={exportBackup}>
              Export backup
            </Button>
          }
        >
          Storage on this device is full or blocked. Free up space, or export a backup now so nothing is lost.
        </Alert>
      )}
      {notice && (
        <Alert tone={notice.tone} title={notice.title} onDismiss={() => setNotice(null)}>
          {notice.body}
        </Alert>
      )}

      <Card title="Appearance">
        <Switch label="Dark mode" description="Applies on this device only." checked={theme === 'dark'} onCheckedChange={(on) => setTheme(on ? 'dark' : 'light')} />
      </Card>

      <Card title="Reminders" subtitle="The bell in the header always lists what needs attention. Native notifications are optional.">
        <div className="bdg-stack bdg-gap-2">
          <Switch
            label="Notify me about bills due today, paydays and purchases to confirm"
            description={reminders.notificationPermission === 'unsupported' ? 'Not supported in this browser.' : 'Only while the app is open - on the phone as in a browser, nothing is delivered in the background yet.'}
            checked={reminders.notificationsEnabled}
            disabled={reminders.notificationPermission === 'unsupported'}
            onCheckedChange={(on) => void enableNotifications(on)}
          />
          {reminders.notificationPermission === 'denied' && <Alert tone="warning">Notifications are blocked in your browser settings for this site.</Alert>}
        </div>
      </Card>

      <Card title="Using this device" subtitle="Pick who is using this device. New purchases default to you.">
        <div className="bdg-row bdg-wrap bdg-gap-2" role="group" aria-label="Who is using this device">
          {members.map((m) => (
            <MemberChip key={m.id} name={m.name} color={m.color} meta={m.role} selected={m.id === currentMemberId} onSelect={() => setCurrentMember(m.id)} />
          ))}
        </div>
      </Card>

      <Card
        title="Household"
        actions={
          <Button variant="ghost" size="sm" onClick={onOpenHousehold}>
            Manage
          </Button>
        }
      >
        <div className="bdg-stack bdg-gap-3">
          <Select label="Currency" options={currencyOptions(household.currency)} value={household.currency} onChange={(e) => changeCurrency(e.target.value)} fullWidth />
          <p className="bdg-text-sm bdg-text-muted settings__hint">Name, daily earning target, members and category limits live on the Household tab.</p>
        </div>
      </Card>

      <Card title="Your data" subtitle={isSample ? 'Showing the sample household - nothing is saved until you change something.' : savedAt ? savedLabel(savedAt) : 'Saved on this device'}>
        <div className="bdg-stack bdg-gap-3">
          <div className="settings__actions">
            <Button variant="secondary" onClick={exportBackup}>
              Export backup (JSON)
            </Button>
            <Button variant="secondary" onClick={exportCsv}>
              Export purchases (CSV)
            </Button>
            <Button variant="secondary" loading={reading} onClick={() => fileInput.current?.click()}>
              Import backup…
            </Button>
            <input ref={fileInput} className="settings__file" type="file" accept=".json,application/json" aria-label="Choose a backup file" onChange={(e) => void pickFile(e.target.files?.[0])} />
          </div>
          <p className="bdg-text-xs bdg-text-muted settings__hint">Receipt photos stay on this device and are not included in backups.</p>
          <div className="settings__danger">
            <Button variant="ghost" onClick={() => setConfirm('fresh')}>
              Start fresh
            </Button>
            {anyRealStore && (
              // The same test App's setup mode uses, accounts included (audit UI-14): whenever
              // Finish would wipe, there is a way back to the sample.
              <Button variant="ghost" onClick={() => setConfirm('sample')}>
                Restore the sample household
              </Button>
            )}
          </div>
        </div>
      </Card>

      <SyncCard />

      <p className="bdg-text-xs bdg-text-subtle settings__footer">{APP_NAME} · your data lives on this device and syncs through your home server when connected</p>

      <ImportBackupDialog parsed={parsed} onClose={() => setParsed(null)} onConfirm={confirmImport} busy={importing} />

      <Dialog
        open={confirm === 'fresh'}
        onClose={() => setConfirm(null)}
        size="sm"
        title="Start fresh?"
        description={
          isSample
            ? 'Set up your own household. The sample disappears once you finish.'
            : `This removes ${data.transactions.length} purchases, ${data.goals.length} goals, ${bills.bills.length} bills and ${members.length} members from this device at the end of setup${synced ? " - and, because this household syncs, from your partner's phone too" : ''}.`
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant={isSample ? 'primary' : 'danger'}
              onClick={() => {
                setConfirm(null);
                onStartFresh();
              }}
            >
              {isSample ? 'Set up my household' : 'Delete & set up'}
            </Button>
          </>
        }
      >
        {!isSample && <Alert tone="warning">Export a backup first if you might want this data back.</Alert>}
      </Dialog>

      <Dialog
        open={confirm === 'sample'}
        onClose={() => setConfirm(null)}
        size="sm"
        title="Restore the sample household?"
        description={
          synced
            ? "This device leaves the household first: it stops syncing, and the household stays on your home server and your partner's phone. Then your own purchases, goals, bills and members are removed from this device and the demo family comes back."
            : 'Your own purchases, goals, bills and members are removed from this device and the demo family comes back.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Keep my data
            </Button>
            <Button variant="danger" onClick={restoreSample}>
              Restore sample
            </Button>
          </>
        }
      >
        {synced && sync.pending > 0 && (
          <Alert tone="warning">
            {sync.pending} {sync.pending === 1 ? 'change' : 'changes'} from this device {sync.pending === 1 ? "hasn't" : "haven't"} reached the server yet and would be lost. Sync first if they matter.
          </Alert>
        )}
      </Dialog>
    </div>
  );
}
