# Household and members

The app is used by a **household** - several people sharing one account - and **each member has their own personal budget**. The UI has to make "whose money is this?" obvious at a glance.

## Member identity

- Every member gets one of the six member colours when they join: `coral`, `violet`, `sky`, `lime`, `rose`, `amber`. Pass it as `color` to `Avatar` and `MemberChip`, and as `color` on that member's `ProgressBar`s; `Avatar` derives a colour from the name only as a fallback.
- Attribution uses the avatar, not the name, wherever space is tight: `TransactionItem member={...}`, `GoalCard contributors={[...]}`.
- The signed-in member is marked with `Avatar status="active"` in the `PageHeader`.

## Personal vs household views

- **Personal budget** (one member): `PageHeader leading={<Avatar/>} title="Sam's budget"`, `StatCard`s for that member, `BudgetBar`s for their categories, and a `TransactionList` of their purchases using category `icon`s (the member is implied).
- **Household view**: a `MemberChip` row at the top to switch or filter, `BudgetBar`s for shared categories, and `TransactionList` rows with `member` avatars so it is clear who spent what.
- Shared purchases are flagged with the "Split with household" `Checkbox` when logging; show them with a `Badge tone="info"` "Shared" in lists.

## Roles

Roles are plain text in `MemberChip meta`: "Owner" (set up the household), "Parent"/"Partner", "Teen"/"Child" (allowance budgets). Do not invent permission UI - roles are labels for now.

## Typical screens

- **Household**: `PageHeader` "Household" + `Button` "Invite", then a `Card` per member with `MemberChip`, their `ProgressBar` of spend vs limit, and a `Button variant="ghost"` "View budget".
- **Switching budgets**: a `MemberChip` row (`selected` = the budget being shown) directly under the `PageHeader`, above the stats grid.
