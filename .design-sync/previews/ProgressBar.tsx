import { ProgressBar } from '@budget-app/ui';

export const Labelled = () => (
  <div className="bdg-app bdg-stack" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <ProgressBar label="August" valueLabel="23 of 31 days" value={23} max={31} />
  </div>
);

export const MemberColors = () => (
  <div className="bdg-app bdg-stack bdg-gap-3" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <ProgressBar label="Priya" valueLabel="$1,240" value={1240} max={3000} tone="violet" size="sm" />
    <ProgressBar label="Sam" valueLabel="$960" value={960} max={3000} tone="sky" size="sm" />
    <ProgressBar label="Maya" valueLabel="$180" value={180} max={3000} tone="coral" size="sm" />
  </div>
);

export const Tones = () => (
  <div className="bdg-app bdg-stack bdg-gap-3" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <ProgressBar label="Primary" value={60} />
    <ProgressBar label="Positive" value={72} tone="positive" />
    <ProgressBar label="Warning" value={88} tone="warning" />
    <ProgressBar label="Negative" value={45} tone="negative" />
    <ProgressBar label="Neutral" value={30} tone="neutral" />
  </div>
);

export const OverLimit = () => (
  <div className="bdg-app bdg-stack" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <ProgressBar label="Dining out" valueLabel="$40 over" value={200} max={160} />
  </div>
);

export const SizesAndIndeterminate = () => (
  <div className="bdg-app bdg-stack bdg-gap-3" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <ProgressBar value={55} size="sm" />
    <ProgressBar value={55} size="md" />
    <ProgressBar value={55} size="lg" tone="positive" />
    <ProgressBar label="Syncing" indeterminate />
  </div>
);
