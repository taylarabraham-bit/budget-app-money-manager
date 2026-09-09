import type { ReactNode } from 'react';

export interface Chip {
  id: string;
  label: ReactNode;
  selected?: boolean;
  'aria-label'?: string;
}

interface ChipRowProps {
  chips: Chip[];
  onPick: (id: string) => void;
  /** Accessible name for the group. */
  label: string;
  /** Something after the chips (e.g. a "Manage" button). */
  trailing?: ReactNode;
}

/**
 * A row of tappable suggestion chips (recent merchants, favourites). One
 * scrolling line on phones so the dialog stays short; wraps on desktop. The
 * design system has no generic chip, so this is app-level glue on tokens.
 */
export function ChipRow({ chips, onPick, label, trailing }: ChipRowProps) {
  if (chips.length === 0 && !trailing) return null;
  return (
    <div className="chip-row" role="group" aria-label={label}>
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          className={`chip-row__chip${chip.selected ? ' chip-row__chip--selected' : ''}`}
          aria-pressed={chip.selected}
          aria-label={chip['aria-label']}
          title={typeof chip.label === 'string' ? chip.label : undefined}
          onClick={() => onPick(chip.id)}
        >
          <span className="chip-row__chip-label">{chip.label}</span>
        </button>
      ))}
      {trailing}
    </div>
  );
}
