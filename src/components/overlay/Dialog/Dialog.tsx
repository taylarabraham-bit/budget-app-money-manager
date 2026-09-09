import { useEffect, useId, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../../lib/cx';

export interface DialogProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'children'> {
  /** Whether the dialog is shown. Renders nothing when false. */
  open: boolean;
  /** Called when the user taps the scrim, presses Escape, or uses the close control. */
  onClose?: () => void;
  /** Heading. */
  title: ReactNode;
  /** Line under the heading. */
  description?: ReactNode;
  /** Body - usually a form (AmountInput, Select, ...). */
  children?: ReactNode;
  /** Footer actions, right-aligned on desktop and stacked full-width on mobile (Buttons). */
  footer?: ReactNode;
  /** Panel width: sm 360, md 440, lg 560px. */
  size?: 'sm' | 'md' | 'lg';
  /** On small screens slide up from the bottom as a sheet instead of centring. Default true. */
  sheetOnMobile?: boolean;
  /** Hide the top-right close control. */
  hideClose?: boolean;
}

// Every open dialog registers here, newest last. Only the TOP entry acts on
// Escape and Tab, so a dialog stacked over another (the favourites manager
// over Log purchase) closes alone instead of taking the typed form underneath
// with it (audit UX-1 / UI-1). The app's hardware-Back handler closes the top
// entry through closeTopDialog() for the same reason.
interface OpenDialog {
  close: () => void;
}
const openDialogs: OpenDialog[] = [];
const isTop = (entry: OpenDialog) => openDialogs[openDialogs.length - 1] === entry;

/** Close the topmost open dialog (the one Escape would close). Returns false when none is open. */
export function closeTopDialog(): boolean {
  const top = openDialogs[openDialogs.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

/** How many dialogs are open right now. */
export function openDialogCount(): number {
  return openDialogs.length;
}

// Body scroll lock, counted because dialogs stack: the page under a sheet must
// not scroll along with an overscrolled body, and the second dialog closing
// must not unlock it while the first is still up (audit UI-4 / DS-15).
let scrollLocks = 0;
let bodyOverflowBefore = '';
function lockBodyScroll() {
  if (scrollLocks++ > 0) return;
  bodyOverflowBefore = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
}
function unlockBodyScroll() {
  if (--scrollLocks > 0) return;
  scrollLocks = 0;
  document.body.style.overflow = bodyOverflowBefore;
}

// Everything outside the open dialog is made inert - unfocusable, unclickable,
// hidden from assistive tech - by marking the siblings of each ancestor up to
// <body>. Counted per element so stacked dialogs can share a marked node, and
// skipped on a WebView without `inert`, where the focus trap still holds
// (audit UX-13 / UI-3).
const inertMarks = new Map<Element, number>();
function inertSupported(): boolean {
  return typeof HTMLElement !== 'undefined' && 'inert' in HTMLElement.prototype;
}
function inertOutside(root: Element): () => void {
  if (!inertSupported()) return () => {};
  const marked: Element[] = [];
  for (let node: Element = root; node !== document.body; ) {
    const parent = node.parentElement;
    if (!parent) break;
    for (const sibling of Array.from(parent.children)) {
      if (sibling === node || sibling.tagName === 'SCRIPT' || sibling.tagName === 'STYLE') continue;
      const count = inertMarks.get(sibling) ?? 0;
      if (count === 0) {
        if (sibling.hasAttribute('inert')) continue; // the app's own mark; leave it be
        sibling.setAttribute('inert', '');
      }
      inertMarks.set(sibling, count + 1);
      marked.push(sibling);
    }
    node = parent;
  }
  return () => {
    for (const el of marked) {
      const count = (inertMarks.get(el) ?? 1) - 1;
      if (count > 0) {
        inertMarks.set(el, count);
      } else {
        inertMarks.delete(el);
        el.removeAttribute('inert');
      }
    }
  };
}

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]';
function isTabbable(el: HTMLElement, within: HTMLElement): boolean {
  if (el.tabIndex < 0 || (el as HTMLButtonElement).disabled || (el as HTMLInputElement).type === 'hidden') return false;
  for (let n: HTMLElement | null = el; n && n !== within; n = n.parentElement) {
    if (n.hidden || n.getAttribute('aria-hidden') === 'true') return false;
    const style = getComputedStyle(n);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}
function tabbablesIn(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => isTabbable(el, panel));
}
// Where focus goes on open, and comes back to when it strays: the first
// control in the body or footer (a form's first field, a confirm's safe
// "Cancel"); else the close control; else the panel itself.
function initialFocusTarget(panel: HTMLElement): HTMLElement {
  const controls = tabbablesIn(panel);
  return controls.find((el) => !el.classList.contains('bdg-dialog__close')) ?? controls[0] ?? panel;
}

/**
 * Dialog - a modal panel for short focused tasks: log a purchase, add a
 * goal, confirm a delete. Becomes a bottom sheet on phones. While open it
 * holds keyboard focus, locks the page behind and gives focus back on close.
 * @category Overlay
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  sheetOnMobile = true,
  hideClose = false,
  className,
  ...rest
}: DialogProps) {
  const autoId = useId();
  const titleId = `bdg-dialog-${autoId}-title`;
  const descId = `bdg-dialog-${autoId}-desc`;
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Where focus was before this dialog opened, taken during the render that
  // opens it: by the time an effect runs a child's autoFocus has already moved
  // it into the panel. Given back on close (audit UX-13 / UI-3).
  const openerRef = useRef<Element | null>(null);
  const wasOpenRef = useRef(false);
  if (open && !wasOpenRef.current && typeof document !== 'undefined') openerRef.current = document.activeElement;
  wasOpenRef.current = open;

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const root = rootRef.current;
    const opener = openerRef.current;
    const entry: OpenDialog = { close: () => onCloseRef.current?.() };
    openDialogs.push(entry);
    lockBodyScroll();
    const releaseInert = root ? inertOutside(root) : () => {};

    // Initial focus, unless a child's autoFocus has already claimed it.
    if (panel && !panel.contains(document.activeElement)) initialFocusTarget(panel).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !isTop(entry)) return; // a dialog above this one owns the keys
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      // Tab cycles within the panel; with nothing tabbable it stays on the panel.
      const controls = tabbablesIn(panel);
      const active = document.activeElement;
      const inside = active instanceof Node && panel.contains(active);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) {
        e.preventDefault();
        panel.focus();
      } else if (e.shiftKey ? !inside || active === first || active === panel : !inside || active === last) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    const onFocusIn = (e: FocusEvent) => {
      if (!panel || !isTop(entry)) return;
      const target = e.target;
      // Focus that lands behind the scrim (a WebView without inert, a keyboard's
      // "next" button) comes back; a dialog opening above takes over instead.
      if (target instanceof Element && !panel.contains(target) && !target.closest('.bdg-dialog')) initialFocusTarget(panel).focus();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocusIn);
      releaseInert();
      unlockBodyScroll();
      const at = openDialogs.lastIndexOf(entry);
      if (at >= 0) openDialogs.splice(at, 1);
      // Focus goes back to whatever opened the dialog, unless the user has
      // already moved it somewhere else that is still on the page.
      const active = document.activeElement;
      const loose = !active || active === document.body || !active.isConnected || (panel != null && panel.contains(active));
      if (loose && opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div ref={rootRef} className={cx('bdg-dialog', `bdg-dialog--${size}`, sheetOnMobile && 'bdg-dialog--sheet', className)} {...rest}>
      <div className="bdg-dialog__scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className="bdg-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description != null ? descId : undefined}
        tabIndex={-1}
      >
        <div className="bdg-dialog__header">
          <div className="bdg-dialog__heading">
            <h2 id={titleId} className="bdg-dialog__title">
              {title}
            </h2>
            {description != null && (
              <p id={descId} className="bdg-dialog__description">
                {description}
              </p>
            )}
          </div>
          {!hideClose && (
            <button type="button" className="bdg-dialog__close" onClick={onClose} aria-label="Close">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l8 8M14 6l-8 8" />
              </svg>
            </button>
          )}
        </div>
        {children != null && <div className="bdg-dialog__body">{children}</div>}
        {footer != null && <div className="bdg-dialog__footer">{footer}</div>}
      </div>
    </div>
  );
}
