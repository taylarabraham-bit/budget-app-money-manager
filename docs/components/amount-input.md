---
category: Forms
keywords: [amount, money, currency, input, price, cost, log purchase, budget limit, decimal]
---

# AmountInput

The money field. It shows the currency symbol in the field, opens the decimal keyboard on Android, strips stray characters and reports a parsed number through `onValueChange(value | null)`. Defaults to `size="lg"` because an amount is usually the first and most important thing a person types when logging a purchase.

## Usage

```jsx
import { AmountInput } from '@budget-app/ui';

// Logging a purchase (controlled)
const [amount, setAmount] = useState(null);
<AmountInput label="Amount" value={amount} onValueChange={setAmount} fullWidth autoFocus />

// Setting a category limit (uncontrolled, with a hint)
<AmountInput label="Monthly limit" defaultValue={400} hint="Resets on the 1st" size="md" />

// Validation
<AmountInput label="Amount" defaultValue={0} error="Enter an amount greater than zero" fullWidth />

// Other currencies - the symbol and code follow the currency prop
<AmountInput label="Amount" currency="EUR" defaultValue={12.5} />
```

## Guidance

- One AmountInput per form; if you need two amounts (e.g. "split with partner"), make the second one `size="md"`.
- Pair it with a `Select` for the category and a `TextField` for the note inside a `Dialog` titled "Log purchase".
- Display amounts elsewhere with `Amount`, never with a disabled input.
- `value` is a number (or `null` when empty) - not a string. Format for display with `formatMoney`.
