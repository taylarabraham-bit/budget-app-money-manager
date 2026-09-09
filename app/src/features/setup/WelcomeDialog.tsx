import { Button, Dialog } from '@budget-app/ui';
import { APP_NAME } from '../../lib/app-name';

interface WelcomeDialogProps {
  open: boolean;
  onExplore: () => void;
  onSetUp: () => void;
}

/** Shown once per device while the sample household is on screen. */
export function WelcomeDialog({ open, onExplore, onSetUp }: WelcomeDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onExplore}
      size="sm"
      title={`Welcome to ${APP_NAME}`}
      description="You're looking at a sample household so you can see how everything works. Set up yours now, or have a look around first - nothing is saved until you change something."
      footer={
        <>
          <Button variant="secondary" onClick={onExplore}>
            Explore the sample
          </Button>
          <Button onClick={onSetUp}>Set up my household</Button>
        </>
      }
    />
  );
}
