---
category: Overlay
keywords: [dialog, modal, sheet, bottom sheet, popup, log purchase, add goal, confirm delete, form]
---

# Dialog

A modal panel for one short, focused task: log a purchase, add a goal, invite a member, confirm a delete. On phones it slides up as a bottom sheet and its footer buttons stack full width; on desktop it centres. Closing is handled by the scrim, Escape and the top-right control, all through `onClose`.

## Usage

```jsx
import { Dialog, Button, AmountInput, Select, TextField, Checkbox } from '@budget-app/ui';

// Log a purchase
const [open, setOpen] = useState(false);
<Dialog
  open={open}
  onClose={() => setOpen(false)}
  title="Log purchase"
  description="It goes into your personal budget unless you split it."
  footer={
    <>
      <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
      <Button onClick={save}>Save purchase</Button>
    </>
  }
>
  <div className="bdg-stack">
    <AmountInput label="Amount" fullWidth autoFocus />
    <Select label="Category" options={categories} placeholder="Choose a category" fullWidth />
    <TextField label="Merchant" placeholder="Where was it?" fullWidth />
    <Checkbox label="Split with household" />
  </div>
</Dialog>

// Confirm a destructive action
<Dialog open={confirming} onClose={cancel} size="sm" title="Delete this purchase?" description="This removes $64.20 from Groceries. It cannot be undone." footer={<><Button variant="secondary" onClick={cancel}>Keep it</Button><Button variant="danger" onClick={remove}>Delete</Button></>} />
```

## Guidance

- One task per dialog, one primary button in the footer, cancel on the left.
- Keep the body to 3-5 fields. Longer flows are their own screen.
- `title` is a verb phrase ("Log purchase", "Add goal") or a question for confirmations.
- The component renders nothing while `open` is false - keep it mounted and toggle `open`.
