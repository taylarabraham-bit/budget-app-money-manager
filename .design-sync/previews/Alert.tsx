import { Alert, Button } from '@budget-app/ui';

export const Warning = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 440 }}>
    <Alert tone="warning" title="Dining out is almost at its limit">
      $148 of $160 used with 9 days to go.
    </Alert>
  </div>
);

export const DangerWithAction = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 440 }}>
    <Alert
      tone="danger"
      title="Groceries is over budget"
      action={
        <Button variant="ghost" size="sm">
          Adjust limit
        </Button>
      }
    >
      You are $38 over this month's $450 limit.
    </Alert>
  </div>
);

export const SuccessDismissible = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 440 }}>
    <Alert tone="success" title="Goal reached" onDismiss={() => undefined}>
      The holiday fund hit $3,000. Nice work, everyone.
    </Alert>
  </div>
);

export const InfoNoTitle = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 440 }}>
    <Alert tone="info">Purchases are logged manually for now. Automatic bank import is coming later.</Alert>
  </div>
);
