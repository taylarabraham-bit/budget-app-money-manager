import { useMemo, useState } from 'react';
import { Alert, Button, Card, Switch, Tabs, TextField } from '@budget-app/ui';
import { firstName, resolveDefaultWeights } from '../../data/split';
import { useHousehold } from '../../data/store';
import type { DefaultSplit } from '../../data/types';
import { incomeRatio, usePaydays } from '../paydays';
import './settle.css';

type Mode = 'equal' | 'ratio';

/** Percentages (0-100) per member from a default split, normalised over the current members. */
function percentagesOf(split: DefaultSplit | undefined, memberIds: string[]): Record<string, number> {
  const weights = resolveDefaultWeights({ defaultSplit: split }, memberIds.map((id) => ({ id })));
  const total = weights.reduce((acc, w) => acc + w.weight, 0) || 1;
  const out: Record<string, number> = {};
  for (const w of weights) out[w.memberId] = Math.round((w.weight / total) * 100);
  return out;
}

/**
 * How shared purchases are divided by default (equal, or a custom percentage
 * per member) and whether the other person has to confirm shared purchases.
 * Lives on the Household screen.
 */
export function SplitSettingsCard() {
  const { household, members, updateHousehold } = useHousehold();
  const { schedules } = usePaydays();
  const memberIds = useMemo(() => members.map((m) => m.id), [members]);
  // "Match income": the ratio of expected monthly pay, when paydays are set up for more than one person.
  const byIncome = useMemo(() => {
    const ratio = incomeRatio(schedules, members);
    return Object.keys(ratio).length > 1 ? ratio : null;
  }, [schedules, members]);
  const mode: Mode = household.defaultSplit?.mode === 'ratio' ? 'ratio' : 'equal';
  const saved = useMemo(() => percentagesOf(household.defaultSplit, memberIds), [household.defaultSplit, memberIds]);
  const [draft, setDraft] = useState<Record<string, number> | null>(null);
  const percentages = draft ?? saved;
  const sum = memberIds.reduce((acc, id) => acc + (percentages[id] ?? 0), 0);
  const sumError = mode === 'ratio' && draft && sum !== 100 ? `Adds up to ${sum}% - it needs to be 100%` : undefined;
  const zeroMembers = mode === 'ratio' ? members.filter((m) => (saved[m.id] ?? 0) === 0) : [];

  const setMode = (next: string) => {
    setDraft(null);
    if (next === 'equal') updateHousehold({ defaultSplit: { mode: 'equal' } });
    else updateHousehold({ defaultSplit: { mode: 'ratio', shares: Object.fromEntries(memberIds.map((id) => [id, (saved[id] ?? 0) / 100])) } });
  };

  const edit = (id: string, value: string) => {
    const n = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    setDraft((prev) => {
      const next = { ...(prev ?? saved), [id]: n };
      // Two people: the other side balances automatically.
      if (memberIds.length === 2) {
        const otherId = memberIds.find((m) => m !== id)!;
        next[otherId] = 100 - n;
      }
      return next;
    });
  };

  const save = () => {
    if (!draft || sum !== 100) return;
    updateHousehold({ defaultSplit: { mode: 'ratio', shares: Object.fromEntries(memberIds.map((id) => [id, (draft[id] ?? 0) / 100])) } });
    setDraft(null);
  };

  return (
    <Card title="Sharing" subtitle="How shared purchases are divided unless you customise one.">
      <div className="bdg-stack bdg-gap-3">
        <Tabs
          variant="segmented"
          fullWidth
          aria-label="Default split"
          value={mode}
          onChange={setMode}
          items={[
            { value: 'equal', label: members.length === 2 ? 'Half each' : 'Equal' },
            { value: 'ratio', label: 'Custom %' },
          ]}
        />
        {mode === 'ratio' && (
          <div className="bdg-stack bdg-gap-2">
            <div className="split-settings__grid">
              {members.map((m) => (
                <TextField key={m.id} label={firstName(m.name)} type="number" suffix="%" value={String(percentages[m.id] ?? 0)} onChange={(e) => edit(m.id, e.target.value)} fullWidth />
              ))}
            </div>
            {sumError && <span className="bdg-text-sm bdg-text-negative">{sumError}</span>}
            {byIncome && !draft && (
              <div className="bdg-row bdg-gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    // Largest-remainder rounding to whole percents so they add up to 100.
                    const raw = memberIds.map((id) => (byIncome[id] ?? 0) * 100);
                    const floors = raw.map(Math.floor);
                    let left = 100 - floors.reduce((a, b) => a + b, 0);
                    const order = raw.map((v, i) => ({ i, rem: v - floors[i]! })).sort((a, b) => b.rem - a.rem);
                    for (const o of order) {
                      if (left <= 0) break;
                      floors[o.i]! += 1;
                      left -= 1;
                    }
                    setDraft(Object.fromEntries(memberIds.map((id, i) => [id, floors[i]!])));
                  }}
                >
                  Match income ({memberIds.map((id) => `${Math.round((byIncome[id] ?? 0) * 100)}%`).join(' / ')})
                </Button>
              </div>
            )}
            {draft && (
              <div className="bdg-row bdg-gap-2">
                <Button size="sm" onClick={save} disabled={sum !== 100}>
                  Save split
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
              </div>
            )}
            {!draft && zeroMembers.length > 0 && (
              <Alert tone="warning">{zeroMembers.map((m) => firstName(m.name)).join(' and ')} at 0% never owes anything on shared purchases.</Alert>
            )}
          </div>
        )}
        <Switch
          label="Confirm shared purchases"
          description="Each of you confirms purchases the other logs as shared before they count towards what you owe."
          checked={!!household.requireApproval}
          onCheckedChange={(on) => updateHousehold({ requireApproval: on })}
        />
      </div>
    </Card>
  );
}
