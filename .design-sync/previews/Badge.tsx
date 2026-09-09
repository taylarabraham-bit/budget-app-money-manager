import { Badge } from '@budget-app/ui';

export const Tones = () => (
  <div className="bdg-app bdg-row bdg-wrap bdg-gap-2" style={{ padding: 16, borderRadius: 12 }}>
    <Badge tone="positive">On track</Badge>
    <Badge tone="warning">Almost there</Badge>
    <Badge tone="negative">Over budget</Badge>
    <Badge tone="info">Recurring</Badge>
    <Badge tone="neutral">Pending</Badge>
  </div>
);

export const Variants = () => (
  <div className="bdg-app bdg-row bdg-wrap bdg-gap-2" style={{ padding: 16, borderRadius: 12 }}>
    <Badge tone="positive" variant="soft">
      Soft
    </Badge>
    <Badge tone="positive" variant="solid">
      Solid
    </Badge>
    <Badge tone="positive" variant="outline">
      Outline
    </Badge>
    <Badge tone="neutral" variant="solid">
      Neutral solid
    </Badge>
  </div>
);

export const WithDot = () => (
  <div className="bdg-app bdg-row bdg-wrap bdg-gap-2" style={{ padding: 16, borderRadius: 12 }}>
    <Badge tone="positive" dot>
      Reached
    </Badge>
    <Badge tone="warning" dot>
      Due soon
    </Badge>
    <Badge tone="negative" dot>
      Overdue
    </Badge>
  </div>
);

export const Sizes = () => (
  <div className="bdg-app bdg-row bdg-wrap bdg-gap-2" style={{ padding: 16, borderRadius: 12, alignItems: 'center' }}>
    <Badge tone="info" size="sm">
      Small
    </Badge>
    <Badge tone="info" size="md">
      Medium
    </Badge>
    <Badge tone="positive" size="sm" dot>
      Paid
    </Badge>
  </div>
);
