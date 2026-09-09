import { Button } from '@budget-app/ui';
import { addMonths, monthLabel } from './months';

interface MonthPickerProps {
  value: string;
  /** Earliest month that can be shown. */
  min: string;
  /** Latest month (the current one). */
  max: string;
  onChange: (month: string) => void;
}

/** ‹ August 2026 › - no calendar component exists, and a month is all the report needs. */
export function MonthPicker({ value, min, max, onChange }: MonthPickerProps) {
  return (
    <div className="month-picker" role="group" aria-label="Month">
      <Button variant="ghost" size="sm" aria-label="Previous month" disabled={value <= min} onClick={() => onChange(addMonths(value, -1))}>
        ‹
      </Button>
      <span className="month-picker__label" aria-live="polite">
        {monthLabel(value)}
      </span>
      <Button variant="ghost" size="sm" aria-label="Next month" disabled={value >= max} onClick={() => onChange(addMonths(value, 1))}>
        ›
      </Button>
    </div>
  );
}
