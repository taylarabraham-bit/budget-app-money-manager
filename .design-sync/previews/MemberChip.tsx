import { MemberChip } from '@budget-app/ui';

export const BudgetSwitcher = () => (
  <div className="bdg-app bdg-row bdg-wrap bdg-gap-2" style={{ padding: 16, borderRadius: 12, maxWidth: 420 }}>
    <MemberChip name="Priya Natarajan" color="violet" meta="$640 left" selected onSelect={() => undefined} />
    <MemberChip name="Sam Okafor" color="sky" meta="$210 left" onSelect={() => undefined} />
    <MemberChip name="Maya Okafor" color="coral" meta="$45 left" onSelect={() => undefined} />
  </div>
);

export const WithRoles = () => (
  <div className="bdg-app bdg-row bdg-wrap bdg-gap-2" style={{ padding: 16, borderRadius: 12, maxWidth: 420 }}>
    <MemberChip name="Priya Natarajan" color="violet" meta="Owner" />
    <MemberChip name="Sam Okafor" color="sky" meta="Partner" />
    <MemberChip name="Maya Okafor" color="coral" meta="Teen" />
  </div>
);

export const Small = () => (
  <div className="bdg-app bdg-row bdg-wrap bdg-gap-2" style={{ padding: 16, borderRadius: 12, maxWidth: 420 }}>
    <MemberChip name="Priya Natarajan" color="violet" size="sm" />
    <MemberChip name="Sam Okafor" color="sky" size="sm" selected onSelect={() => undefined} />
    <MemberChip name="Maya Okafor" color="coral" size="sm" meta="Teen" />
  </div>
);

export const NameOnly = () => (
  <div className="bdg-app bdg-row bdg-wrap bdg-gap-2" style={{ padding: 16, borderRadius: 12, maxWidth: 420 }}>
    <MemberChip name="Priya Natarajan" color="violet" />
    <MemberChip name="Sam Okafor" color="sky" />
  </div>
);
