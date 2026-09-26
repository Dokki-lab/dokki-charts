<p>
  <a href="https://dokki.one">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Dokki-lab/.github/main/assets/dokki-dark.svg">
      <img src="https://raw.githubusercontent.com/Dokki-lab/.github/main/assets/dokki-light.svg" alt="Dokki" width="180">
    </picture>
  </a>
</p>

# Dokki Charts

Open-source chart skill for Dokki, Claude Code, Codex and OpenClaw. Turn structured data into accessible, interactive HTML Artifacts with downloadable SVG, PNG, CSV and JSON.

[Install](#install) · [Run an example](#build-the-example) · [Skill guide](skill/SKILL.md) · [MIT-0 license](LICENSE)

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

Requires Node.js 18+. Local chart generation needs no Dokki account, API key or runtime dependency.

Clone this repository and run the bundled example:

```sh
git clone https://github.com/Dokki-lab/dokki-charts.git
cd dokki-charts
node skill/scripts/dokki-charts.mjs validate examples/market-pulse/chart.json
node skill/scripts/dokki-charts.mjs package examples/market-pulse/chart.json --out-dir dist/market-pulse
```

Open `dist/market-pulse/index.html` in your browser. Focus a chart mark with the keyboard, then try the export controls.

The generated folder contains `chart.json`, `index.html`, `exports/chart.svg`, `exports/data.csv`, `exports/data.json`, and `quality-report.json`. Open `index.html` to interact with the chart or download a PNG.

## Supported chart families

`bar`, `line`, `area`, `dot`, `scatter`, `donut`, `waffle`, `heatmap`, `waterfall`, `timeline`, `sankey`, `network`, `progress`, and `kpi`.

The catalog describes when each family is appropriate. The renderer is intentionally deterministic and dependency-free so an Agent can audit the whole output path.

## Clean-room origin

Dokki Charts is an original implementation. Research into existing chart skills informed the product requirements, but no PolyForm Noncommercial code, templates, branded style names or visual assets were copied. See [ORIGIN.md](ORIGIN.md).

## Development

Run `npm test` and `npm run build:example` from the repository root before submitting a renderer change. Include a small synthetic data fixture and check keyboard navigation and exported data when those paths change.


## Contributing and support

Bug reports, examples and focused improvements are welcome. Read the [contribution guide](https://github.com/Dokki-lab/.github/blob/main/CONTRIBUTING.md), use this repository's Issues for reproducible problems, and follow [private security reporting](https://github.com/Dokki-lab/.github/blob/main/SECURITY.md) for vulnerabilities.

[Dokki](https://dokki.one) · [Documentation](https://dokki.one/pub/docs) · [All projects](https://github.com/Dokki-lab) · [Support](https://github.com/Dokki-lab/.github/blob/main/SUPPORT.md)

## License

[MIT-0](LICENSE).
