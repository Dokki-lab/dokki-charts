import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { packageChart, renderSvg, suggestSpec, toCsv, validateSpec } from "../skill/scripts/dokki-charts.mjs";

const base = (type, encoding, data) => ({ protocol: "dokki-charts@1", title: `${type} example`, chart: { type }, encoding, data });
const cases = [
  base("bar", { category: "c", value: "v" }, [{ c: "A", v: 2 }, { c: "B", v: 5 }]),
  base("line", { x: "x", y: "v" }, [{ x: "Q1", v: 2 }, { x: "Q2", v: 5 }]),
  base("area", { x: "x", y: "v" }, [{ x: "Q1", v: 2 }, { x: "Q2", v: 5 }]),
  base("dot", { category: "c", value: "v" }, [{ c: "A", v: 2 }, { c: "B", v: 5 }]),
  base("scatter", { x: "x", y: "y", size: "s" }, [{ x: 1, y: 2, s: 4 }, { x: 3, y: 5, s: 9 }]),
  base("donut", { category: "c", value: "v" }, [{ c: "A", v: 2 }, { c: "B", v: 5 }]),
  base("waffle", { category: "c", value: "v" }, [{ c: "A", v: 2 }, { c: "B", v: 5 }]),
  base("heatmap", { x: "x", y: "y", value: "v" }, [{ x: "A", y: "M", v: 2 }, { x: "B", y: "M", v: 5 }]),
  base("waterfall", { category: "c", value: "v" }, [{ c: "Start", v: 10 }, { c: "Cost", v: -3 }]),
  base("timeline", { date: "d", label: "l" }, [{ d: "Jan", l: "Launch" }, { d: "Feb", l: "Expand" }]),
  base("sankey", { source: "s", target: "t", value: "v" }, [{ s: "Visit", t: "Trial", v: 12 }, { s: "Trial", t: "Paid", v: 6 }]),
  base("network", { source: "s", target: "t" }, [{ s: "A", t: "B" }, { s: "B", t: "C" }]),
  base("progress", { category: "c", value: "v", targetValue: "t" }, [{ c: "ARR", v: 75, t: 100 }]),
  base("kpi", { category: "c", value: "v", previous: "p" }, [{ c: "ARR", v: 75, p: 60 }])
];

test("renders every v1 chart family as accessible SVG", () => {
  for (const spec of cases) {
    const validation = validateSpec(spec);
    assert.equal(validation.valid, true, `${spec.chart.type}: ${validation.errors.join(", ")}`);
    const result = renderSvg(spec);
    assert.match(result.svg, /role="img"/);
    assert.match(result.svg, /tabindex="0"/);
    assert.ok(result.markCount > 0);
  }
});

test("rejects unsafe, missing, negative and oversized input", () => {
  assert.equal(validateSpec(base("bar", { category: "c", value: "v" }, [{ c: "A", v: "2" }])).valid, false);
  assert.equal(validateSpec(base("donut", { category: "c", value: "v" }, [{ c: "A", v: -2 }])).valid, false);
  assert.equal(validateSpec(base("bar", { category: "c", value: "v" }, Array.from({ length: 31 }, (_, i) => ({ c: i, v: i })))).valid, false);
  assert.equal(validateSpec({ ...cases[0], title: "bad\u0001title" }).valid, false);
  assert.equal(validateSpec({ ...cases[0], theme: { accent: "url(javascript:alert(1))" } }).valid, false);
});

test("escapes input, packages a self-contained Artifact, and preserves revision", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "dokki-charts-"));
  const spec = { ...cases[0], title: "Revenue </script><img src=x onerror=alert(1)>", sources: [{ label: "Source & method", url: "https://example.com/a?b=1&c=2" }] };
  const report = await packageChart(spec, dir);
  const html = await readFile(path.join(dir, "index.html"), "utf8");
  const svg = await readFile(path.join(dir, "exports", "chart.svg"), "utf8");
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;\/script&gt;&lt;img/);
  assert.match(html, /default-src 'none'/);
  assert.doesNotMatch(html, /<(script|link)[^>]+(?:src|href)=["']https?:\/\//);
  assert.match(html, new RegExp(report.chartRevision));
  assert.match(svg, /&lt;\/script&gt;/);
  assert.equal(report.security.externalRequests, false);
  assert.equal(report.accessibility.keyboardMarks, 2);
});

test("CSV follows the input fields without evaluating formula-like text", () => {
  const csv = toCsv(base("bar", { category: "c", value: "v" }, [{ c: "=1+1", v: 2, note: "a,b" }]));
  assert.match(csv, /=1\+1/);
  assert.match(csv, /"a,b"/);
});

test("suggest reports field-driven candidates", () => {
  const result = suggestSpec({ data: [{ quarter: "Q1", revenue: 10, margin: 0.2 }] });
  assert.deepEqual(result.fields.numeric, ["revenue", "margin"]);
  assert.equal(result.recommendations[0].type, "bar");
  assert.equal(result.recommendations.some((item) => item.type === "scatter"), true);
});
