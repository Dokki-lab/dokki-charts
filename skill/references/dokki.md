# Dokki publishing contract

1. Validate and package the canonical `chart.json` locally.
2. Create an ordinary HTML Artifact using the complete generated `index.html`; do not wrap it in a second application shell.
3. Read the Artifact back and confirm the embedded `chartRevision`, title and mark count.
4. Refresh and reopen the Artifact. Confirm keyboard focus, data-table fallback and SVG/PNG/CSV/JSON downloads remain available.
5. If companion files are uploaded, name them with the chart slug and revision and return their stable Dokki File links.
6. When revising, regenerate the Artifact and every companion export from the same canonical JSON. Never patch only the rendered labels.
