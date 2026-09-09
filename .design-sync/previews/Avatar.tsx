import { Avatar } from '@budget-app/ui';

export const Household = () => (
  <div className="bdg-app bdg-row" style={{ padding: 16, borderRadius: 12 }}>
    <Avatar name="Priya Natarajan" color="violet" />
    <Avatar name="Sam Okafor" color="sky" />
    <Avatar name="Maya Okafor" color="coral" />
    <Avatar name="Dev Natarajan" color="lime" />
  </div>
);

export const Sizes = () => (
  <div className="bdg-app bdg-row" style={{ padding: 16, borderRadius: 12, alignItems: 'center' }}>
    <Avatar name="Priya Natarajan" color="violet" size="xs" />
    <Avatar name="Priya Natarajan" color="violet" size="sm" />
    <Avatar name="Priya Natarajan" color="violet" size="md" />
    <Avatar name="Priya Natarajan" color="violet" size="lg" />
    <Avatar name="Priya Natarajan" color="violet" size="xl" />
  </div>
);

export const AllColors = () => (
  <div className="bdg-app bdg-row bdg-wrap" style={{ padding: 16, borderRadius: 12 }}>
    <Avatar name="Coral Reed" color="coral" />
    <Avatar name="Violet Ng" color="violet" />
    <Avatar name="Sky Alvarez" color="sky" />
    <Avatar name="Lime Park" color="lime" />
    <Avatar name="Rose Banks" color="rose" />
    <Avatar name="Amber Cole" color="amber" />
  </div>
);

export const ActiveAndStacked = () => (
  <div className="bdg-app bdg-row" style={{ padding: 16, borderRadius: 12, gap: 24 }}>
    <Avatar name="Priya Natarajan" color="violet" size="lg" status="active" />
    <div className="bdg-row" style={{ gap: 0 }}>
      <Avatar name="Priya Natarajan" color="violet" size="sm" />
      <Avatar name="Sam Okafor" color="sky" size="sm" style={{ marginLeft: -8, boxShadow: '0 0 0 2px #fff' }} />
      <Avatar name="Maya Okafor" color="coral" size="sm" style={{ marginLeft: -8, boxShadow: '0 0 0 2px #fff' }} />
    </div>
  </div>
);
