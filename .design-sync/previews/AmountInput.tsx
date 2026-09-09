import { AmountInput } from '@budget-app/ui';

export const LogPurchase = () => (
  <div className="bdg-app bdg-stack" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <AmountInput label="Amount" defaultValue={64.2} fullWidth />
  </div>
);

export const Empty = () => (
  <div className="bdg-app bdg-stack" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <AmountInput label="Amount" hint="What did it cost?" fullWidth />
  </div>
);

export const ErrorState = () => (
  <div className="bdg-app bdg-stack" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <AmountInput label="Amount" defaultValue={0} error="Enter an amount greater than zero" fullWidth />
  </div>
);

export const LimitMedium = () => (
  <div className="bdg-app bdg-stack" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <AmountInput label="Monthly limit" size="md" defaultValue={450} hint="Resets on the 1st" fullWidth />
  </div>
);

export const OtherCurrency = () => (
  <div className="bdg-app bdg-stack" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <AmountInput label="Amount" currency="EUR" defaultValue={12.5} fullWidth />
  </div>
);
