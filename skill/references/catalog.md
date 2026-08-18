# Chart catalog

Choose by analytical question and data shape. Avoid selecting a chart because its silhouette looks interesting.

| Type | Primary question | Required fields | Practical v1 limit |
| --- | --- | --- | --- |
| `bar` | Which categories are larger or smaller? | category + value | 30 marks |
| `line` | How does a measure change over ordered time? | x + y, optional series | 240 points |
| `area` | How does magnitude change over ordered time? | x + y | 120 points |
| `dot` | How do category values compare with less ink? | category + value | 40 marks |
| `scatter` | How do two measures relate? | x + y, optional size/group | 400 points |
| `donut` | What are the few parts of a whole? | category + value | 8 parts, non-negative |
| `waffle` | What share of a whole should be countable? | category + value | 6 parts, non-negative |
| `heatmap` | Where are highs/lows across two discrete dimensions? | x + y + value | 400 cells |
| `waterfall` | Which sequential contributions explain a total change? | category + value | 24 steps |
| `timeline` | What happened and when? | date/x + label/category | 40 events |
| `sankey` | How does quantity flow between stages? | source + target + value | 60 links |
| `network` | Which entities connect and cluster? | source + target, optional value | 80 nodes / 160 links |
| `progress` | How close is a measure to a known target? | value + target | 1–8 measures |
| `kpi` | What is the headline value and optional change? | value, optional previous | 1–6 measures |

Prefer `bar` over donut when precise comparison matters. Prefer `line` only when x is ordered. Prefer `scatter` over a line for unordered x values. Use `sankey` for weighted directed flow and `network` for topology. Use a table instead when exact lookup is the main task.
