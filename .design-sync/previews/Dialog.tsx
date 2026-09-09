import { AmountInput, Button, Checkbox, Dialog, Select, TextField } from '@budget-app/ui';

const categories = [
  { value: 'groceries', label: 'Groceries' },
  { value: 'dining', label: 'Dining out' },
  { value: 'transport', label: 'Transport' },
  { value: 'fun', label: 'Fun' },
];

// The dialog is position:fixed; the card wrapper contains it, so a tall
// app-coloured frame behind it stands in for the screen underneath.
const Screen = () => (
  <div className="bdg-app" style={{ minHeight: 560, padding: 16 }}>
    <div className="bdg-stack">
      <div className="bdg-section-title">Overview</div>
      <div style={{ height: 96, borderRadius: 14, background: 'var(--bdg-color-surface)', border: '1px solid var(--bdg-color-border)' }} />
      <div style={{ height: 160, borderRadius: 14, background: 'var(--bdg-color-surface)', border: '1px solid var(--bdg-color-border)' }} />
    </div>
  </div>
);

export const LogPurchase = () => (
  <>
    <Screen />
    <Dialog
      open
      onClose={() => undefined}
      title="Log purchase"
      description="It goes into your personal budget unless you split it."
      footer={
        <>
          <Button variant="secondary">Cancel</Button>
          <Button>Save purchase</Button>
        </>
      }
    >
      <div className="bdg-stack">
        <AmountInput label="Amount" defaultValue={64.2} fullWidth />
        <Select label="Category" options={categories} defaultValue="groceries" fullWidth />
        <TextField label="Merchant" defaultValue="Trader Joe's" fullWidth />
        <Checkbox label="Split with household" />
      </div>
    </Dialog>
  </>
);

export const ConfirmDelete = () => (
  <>
    <Screen />
    <Dialog
      open
      onClose={() => undefined}
      size="sm"
      title="Delete this purchase?"
      description="This removes $64.20 from Groceries. It cannot be undone."
      footer={
        <>
          <Button variant="secondary">Keep it</Button>
          <Button variant="danger">Delete</Button>
        </>
      }
    />
  </>
);
