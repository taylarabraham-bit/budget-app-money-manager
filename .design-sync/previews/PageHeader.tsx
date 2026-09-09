import { Avatar, Button, PageHeader } from '@budget-app/ui';

export const TopLevel = () => (
  <div className="bdg-app" style={{ padding: '8px 16px', borderRadius: 12, maxWidth: 420 }}>
    <PageHeader size="lg" title="Overview" subtitle="Saturday, 23 August" actions={<Avatar name="Priya Natarajan" color="violet" size="sm" status="active" />} />
  </div>
);

export const DetailWithBack = () => (
  <div className="bdg-app" style={{ padding: '8px 16px', borderRadius: 12, maxWidth: 420 }}>
    <PageHeader
      eyebrow="Category"
      title="Groceries"
      subtitle="$312 of $450 this month"
      onBack={() => undefined}
      actions={
        <Button variant="ghost" size="sm">
          Edit
        </Button>
      }
    />
  </div>
);

export const MemberBudget = () => (
  <div className="bdg-app" style={{ padding: '8px 16px', borderRadius: 12, maxWidth: 420 }}>
    <PageHeader leading={<Avatar name="Sam Okafor" color="sky" size="md" />} title="Sam's budget" subtitle="August · $1,200 limit" onBack={() => undefined} />
  </div>
);

export const WithPrimaryAction = () => (
  <div className="bdg-app" style={{ padding: '8px 16px', borderRadius: 12, maxWidth: 420 }}>
    <PageHeader size="lg" title="Household" subtitle="4 members" actions={<Button size="sm">Invite</Button>} />
  </div>
);
