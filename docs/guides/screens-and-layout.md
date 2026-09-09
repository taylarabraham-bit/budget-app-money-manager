# Screens and layout

The Budget App ships as an Android app and a Windows desktop app from the same components. Design phone-first, then widen.

## Frames

- Wrap every screen in `<div className="bdg-app">` (font, colours, background, box-sizing, focus rings).
- Phone: `.bdg-screen` (max 420px, 16px padding). Desktop: `.bdg-container` (max 1080px, 24px padding) with a 2- or 3-column `.bdg-grid-*` of cards.
- Dark mode: put `data-theme="dark"` on any ancestor of the `.bdg-app` element - the app sets it on `<html>` (`app/index.html`) before first paint so nothing flashes. Never rely on the OS setting alone.

## Screen anatomy (phone)

1. `PageHeader` (size `lg` on top-level screens, `onBack` on detail screens).
2. Optional `MemberChip` row or `Tabs`.
3. Content: a `.bdg-stack` of `StatCard` grids, `Card`s with `BudgetBar`s, `GoalCard`s, or a `TransactionList`.
4. `BottomNav fixed` with the "+" action (log purchase). Add `padding-bottom: 88px` to the content so nothing hides behind it.

## The five destinations

The bottom nav (`app/src/components/AppNav.tsx`) carries five tabs; Paydays, Report, Settle up, Lists, Accounts and Settings are sub-screens reached from them.

| Screen | Contents |
|---|---|
| Overview | `StatCard` grid (safe to spend, days to go, earnings), the cash-flow and accounts cards, top `BudgetBar`s, nearest `GoalCard` |
| Activity | `Tabs` (All / Mine / Pending) + `TransactionList` with search |
| Bills | Bills and subscriptions with their due dates, arrears and the "Worth it?" review |
| Goals | `GoalCard` stack + "Add a goal" `Button` (or `EmptyState`) |
| Household | `MemberChip`s / per-member `Card`s, limits, approvals and the settle-up balance |

## Spacing and glue

- Use the utilities for layout only: `.bdg-stack`, `.bdg-row`, `.bdg-row-between`, `.bdg-grid-2/3/4`, `.bdg-gap-*`, `.bdg-grow`, `.bdg-wrap`.
- Section labels between groups of cards: `<h2 className="bdg-section-title">Budgets</h2>`.
- Spacing comes from `--bdg-space-*` (4px grid); radii from `--bdg-radius-*`; never hard-code pixel values in new CSS.

## States every screen needs

- Empty: `EmptyState` with the screen's primary action.
- Problem: one `Alert` at the top (warning/danger) with the fix as its `action`.
- Saving: `Button loading`.
- Overlay tasks: `Dialog` (bottom sheet on phones).
