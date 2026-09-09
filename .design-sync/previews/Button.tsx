import { Button } from '@budget-app/ui';

const PlusIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M10 4v12M4 10h12" />
  </svg>
);

export const Variants = () => (
  <div className="bdg-app bdg-row bdg-wrap" style={{ padding: 16, borderRadius: 12 }}>
    <Button>Log purchase</Button>
    <Button variant="secondary">Cancel</Button>
    <Button variant="ghost">See all</Button>
    <Button variant="danger">Delete</Button>
  </div>
);

export const Sizes = () => (
  <div className="bdg-app bdg-row bdg-wrap" style={{ padding: 16, borderRadius: 12, alignItems: 'center' }}>
    <Button size="sm">Small</Button>
    <Button size="md">Medium</Button>
    <Button size="lg">Large</Button>
  </div>
);

export const WithIcons = () => (
  <div className="bdg-app bdg-row bdg-wrap" style={{ padding: 16, borderRadius: 12 }}>
    <Button iconStart={<PlusIcon />}>Add goal</Button>
    <Button variant="secondary" iconEnd={<span aria-hidden="true">→</span>}>
      Next
    </Button>
    <Button variant="ghost" size="sm" iconStart={<span aria-hidden="true">✏️</span>}>
      Edit
    </Button>
  </div>
);

export const States = () => (
  <div className="bdg-app bdg-row bdg-wrap" style={{ padding: 16, borderRadius: 12 }}>
    <Button loading>Saving…</Button>
    <Button disabled>Disabled</Button>
    <Button variant="secondary" disabled>
      Disabled
    </Button>
  </div>
);

export const FullWidthMobile = () => (
  <div className="bdg-app bdg-stack bdg-gap-2" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <Button size="lg" fullWidth>
      Log purchase
    </Button>
    <Button size="lg" variant="secondary" fullWidth>
      Not now
    </Button>
  </div>
);
