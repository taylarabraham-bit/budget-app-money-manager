import { useState } from 'react';
import { Alert, Button } from '@budget-app/ui';

interface SampleBannerProps {
  onSetUp: () => void;
}

/** Sits above every tab while the sample household is showing; dismissible for the session. */
export function SampleBanner({ onSetUp }: SampleBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <Alert
      tone="info"
      title="This is a sample household"
      className="sample-banner"
      action={
        <Button size="sm" onClick={onSetUp}>
          Set up mine
        </Button>
      }
      onDismiss={() => setDismissed(true)}
    >
      Add or change anything and it becomes yours - or start from scratch with your own names and budgets.
    </Alert>
  );
}
