---
category: Household
keywords: [member chip, household, member, person, filter, switch budget, selected, pill]
---

# MemberChip

A household member as a compact pill: avatar, name and an optional `meta` line (their role or a figure). A row of chips is how the app switches between personal budgets and filters the purchase log by who made each purchase. Pass `onSelect` to make it a toggle button; `selected` highlights it in the member's colour.

## Usage

```jsx
import { MemberChip } from '@budget-app/ui';

// Member switcher at the top of the Budgets screen
const [who, setWho] = useState('priya');
<div className="bdg-row bdg-wrap bdg-gap-2">
  <MemberChip name="Priya Natarajan" color="violet" meta="$640 left" selected={who === 'priya'} onSelect={() => setWho('priya')} />
  <MemberChip name="Sam Okafor" color="sky" meta="$210 left" selected={who === 'sam'} onSelect={() => setWho('sam')} />
  <MemberChip name="Maya Okafor" color="coral" meta="$45 left" selected={who === 'maya'} onSelect={() => setWho('maya')} />
</div>

// Static attribution (no onSelect) with a role
<MemberChip name="Priya Natarajan" color="violet" meta="Owner" />

// Small, inside a card header
<MemberChip name="Sam Okafor" color="sky" size="sm" />
```

## Guidance

- Always pass the member's assigned `color` so chips match their `Avatar` elsewhere.
- `meta` is one short value: a role ("Owner", "Parent", "Teen") or money left. Not both.
- In a switcher, exactly one chip is `selected`. For a filter, any number can be.
- Chips wrap onto a second line on phones (`.bdg-wrap`); they do not scroll horizontally.
