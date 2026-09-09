# Money and numbers

How money is represented and shown across the Budget App.

## Data

- Amounts are plain numbers in the household's currency (default USD). **Expenses are negative, income is positive.** Never store or pass pre-formatted strings.
- Limits, targets and "saved so far" are positive numbers.
- Percent changes are fractions: `0.12` means +12%.
- Dates are ISO strings (`2026-08-23` or `2026-08-23T17:12:00`).

## Display

- Render money with `Amount`; format money inside sentences with `formatMoney(value)` (always two decimals) or `formatMoneyAuto(value)` (cents only when they matter - what BudgetBar uses). Both use `Intl`, tabular digits and the same rounding, so every figure on a screen agrees.
- Colour by meaning: income green (`positive`), over-limit red (`negative`), near-limit amber (`warning`). Totals, balances and limits stay in the text colour (`tone="neutral"`).
- One hero number per screen (`Amount size="display"` or a `StatCard tone="primary"`). Everything else is `xl` or smaller.
- Show cents on transactions; drop them (`wholeOnly`) on round limits and targets.

## Daily earnings

The app's headline metric is **today's earnings total**. It appears as:

1. A `StatCard` ("Today's earnings") at the top of the overview, with `change` vs yesterday.
2. A `TrendBars` chart of the last 7 days with a `reference` line at the daily target.
3. The day header total in `TransactionList` (net of spend).

Keep these three consistent - they are the same number viewed three ways.

## Inputs

- `AmountInput` for every money field. It parses to a number (or `null`) - validate `value > 0` before saving.
- Purchases are logged manually for now (no bank import yet). The "Log purchase" `Dialog` is the main input surface: amount first, then category, merchant, note, and a "Split with household" `Checkbox`.
