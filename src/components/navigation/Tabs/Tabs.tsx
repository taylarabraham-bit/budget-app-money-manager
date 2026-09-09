import { useState, type HTMLAttributes, type KeyboardEvent } from 'react';
import { cx } from '../../../lib/cx';

export interface TabItem {
  /** Value reported by onChange. */
  value: string;
  /** Visible label. */
  label: string;
  /** Optional count pill after the label. */
  count?: number;
  /** Greys the tab out. */
  disabled?: boolean;
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'role'> {
  /** Tabs, in order. 2-5 work best. */
  items: TabItem[];
  /** Controlled selected value. */
  value?: string;
  /** Initial value for uncontrolled use. Defaults to the first enabled item. */
  defaultValue?: string;
  /** Called with the newly selected value. */
  onChange?: (value: string) => void;
  /** `underline` (default) for screen sections; `segmented` for period switches (Day / Week / Month). */
  variant?: 'underline' | 'segmented';
  /** Equal-width tabs filling the container (mobile). */
  fullWidth?: boolean;
  /** Control size. */
  size?: 'sm' | 'md';
  /**
   * What the choice means to assistive tech. `tablist` (default) switches
   * views of one screen. `radiogroup` is for a form choice drawn as tabs -
   * Purchase / Income, who pays, account type - and announces "Purchase,
   * radio button, checked" instead of "tab 1 of 2" (audit UI-21).
   */
  role?: 'tablist' | 'radiogroup';
  /** Accessible label for the tab list. */
  'aria-label'?: string;
}

/**
 * Tabs - switch between views of the same screen (Overview / Transactions
 * / Goals) or between periods (Day / Week / Month, as `segmented`).
 * @category Navigation
 */
export function Tabs({
  items,
  value,
  defaultValue,
  onChange,
  variant = 'underline',
  fullWidth = false,
  size = 'md',
  role = 'tablist',
  className,
  'aria-label': ariaLabel,
  ...rest
}: TabsProps) {
  const isControlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue ?? items.find((i) => !i.disabled)?.value ?? '');
  const current = isControlled ? value : inner;
  const radio = role === 'radiogroup';
  // Roving tabindex: the active tab is the one the Tab key reaches. When the
  // controlled value matches nothing, or the active item is disabled, the
  // first enabled tab takes that place so the list stays reachable (audit DS-9).
  const activeEnabled = items.some((i) => i.value === current && !i.disabled);
  const reachable = activeEnabled ? current : items.find((i) => !i.disabled)?.value;
  const select = (v: string) => {
    if (!isControlled) setInner(v);
    onChange?.(v);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, from: TabItem) => {
    const forward = e.key === 'ArrowRight' || (radio && e.key === 'ArrowDown');
    const backward = e.key === 'ArrowLeft' || (radio && e.key === 'ArrowUp');
    if (!forward && !backward) return;
    e.preventDefault();
    const enabled = items.filter((i) => !i.disabled);
    const idx = enabled.findIndex((i) => i.value === from.value);
    const next = enabled[(idx + (forward ? 1 : -1) + enabled.length) % enabled.length];
    if (!next) return;
    select(next.value);
    const list = e.currentTarget.parentElement;
    const target = list && Array.from(list.children).find((c) => c instanceof HTMLElement && c.dataset.value === next.value);
    if (target instanceof HTMLElement) target.focus();
  };
  return (
    <div className={cx('bdg-tabs', `bdg-tabs--${variant}`, `bdg-tabs--${size}`, fullWidth && 'bdg-tabs--full', className)} {...rest}>
      <div className="bdg-tabs__list" role={role} aria-label={ariaLabel}>
        {items.map((item) => {
          const active = item.value === current;
          return (
            <button
              key={item.value}
              type="button"
              role={radio ? 'radio' : 'tab'}
              aria-selected={radio ? undefined : active}
              aria-checked={radio ? active : undefined}
              tabIndex={item.value === reachable ? 0 : -1}
              disabled={item.disabled}
              data-value={item.value}
              className={cx('bdg-tabs__tab', active && 'bdg-tabs__tab--active')}
              onClick={() => select(item.value)}
              onKeyDown={(e) => onKeyDown(e, item)}
            >
              <span className="bdg-tabs__label">{item.label}</span>
              {typeof item.count === 'number' && <span className="bdg-tabs__count">{item.count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
