import { Amount } from '@budget-app/ui';

export const AutoTone = () => (
  <div className="bdg-app bdg-stack bdg-gap-2" style={{ padding: 16, borderRadius: 12 }}>
    <div className="bdg-row-between">
      <span className="bdg-text-sm bdg-text-muted">Salary (income)</span>
      <Amount value={2400} />
    </div>
    <div className="bdg-row-between">
      <span className="bdg-text-sm bdg-text-muted">Trader Joe's (expense)</span>
      <Amount value={-64.2} />
    </div>
    <div className="bdg-row-between">
      <span className="bdg-text-sm bdg-text-muted">Zero</span>
      <Amount value={0} />
    </div>
  </div>
);

export const Sizes = () => (
  <div className="bdg-app bdg-stack bdg-gap-2" style={{ padding: 16, borderRadius: 12, alignItems: 'flex-start' }}>
    <Amount value={1834.5} tone="neutral" size="sm" />
    <Amount value={1834.5} tone="neutral" size="md" />
    <Amount value={1834.5} tone="neutral" size="lg" />
    <Amount value={1834.5} tone="neutral" size="xl" />
    <Amount value={1834.5} tone="neutral" size="display" weight="bold" />
  </div>
);

export const SignsAndRounding = () => (
  <div className="bdg-app bdg-stack bdg-gap-2" style={{ padding: 16, borderRadius: 12, alignItems: 'flex-start' }}>
    <Amount value={2400} signDisplay="exceptZero" />
    <Amount value={12400} wholeOnly tone="neutral" size="lg" />
    <Amount value={12400} compact tone="neutral" size="lg" />
    <Amount value={-1250.75} signDisplay="never" tone="neutral" />
  </div>
);

export const MutedAndStruck = () => (
  <div className="bdg-app bdg-row" style={{ padding: 16, borderRadius: 12, gap: 24 }}>
    <Amount value={450} tone="muted" size="sm" />
    <Amount value={-29.99} struck size="sm" />
    <Amount value={-29.99} tone="negative" weight="bold" />
  </div>
);
