# Dokki Charts

Open-source chart skill for Dokki, Claude Code, Codex and OpenClaw. Turn structured data into accessible, interactive HTML Artifacts with downloadable SVG, PNG, CSV and JSON.

## Why Dokki Charts

- **Artifact-first:** the browser chart is the primary, inspectable result—not a screenshot trapped in a report.
- **Data-shape routing:** the Agent chooses a chart from the question, field roles and reading speed before it styles anything.
- **Portable exports:** every Artifact can download the exact-revision SVG, PNG and underlying data; SVG/PNG can also be consumed by `dokki-slides`.
- **Self-contained:** generated HTML has no CDN, remote font, secret or runtime dependency.
- **Accessible by default:** semantic title/description, keyboard-focusable marks, textual summaries and a data-table fallback.
- **Agent Skills compatible:** one package for Vercel's `skills` CLI, Claude Code, Codex, OpenClaw and ClawHub.

## Install

```bash
npx skills add Dokki-lab/dokki-charts --skill dokki-charts
```

Claude Code marketplace:

```text
/plugin marketplace add Dokki-lab/dokki-charts
/plugin install dokki-charts@dokki-skills
```

## Build the example

```bash
npm test
npm run build:example
```

The generated folder contains `chart.json`, `index.html`, `exports/chart.svg`, `exports/data.csv`, `exports/data.json`, and `quality-report.json`. Open `index.html` to interact with the chart or download a PNG.

## Supported chart families

`bar`, `line`, `area`, `dot`, `scatter`, `donut`, `waffle`, `heatmap`, `waterfall`, `timeline`, `sankey`, `network`, `progress`, and `kpi`.

The catalog describes when each family is appropriate. The renderer is intentionally deterministic and dependency-free so an Agent can audit the whole output path.

## Clean-room origin

Dokki Charts is an original implementation. Research into existing chart skills informed the product requirements, but no PolyForm Noncommercial code, templates, branded style names or visual assets were copied. See [ORIGIN.md](ORIGIN.md).

## License

MIT-0.
