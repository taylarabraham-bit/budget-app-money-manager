import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Dialog } from '@budget-app/ui';
import { APP_NAME } from '../lib/app-name';

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * What is guarded (audit UI-7). `app` (the default) is the last line under
   * the provider tree, styled inline because the crash may be inside the
   * design system itself. `screen` guards one routed screen and offers "Back
   * to Overview", so the nav and the other tabs survive a bad row on one of
   * them; `dialog` guards one global dialog and offers "Close".
   */
  scope?: 'app' | 'screen' | 'dialog';
  /** Recovery from the fallback: the screen boundary goes to Overview, the dialog boundary closes the dialog. */
  onReset?: () => void;
  /** A change clears a caught error - the routed screen changed under a screen boundary. */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  error: Error | null;
}

const reload = () => globalThis.location?.reload();

/**
 * A render crash shows a recovery UI instead of a white page - as small a
 * recovery as the scope allows.
 *
 * Data safety: the stores persist on every committed change, so by the time a
 * render crashes the last good state is already saved - reloading returns to
 * it. Nothing here deletes anything.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`${APP_NAME} crashed while rendering:`, error, info.componentStack);
  }

  componentDidUpdate(prev: ErrorBoundaryProps): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  reset = (): void => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { scope = 'app' } = this.props;
    const detail = <code style={{ wordBreak: 'break-word' }}>{error.message}</code>;

    if (scope === 'screen') {
      return (
        <div className="bdg-stack bdg-gap-3" role="alert" style={{ padding: 'var(--bdg-space-6) 0' }}>
          <h2 className="bdg-section-title" style={{ margin: 0 }}>
            This screen hit a problem
          </h2>
          <p className="bdg-text-sm bdg-text-muted" style={{ margin: 0 }}>
            The rest of the app still works and your data is safe - everything saved so far is still on this device. Error: {detail}
          </p>
          <div className="bdg-row bdg-wrap bdg-gap-2">
            <Button onClick={this.reset}>Back to Overview</Button>
            <Button variant="ghost" onClick={reload}>
              Reload the app
            </Button>
          </div>
        </div>
      );
    }

    if (scope === 'dialog') {
      return (
        <Dialog open size="sm" title="Something went wrong" description="This dialog hit an error. Your data is safe - close it and try again." onClose={this.reset} footer={<Button onClick={this.reset}>Close</Button>}>
          <p className="bdg-text-xs bdg-text-muted" style={{ margin: 0 }}>
            {detail}
          </p>
        </Dialog>
      );
    }

    return (
      <div style={{ maxWidth: 560, margin: '10vh auto', padding: '0 24px', fontFamily: 'system-ui, sans-serif', color: 'var(--bdg-color-text, #1b1b19)' }}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Something went wrong</h1>
        <p style={{ lineHeight: 1.5, marginBottom: 8 }}>
          The app hit an error it couldn't recover from. Your data is safe on this device - reloading brings back the last saved state.
        </p>
        <p style={{ lineHeight: 1.5, marginBottom: 16, fontSize: 14, opacity: 0.8 }}>
          If this keeps happening after a reload, export a backup from Settings on another device and tell the person who set this up. Error: {detail}
        </p>
        <button
          type="button"
          onClick={reload}
          // on-primary, not white: the dark theme's primary is light teal, where white text failed contrast (audit UI-7).
          style={{ padding: '10px 20px', borderRadius: 10, border: 0, background: 'var(--bdg-color-primary, #0f766e)', color: 'var(--bdg-color-on-primary, #fff)', fontSize: 16, cursor: 'pointer' }}
        >
          Reload the app
        </button>
      </div>
    );
  }
}
