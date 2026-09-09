---
category: Forms
keywords: [input, text field, form, label, hint, error, search, email, prefix, suffix]
---

# TextField

A labelled single-line input with helper text, error state and optional in-field adornments. It is the default field for names, notes, emails and search. **Use `AmountInput` for money** - it has the currency symbol, decimal keyboard and numeric parsing built in.

## Usage

```jsx
import { TextField } from '@budget-app/ui';

// Basic
<TextField label="Merchant" placeholder="e.g. Whole Foods" fullWidth />

// With a hint
<TextField label="Note" hint="Optional - shows on the transaction" fullWidth />

// Error state (replaces the hint, turns the border red)
<TextField label="Email" type="email" defaultValue="priya@" error="Enter a valid email address" fullWidth />

// Search with a visually hidden label and an icon prefix
<TextField
  label="Search transactions"
  hideLabel
  type="search"
  placeholder="Search transactions"
  prefix={<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="9" r="6" /><path d="M13.5 13.5L17 17" /></svg>}
  fullWidth
/>

// Suffix for units
<TextField label="Daily target" defaultValue="150" suffix="per day" />

// Controlled
const [name, setName] = useState('');
<TextField label="Household name" value={name} onChange={(e) => setName(e.target.value)} />
```

## Guidance

- Every field has a `label`. Use `hideLabel` only for search boxes where the placeholder repeats the label.
- Keep `hint` to one short sentence; `error` is a sentence that says how to fix it.
- Stack fields in a `.bdg-stack` with `fullWidth` on phone screens; on desktop group related fields in `.bdg-grid-2`.
- Sizes match Button: `sm` 32px, `md` 40px (default), `lg` 48px.
- `type="date"` and `type="time"` use the native pickers on Android and Windows; pair them with quick-pick `Button`s (Today, Yesterday…) so common choices are one tap.
