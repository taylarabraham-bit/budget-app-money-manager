---
category: Forms
keywords: [select, dropdown, picker, category, member, account, options, form]
---

# Select

A labelled native dropdown. It uses the platform picker on Android and Windows, so it is the right control for choosing a category, a household member, an account or a period. For 2-4 mutually exclusive choices that should all be visible, use `Tabs variant="segmented"` instead.

## Usage

```jsx
import { Select } from '@budget-app/ui';

const categories = [
  { value: 'groceries', label: 'Groceries' },
  { value: 'dining', label: 'Dining out' },
  { value: 'transport', label: 'Transport' },
  { value: 'home', label: 'Home & utilities' },
  { value: 'fun', label: 'Fun' },
];

// With a placeholder (nothing selected yet)
<Select label="Category" options={categories} placeholder="Choose a category" fullWidth />

// Preselected, with a hint
<Select label="Paid by" options={[{ value: 'priya', label: 'Priya' }, { value: 'sam', label: 'Sam' }]} defaultValue="priya" hint="Who made the purchase" />

// Error
<Select label="Category" options={categories} placeholder="Choose a category" error="Pick a category so we can track it" fullWidth />

// Controlled
const [category, setCategory] = useState('groceries');
<Select label="Category" options={categories} value={category} onChange={(e) => setCategory(e.target.value)} />
```

## Guidance

- Always pass `label`; `placeholder` is the prompt inside the control, not a replacement for the label. Use `hideLabel` only in filter bars where the first option names the field ("All categories").
- Keep option labels short and title-cased like the category names in the app.
- Sizes match TextField: `sm` 32px, `md` 40px (default), `lg` 48px.
