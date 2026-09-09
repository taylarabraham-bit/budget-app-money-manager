// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Alert } from './Alert';

// Every warning Alert was a live region, so "Export a backup first…" inside
// the Start fresh dialog interrupted the dialog title being read (audit UI-22).
// Notices keep their live roles; static explanatory text can opt out.

afterEach(cleanup);

describe('role', () => {
  it('is alert for warning and danger, status otherwise', () => {
    render(<Alert tone="warning">Nearly there</Alert>);
    expect(screen.getByRole('alert')).toBeDefined();
    cleanup();
    render(<Alert tone="danger">Over budget</Alert>);
    expect(screen.getByRole('alert')).toBeDefined();
    cleanup();
    render(<Alert tone="success">Saved</Alert>);
    expect(screen.getByRole('status')).toBeDefined();
  });

  it('can be overridden for static explanatory text', () => {
    render(
      <Alert tone="warning" role="note">
        Export a backup first if you might want this data back.
      </Alert>,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('note')).toBeDefined();
  });
});
