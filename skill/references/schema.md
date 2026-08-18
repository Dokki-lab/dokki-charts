# `dokki-charts@1` schema

The canonical file is JSON with these top-level fields:

```json
{
  "protocol": "dokki-charts@1",
  "title": "Quarterly revenue",
  "subtitle": "USD millions",
  "chart": { "type": "bar", "orientation": "vertical" },
  "encoding": { "category": "quarter", "value": "revenue" },
  "data": [{ "quarter": "Q1", "revenue": 12.4 }],
  "insight": "Q4 contributed the largest step-up.",
  "notes": ["Figures are unaudited."],
  "sources": [{ "label": "Finance export", "url": "https://example.com/source" }],
  "theme": { "accent": "#5b5cf0", "background": "#f7f7f4", "foreground": "#171717" }
}
```

`encoding` maps semantic roles to row keys. Roles used by chart types include `category`, `value`, `x`, `y`, `series`, `size`, `source`, `target`, `label`, `date`, `targetValue`, and `previous`.

All row values must be JSON scalar values or null. The renderer does not execute formulas. Missing numeric values are omitted and reported; they are never converted to zero. URLs are provenance text only and are not fetched.

Optional `transformNotes` is an array of plain-language operations already applied to the supplied data. Optional `theme` accepts hex colors only. Optional `numberFormat` accepts `plain`, `percent`, or `currency`, with `currency` such as `USD` supplied separately.
