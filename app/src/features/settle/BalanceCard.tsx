import { useMemo, useState } from 'react';
import { Alert, Amount, Badge, Button, Card, EmptyState, formatMoneyAuto } from '@budget-app/ui';
import { firstName } from '../../data/split';
import { useHousehold } from '../../data/store';
import { dateOnly, formatShortDate } from '../../lib/dates';
import { useToday } from '../../lib/useToday';
import { balanceSentence, selectBalances } from './selectors';
import { useSettlements } from './store';
import { SettleUpDialog } from './SettleUpDialog';
import './settle.css';

interface BalanceCardProps {
  onOpenHistory: () => void;
}

/**
 * "Sam owes you $42.10" - the running balance of shared purchases and
 * payments between the signed-in member and their partner, with Settle up
 * and a one-tap "Mark as settled". Derived from current data, so it
 * self-corrects when a purchase is edited or deleted.
 */
export function BalanceCard({ onOpenHistory }: BalanceCardProps) {
  const state = useHousehold();
  const { household, members, currentMemberId } = state;
  const { settlements, addSettlement, removeSettlement } = useSettlements();
  const now = useToday(); // "shared this month" must roll over at midnight even on a screen left open (QA MF-6)
  const data = useMemo(() => selectBalances(state, settlements, now), [state, settlements, now]);
  const [settleOpen, setSettleOpen] = useState(false);
  const [notice, setNotice] = useState<{ text: string; undoId?: string } | null>(null);
  const currency = household.currency;
  const me = members.find((m) => m.id === currentMemberId);
  const { mine } = data;
  const other = mine.with;
  const pairNetValue = other ? mine.breakdown.find((b) => b.member.id === other.id)?.net ?? 0 : 0;
  const otherName = other ? firstName(other.name) : 'your partner';
  const title = members.length === 2 && other ? `Between you and ${otherName}` : 'Settle up';

  const markSettled = () => {
    if (!me || !other || pairNetValue === 0) return;
    const s = addSettlement({ fromMemberId: pairNetValue < 0 ? me.id : other.id, toMemberId: pairNetValue < 0 ? other.id : me.id, amount: Math.abs(pairNetValue), method: 'other', note: 'Marked as settled' });
    if (s) setNotice({ text: `Marked as settled - ${formatMoneyAuto(s.amount, { currency })} recorded.`, undoId: s.id });
  };

  return (
    <Card
      title={title}
      actions={
        <Button variant="ghost" size="sm" onClick={onOpenHistory}>
          History
        </Button>
      }
    >
      {!data.hasAny ? (
        <EmptyState compact icon="🤝" title="Nothing to split yet" description={`Tick "Split with ${otherName}" when you log a purchase and we'll keep score here.`} />
      ) : (
        <div className="bdg-stack bdg-gap-3">
          {notice && (
            <Alert
              tone="success"
              onDismiss={() => setNotice(null)}
              action={
                notice.undoId ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      removeSettlement(notice.undoId!);
                      setNotice(null);
                    }}
                  >
                    Undo
                  </Button>
                ) : undefined
              }
            >
              {notice.text}
            </Alert>
          )}
          <div className="balance-card__hero">
            <Amount value={mine.amount} currency={currency} size="xl" weight="bold" tone={mine.status === 'owed' ? 'positive' : mine.status === 'owes' ? 'negative' : 'neutral'} />
            <span className="balance-card__sentence">
              {members.length > 2
                ? // The hero is the net across EVERYONE - naming one member here would pair
                  // the wrong number with their name; the per-member lines below carry the names.
                  mine.status === 'owed'
                  ? 'owed to you overall'
                  : mine.status === 'owes'
                    ? 'you owe overall'
                    : 'All square'
                : balanceSentence(mine.status === 'owed' ? 1 : mine.status === 'owes' ? -1 : 0, otherName)}
            </span>
          </div>
          {members.length > 2 && mine.breakdown.filter((b) => b.net !== 0).length > 0 && (
            <div className="balance-card__breakdown">
              {mine.breakdown
                .filter((b) => b.net !== 0)
                .map((b) => (
                  <span key={b.member.id}>
                    {balanceSentence(b.net, firstName(b.member.name))} {formatMoneyAuto(Math.abs(b.net), { currency })}
                  </span>
                ))}
            </div>
          )}
          <div className="balance-card__meta">
            <span>
              {data.sharedCountThisMonth} shared purchase{data.sharedCountThisMonth === 1 ? '' : 's'} this month · {formatMoneyAuto(data.sharedThisMonth, { currency })}
            </span>
            {data.lastSettlement && <span>Last settled {formatShortDate(dateOnly(data.lastSettlement.date))}</span>}
            {mine.awaiting !== 0 && (
              <Badge tone="warning" size="sm">
                {formatMoneyAuto(Math.abs(mine.awaiting), { currency })} awaiting confirmation
              </Badge>
            )}
          </div>
          <div className="balance-card__actions">
            <Button size="sm" onClick={() => setSettleOpen(true)} disabled={!other || !me}>
              Settle up
            </Button>
            <Button size="sm" variant="ghost" onClick={markSettled} disabled={!other || !me || pairNetValue === 0}>
              Mark as settled
            </Button>
          </div>
        </div>
      )}
      {me && other && (
        <SettleUpDialog
          open={settleOpen}
          me={me}
          other={other}
          net={pairNetValue}
          currency={currency}
          onClose={() => setSettleOpen(false)}
          onSubmit={(input) => {
            const s = addSettlement(input);
            setSettleOpen(false);
            if (s) setNotice({ text: `${formatMoneyAuto(s.amount, { currency })} recorded.`, undoId: s.id });
          }}
        />
      )}
    </Card>
  );
}
