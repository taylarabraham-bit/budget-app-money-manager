# Building with @budget-app/ui (BudgetUI)

Household budget app for Android + Windows: several members share one household, each has a personal budget, goals, and a manually logged purchase history. Design phone-first (390-420px), then widen.

## Setup - no provider, one wrapper class

There is no ThemeProvider. Tokens live on `:root` in the stylesheet, so components work anywhere once `styles.css` is linked. Wrap every screen in `.bdg-app` (font, text colour, app background, box-sizing, focus rings) and pick a frame:

```jsx
<div className="bdg-app">            {/* add data-theme="dark" here for dark mode; never rely on the OS setting */}
  <div className="bdg-screen">       {/* phone: max 420px, 16px padding. Desktop: className="bdg-container" (max 1080px) */}
    ...
  </div>
</div>
```

Without `.bdg-app` components still render correctly (each sets its own font) but the screen background and focus ring are missing. `BottomNav` needs `fixed` on phones plus `paddingBottom: 88` on the content; `Dialog` renders nothing until `open` is true.

## Styling idiom - tokens and `bdg-*` classes, nothing else

- Components are styled by their props (`variant`, `tone`, `size`, `color`, `compact`). Do not restyle their insides with classes or inline CSS.
- Your own layout glue uses the utility classes: `bdg-stack`, `bdg-row`, `bdg-row-between`, `bdg-wrap`, `bdg-grow`, `bdg-grid-2`, `bdg-grid-3`, `bdg-grid-4`, `bdg-gap-1/2/3/4/6/8`, `bdg-section-title`, `bdg-text-xs/sm/lg`, `bdg-text-muted/subtle/positive/negative`, `bdg-font-medium/semibold`, `bdg-tabular`, `bdg-truncate`, `bdg-sr-only`.
- Any other CSS you write references tokens via `var(--bdg-*)`, never raw values:

| Family | Tokens |
|---|---|
| Brand | `--bdg-color-primary`, `-primary-hover`, `-primary-soft`, `-on-primary`, `--bdg-color-accent`, `-accent-soft` |
| Money / status | `--bdg-color-positive`, `--bdg-color-negative`, `--bdg-color-warning`, `--bdg-color-info` (+ `-soft` variants) |
| Surfaces + text | `--bdg-color-bg`, `-surface`, `-surface-2`, `-surface-3`, `-border`, `-border-strong`, `-text`, `-text-muted`, `-text-subtle`, `-overlay` |
| Members | `--bdg-member-coral/violet/sky/lime/rose/amber` (+ `-soft`); the `MemberColor` prop values use the same names |
| Type | `--bdg-font-sans`, `--bdg-font-mono`, `--bdg-text-xs/sm/md/lg/xl/2xl/3xl/4xl`, `--bdg-weight-regular/medium/semibold/bold`, `--bdg-leading-tight/snug/normal` |
| Space / shape | `--bdg-space-1..16` (4px grid: 1=4px, 2=8, 3=12, 4=16, 6=24, 8=32), `--bdg-radius-sm/md/lg/xl/full`, `--bdg-shadow-sm/md/lg`, `--bdg-control-sm/md/lg` |

No Tailwind, no CSS-in-JS, no `style={{ color: '#...' }}`.

## Money rules

Amounts are numbers: expenses negative, income positive. Render with `Amount` (never hand-format), input with `AmountInput`, and use `formatMoney(value)` for money inside sentences. Income is green, over-limit is red, totals stay neutral (`tone="neutral"`). One hero number per screen.

## Where the truth lives

- `styles.css` -> `_ds_bundle.css`: tokens at the top under `:root` / `[data-theme="dark"]`, then every `bdg-*` class. Read it before writing CSS.
- `components/<group>/<Name>/<Name>.prompt.md`: usage, examples and the props interface for each of the 24 components. Groups: actions, forms, layout, household, feedback, finance, navigation, overlay.
- `guidelines/`: money-and-numbers, household-and-members, screens-and-layout - the app's own rules for screens.

## Idiomatic screen fragment

```jsx
const { PageHeader, Avatar, StatCard, Card, BudgetBar, TrendBars, Button } = window.BudgetUI;

<div className="bdg-app">
  <div className="bdg-screen bdg-stack">
    <PageHeader size="lg" title="Overview" subtitle="Saturday, 23 August"
      actions={<Avatar name="Priya Natarajan" color="violet" size="sm" status="active" />} />
    <div className="bdg-grid-2">
      <StatCard compact label="Today's earnings" value={148.5} change={0.12} changeLabel="vs yesterday" />
      <StatCard compact label="Spent today" value={64.2} direction="spend" change={-0.3} />
    </div>
    <Card title="Earnings this week" subtitle="Target $150/day">
      <TrendBars data={week} reference={150} referenceLabel="Target" />
    </Card>
    <Card title="Budgets" subtitle="August" actions={<Button variant="ghost" size="sm">See all</Button>}>
      <BudgetBar category="Groceries" spent={312} limit={450} icon="🛒" />
      <BudgetBar category="Dining out" spent={148} limit={160} icon="🍜" color="coral" />
    </Card>
  </div>
</div>
```
