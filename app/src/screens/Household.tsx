import { useEffect, useState } from 'react';
import { Alert, Amount, Badge, BudgetBar, Button, Card, Dialog, EmptyState, MemberChip, PageHeader, ProgressBar, Select, StatCard, formatMoneyAuto, formatPercent } from '@budget-app/ui';
import { CategoryLimitDialog } from '../components/CategoryLimitDialog';
import { HouseholdSettingsDialog } from '../components/HouseholdSettingsDialog';
import { MemberDetailDialog } from '../components/MemberDetailDialog';
import { MemberDialog } from '../components/MemberDialog';
import { ScreenActions } from '../components/ScreenActions';
import { selectHouseholdSummary } from '../data/selectors';
import { useHousehold } from '../data/store';
import type { CategoryInput, HouseholdPatch, NewMemberInput } from '../data/types';
import { useAccounts } from '../features/accounts';
import { useBills } from '../features/bills';
import { usePaydays } from '../features/paydays';
import { BalanceCard, SplitSettingsCard, balanceSentence, pairNet, useSettlements } from '../features/settle';
import { useToday } from '../lib/useToday';
import { useNavigation } from '../navigation';
import './household.css';

interface HouseholdScreenProps {
  onOpenActivity?: () => void;
}

type Panel =
  | { type: 'addMember' }
  | { type: 'editMember'; id: string }
  | { type: 'viewMember'; id: string }
  | { type: 'removeMember'; id: string }
  | { type: 'settings' }
  | { type: 'addCategory' }
  | { type: 'editCategory'; id: string }
  | null;

interface Notice {
  tone: 'success' | 'info';
  title: string;
  body?: string;
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/**
 * Household - who shares this budget. The household's month at a glance and
 * its settings (name, daily earnings target), a card per member with their
 * personal budget, and the household-wide monthly limits per category.
 */
export function HouseholdScreen({ onOpenActivity }: HouseholdScreenProps) {
  const state = useHousehold();
  const { household, members, categories, currentMemberId, addMember, updateMember, removeMember, updateHousehold, updateCategory, addCategory } = state;
  const { settlements } = useSettlements();
  const { bills, updateBill } = useBills();
  const { schedules, updateSchedule } = usePaydays();
  const { accounts, updateAccount } = useAccounts();
  const { go } = useNavigation();
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  // Who inherits a removed member's bills, paydays and accounts; null = the signed-in member.
  const [takeover, setTakeover] = useState<string | null>(null);

  const now = useToday(); // "days to go" rolls over at midnight like every other screen (audit UI-20)
  const currency = household.currency;
  const money = (v: number) => formatMoneyAuto(v, { currency });
  const summary = selectHouseholdSummary(state, now);
  const firstName = (name: string) => name.split(' ')[0] ?? name;

  const memberById = (id: string) => members.find((m) => m.id === id);
  const summaryFor = (id: string) => summary.members.find((s) => s.member.id === id) ?? null;
  const selectedMember = panel && 'id' in panel && panel.type !== 'editCategory' ? memberById(panel.id) : undefined;
  const editingCategory = panel?.type === 'editCategory' ? categories.find((c) => c.id === panel.id) : undefined;
  const editingCategorySpent = editingCategory ? summary.categories.find((r) => r.category.id === editingCategory.id)?.spent ?? 0 : 0;

  // The member a panel is about vanished (removed on the other phone): close it
  // rather than let the edit dialog morph into "Add a member" (audit UX-9).
  const panelMemberGone = !!panel && 'id' in panel && panel.type !== 'editCategory' && !members.some((m) => m.id === panel.id);
  useEffect(() => {
    if (!panelMemberGone) return;
    setPanel(null);
    setNotice({ tone: 'info', title: 'That member was removed on another device' });
  }, [panelMemberGone]);

  // What the member about to be removed still owns. Reassigned on confirm, so
  // nothing is left pointing at a dead id - a bill owned by nobody vanished from
  // the remaining member's cash flow while still counting in the household's (audit MON-15).
  const removing = panel?.type === 'removeMember' ? selectedMember : undefined;
  const owned = {
    bills: removing ? bills.filter((b) => b.memberId === removing.id) : [],
    paydays: removing ? schedules.filter((s) => s.memberId === removing.id) : [],
    accounts: removing ? accounts.filter((a) => a.memberId === removing.id) : [],
  };
  const ownedCount = owned.bills.length + owned.paydays.length + owned.accounts.length;
  const ownedLabel = [owned.bills.length ? plural(owned.bills.length, 'bill') : '', owned.paydays.length ? plural(owned.paydays.length, 'payday') : '', owned.accounts.length ? plural(owned.accounts.length, 'account') : ''].filter(Boolean).join(', ');
  const takeoverOptions = members.filter((m) => m.id !== removing?.id).map((m) => ({ value: m.id, label: m.name }));
  const takeoverId = takeover && takeoverOptions.some((o) => o.value === takeover) ? takeover : currentMemberId;

  const submitMember = (input: NewMemberInput) => {
    if (panel?.type === 'editMember' && selectedMember) {
      updateMember(selectedMember.id, input);
      setNotice({ tone: 'success', title: `${firstName(input.name)} updated` });
      setPanel({ type: 'viewMember', id: selectedMember.id });
    } else {
      const member = addMember(input);
      setNotice({ tone: 'success', title: `${firstName(member.name)} joined the household`, body: `Personal budget ${money(member.monthlyLimit)} a month.` });
      setPanel(null);
    }
  };

  const confirmRemove = () => {
    if (!selectedMember) return;
    removeMember(selectedMember.id);
    // Their bills, paydays and accounts move to whoever takes over (audit MON-15).
    for (const b of owned.bills) updateBill(b.id, { memberId: takeoverId });
    for (const s of owned.paydays) updateSchedule(s.id, { memberId: takeoverId });
    for (const a of owned.accounts) updateAccount(a.id, { memberId: takeoverId });
    const heir = memberById(takeoverId);
    setNotice({
      tone: 'info',
      title: `${firstName(selectedMember.name)} removed`,
      body: `Their past purchases stay in Activity.${ownedCount > 0 && heir ? ` Their ${ownedLabel} now belong to ${firstName(heir.name)}.` : ''}`,
    });
    setPanel(null);
  };

  const submitSettings = (patch: HouseholdPatch) => {
    updateHousehold(patch);
    setNotice({ tone: 'success', title: 'Household settings saved', body: patch.dailyEarningTarget != null ? `Daily earnings target is now ${money(patch.dailyEarningTarget)}.` : undefined });
    setPanel(null);
  };

  const submitCategory = (input: CategoryInput) => {
    if (editingCategory) {
      updateCategory(editingCategory.id, input);
      setNotice({ tone: 'success', title: `${input.name} limit set to ${money(input.limit)}` });
    } else {
      const category = addCategory(input);
      setNotice({ tone: 'success', title: `${category.icon} ${category.name} added`, body: `${money(category.limit)} a month for the household.` });
    }
    setPanel(null);
  };

  // Cents compare (exactly-at-limit is not over - QA DR-3); limit 0 means "no personal cap", never over.
  const overBudget = summary.members.filter((s) => s.over);
  // Unsettled balance between the signed-in member and the one about to be removed (from my side: positive = they owe me).
  const removingNet = panel?.type === 'removeMember' && selectedMember && selectedMember.id !== currentMemberId ? pairNet(state, settlements, currentMemberId, selectedMember.id) : 0;
  // Members with no personal cap: their spend has no ceiling, so "left" is the capped members' figure only (audit MF-3).
  const uncappedNames = summary.uncapped.map((m) => firstName(m.name)).join(' & ');

  return (
    <div className="bdg-stack household">
      <PageHeader
        size="lg"
        title="Household"
        subtitle={`${members.length} ${members.length === 1 ? 'member' : 'members'} · ${summary.monthLabel}`}
        actions={
          <div className="bdg-row bdg-gap-2">
            <Button size="sm" onClick={() => setPanel({ type: 'addMember' })} iconStart={<span aria-hidden="true">+</span>}>
              Add member
            </Button>
            <ScreenActions />
          </div>
        }
      />

      {notice && (
        <Alert tone={notice.tone} title={notice.title} onDismiss={() => setNotice(null)}>
          {notice.body}
        </Alert>
      )}

      {overBudget.length > 0 && (
        <Alert
          tone="warning"
          title={overBudget.length === 1 ? `${firstName(overBudget[0]!.member.name)} is over budget` : `${overBudget.length} members are over budget`}
          action={
            <Button size="sm" variant="ghost" onClick={() => setPanel({ type: 'viewMember', id: overBudget[0]!.member.id })}>
              View
            </Button>
          }
        >
          {overBudget.map((s) => `${firstName(s.member.name)} is ${money(s.spent - s.limit)} over ${money(s.limit)}`).join('. ')}.
        </Alert>
      )}

      <div className="bdg-grid-2">
        <StatCard
          compact
          label="Spent this month"
          value={summary.spent}
          currency={currency}
          direction="spend"
          caption={
            // "personal limits" because this screen's ceiling is the members' limits summed - the
            // Overview's safe-to-spend measures against the category limits instead (QA L8). With an
            // uncapped member the spend is not "of" the limits: part of it has no ceiling (audit MF-3).
            `${summary.limit > 0 ? (uncappedNames ? `${money(summary.limit)} in personal limits · ${uncappedNames} no cap` : `of ${money(summary.limit)} in personal limits`) : 'no personal limits set'}${summary.bills > 0 ? ` · ${money(summary.bills)} of bills paid first` : ''}`
          }
        />
        {summary.limit > 0 ? (
          <StatCard
            compact
            label="Left this month"
            value={summary.left}
            currency={currency}
            tone="auto"
            caption={`${summary.daysLeft} ${summary.daysLeft === 1 ? 'day' : 'days'} to go${uncappedNames ? ` · in the personal limits, ${uncappedNames} aside` : ''}`}
          />
        ) : (
          // No member has a personal cap, so "left" has no ceiling to come from - show what came in instead.
          <StatCard compact label="Earned this month" value={summary.earned} currency={currency} tone="auto" caption={`No personal limits set · ${summary.daysLeft} ${summary.daysLeft === 1 ? 'day' : 'days'} to go`} />
        )}
      </div>

      <BalanceCard onOpenHistory={() => go({ tab: 'household', sub: { name: 'settle' } })} />

      <Card
        title={household.name}
        subtitle="Household settings"
        actions={
          <Button variant="ghost" size="sm" onClick={() => setPanel({ type: 'settings' })}>
            Edit
          </Button>
        }
      >
        <div className="household-facts">
          <div className="household-facts__item">
            <span className="household-facts__label">Daily target</span>
            <span className="household-facts__value">{household.dailyEarningTarget > 0 ? `${money(household.dailyEarningTarget)}/day` : 'Off'}</span>
          </div>
          <div className="household-facts__item">
            <span className="household-facts__label">Earned this month</span>
            <span className="household-facts__value">{money(summary.earned)}</span>
          </div>
          <div className="household-facts__item">
            <span className="household-facts__label">Currency</span>
            <span className="household-facts__value">{currency}</span>
          </div>
        </div>
      </Card>

      <SplitSettingsCard />

      <h2 className="bdg-section-title">Members</h2>
      {summary.members.length === 0 ? (
        <Card>
          <EmptyState compact icon="👥" title="No members yet" description="Add the people who share this budget." action={<Button size="sm" onClick={() => setPanel({ type: 'addMember' })}>Add member</Button>} />
        </Card>
      ) : (
        <div className="bdg-stack household-members">
          {summary.members.map((s) => {
            const m = s.member;
            // Cents-compared in the selector; never true for a no-cap member (limit 0, QA MF-3).
            const over = s.over;
            return (
              <Card
                key={m.id}
                footer={
                  <div className="household-member__actions">
                    <Button variant="ghost" size="sm" onClick={() => setPanel({ type: 'viewMember', id: m.id })}>
                      View budget
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setPanel({ type: 'editMember', id: m.id })}>
                      Edit
                    </Button>
                  </div>
                }
              >
                <div className="bdg-stack bdg-gap-3">
                  <div className="household-member__top">
                    <span className="bdg-row bdg-gap-2">
                      <MemberChip name={m.name} color={m.color} meta={m.role} />
                      {m.id === currentMemberId && (
                        <Badge tone="info" size="sm">
                          You
                        </Badge>
                      )}
                    </span>
                    <span className="household-member__left">
                      <Amount
                        value={over ? s.spent - s.limit : s.hasLimit ? s.left : s.spent}
                        currency={currency}
                        size="lg"
                        weight="bold"
                        tone={over ? 'negative' : 'neutral'}
                        wholeOnly={Number.isInteger(over ? s.spent - s.limit : s.hasLimit ? s.left : s.spent)}
                      />
                      <span className="household-member__left-label">{over ? 'over budget' : s.hasLimit ? 'left this month' : 'spent · no cap'}</span>
                    </span>
                  </div>
                  <ProgressBar
                    value={s.hasLimit ? s.spent : 0}
                    max={Math.max(s.limit, 1)}
                    tone={over ? 'negative' : m.color}
                    size="md"
                    label={s.hasLimit ? `${money(s.spent)} of ${money(s.limit)}` : `${money(s.spent)} spent this month`}
                    valueLabel={s.hasLimit ? formatPercent(Math.min(s.ratio, 1)) : 'No cap'}
                    aria-label={s.hasLimit ? `${firstName(m.name)}: ${formatPercent(Math.min(s.ratio, 1))} of monthly budget used` : `${firstName(m.name)}: no monthly cap set`}
                  />
                  <div className="household-member__facts">
                    <span>{`Earned ${money(s.earned)}`}</span>
                    <span>{`${s.count} ${s.count === 1 ? 'purchase' : 'purchases'}`}</span>
                    {s.sharedSpent > 0 && <span>{`${money(s.sharedSpent)} shared`}</span>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="bdg-row-between">
        <h2 className="bdg-section-title">Monthly limits</h2>
        <Button variant="ghost" size="sm" onClick={() => setPanel({ type: 'addCategory' })}>
          Add category
        </Button>
      </div>
      <Card subtitle="Tap a category to change its limit. Limits are shared by the whole household.">
        {summary.categories.length === 0 ? (
          <EmptyState compact title="No categories yet" description="Add a category to start budgeting." />
        ) : (
          summary.categories.map((row) => (
            <BudgetBar
              key={row.category.id}
              category={row.category.name}
              spent={row.spent}
              limit={row.limit}
              currency={currency}
              icon={row.category.icon}
              color={row.category.color}
              period={row.limit === 0 ? 'No limit' : undefined}
              onClick={() => setPanel({ type: 'editCategory', id: row.category.id })}
            />
          ))
        )}
      </Card>

      <MemberDialog
        // Edit stays open only while the member still exists (audit UX-9).
        open={panel?.type === 'addMember' || (panel?.type === 'editMember' && !!selectedMember)}
        member={panel?.type === 'editMember' ? selectedMember : undefined}
        onClose={() => setPanel(panel?.type === 'editMember' && selectedMember ? { type: 'viewMember', id: selectedMember.id } : null)}
        onSubmit={submitMember}
        onRemove={
          selectedMember
            ? () => {
                setTakeover(null);
                setPanel({ type: 'removeMember', id: selectedMember.id });
              }
            : undefined
        }
      />

      <MemberDetailDialog
        summary={panel?.type === 'viewMember' ? summaryFor(panel.id) : null}
        onClose={() => setPanel(null)}
        onEdit={() => panel?.type === 'viewMember' && setPanel({ type: 'editMember', id: panel.id })}
        onOpenActivity={onOpenActivity}
      />

      <Dialog
        open={panel?.type === 'removeMember' && !!selectedMember}
        size="sm"
        onClose={() => selectedMember && setPanel({ type: 'editMember', id: selectedMember.id })}
        title={`Remove ${selectedMember ? firstName(selectedMember.name) : 'this member'}?`}
        // A removed member's share of a custom-split purchase moves to whoever paid - never onto the other partners (audit MON-11).
        description="They leave the household and lose their personal budget. Their past purchases stay in Activity; their share of any purchase split by amount moves to whoever paid it."
        footer={
          <>
            <Button variant="secondary" onClick={() => selectedMember && setPanel({ type: 'editMember', id: selectedMember.id })}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmRemove}>
              Remove
            </Button>
          </>
        }
      >
        {removingNet !== 0 && selectedMember && (
          <Alert
            tone="warning"
            title={`${balanceSentence(removingNet, firstName(selectedMember.name))} ${money(Math.abs(removingNet))}`}
            action={
              <Button size="sm" variant="ghost" onClick={() => go({ tab: 'household', sub: { name: 'settle' } })}>
                Settle up first
              </Button>
            }
          >
            Removing them keeps the shared purchases but drops this balance from the settle-up view.
          </Alert>
        )}
        {ownedCount > 0 && (
          <div className="bdg-stack bdg-gap-2">
            <p className="bdg-text-sm bdg-text-muted">{`Their ${ownedLabel} ${ownedCount === 1 ? 'needs' : 'need'} a new owner.`}</p>
            <Select label="Who takes them over" options={takeoverOptions} value={takeoverId} onChange={(e) => setTakeover(e.target.value)} fullWidth />
          </div>
        )}
      </Dialog>

      <HouseholdSettingsDialog open={panel?.type === 'settings'} onClose={() => setPanel(null)} onSubmit={submitSettings} />

      <CategoryLimitDialog
        open={panel?.type === 'addCategory' || panel?.type === 'editCategory'}
        category={editingCategory}
        spent={editingCategorySpent}
        onClose={() => setPanel(null)}
        onSubmit={submitCategory}
      />
    </div>
  );
}
