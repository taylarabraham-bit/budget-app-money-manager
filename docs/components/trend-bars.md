---
category: Finance
keywords: [chart, bars, trend, daily earnings, last 7 days, weekly, history, graph, target line]
---

# TrendBars

A small bar chart for the last N days or weeks of earnings or spend - pure CSS, no charting library. The highlighted bar (the last one by default - today) shows its value in a bubble; an optional dashed `reference` line marks a daily target or an average. This is the "how are my days going" chart on the overview.

## Usage

```jsx
import { Card, TrendBars } from '@budget-app/ui';

const week = [
  { label: 'Mon', value: 120 },
  { label: 'Tue', value: 95 },
  { label: 'Wed', value: 160 },
  { label: 'Thu', value: 80 },
  { label: 'Fri', value: 210 },
  { label: 'Sat', value: 64 },
  { label: 'Sun', value: 148.5 },
];

// Daily earnings with a target line
<Card title="Earnings this week" subtitle="Target $150/day">
  <TrendBars data={week} reference={150} referenceLabel="Target" />
</Card>

// Spend, tone negative, taller
<TrendBars data={week} tone="negative" height={120} highlightIndex={4} />

// Net per day (income minus spend) - negatives draw below the baseline
<TrendBars data={[{ label: 'Mon', value: 40 }, { label: 'Tue', value: -25 }, { label: 'Wed', value: 90 }, { label: 'Thu', value: -10 }, { label: 'Fri', value: 130 }]} />

// Non-money data
<TrendBars data={[{ label: 'W1', value: 3 }, { label: 'W2', value: 5 }, { label: 'W3', value: 4 }, { label: 'W4', value: 6 }]} formatValue={(v) => `${v} logged`} tone="accent" />
```

## Guidance

- 5-14 bars read best; label them with short day or week names.
- Use `tone="primary"` for earnings, `"negative"` for spend, `"accent"` for goals/contributions.
- Pass `reference` whenever the app knows a target - the gap to the target is the story.
- Put it inside a Card with a title that names the period; the chart has no title of its own.
