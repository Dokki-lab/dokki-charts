#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TYPES = new Set(["bar", "line", "area", "dot", "scatter", "donut", "waffle", "heatmap", "waterfall", "timeline", "sankey", "network", "progress", "kpi"]);
const REQUIRED = {
  bar: ["category", "value"], line: ["x", "y"], area: ["x", "y"], dot: ["category", "value"],
  scatter: ["x", "y"], donut: ["category", "value"], waffle: ["category", "value"],
  heatmap: ["x", "y", "value"], waterfall: ["category", "value"], timeline: ["date", "label"],
  sankey: ["source", "target", "value"], network: ["source", "target"], progress: ["category", "value", "targetValue"],
  kpi: ["category", "value"]
};
const LIMITS = { bar: 30, line: 240, area: 120, dot: 40, scatter: 400, donut: 8, waffle: 40, heatmap: 400, waterfall: 24, timeline: 40, sankey: 60, network: 160, progress: 8, kpi: 6 };
const NUMERIC_BY_TYPE = {
  bar: ["value"], line: ["y"], area: ["y"], dot: ["value"], scatter: ["x", "y", "size"],
  donut: ["value"], waffle: ["value"], heatmap: ["value"], waterfall: ["value"], timeline: [],
  sankey: ["value"], network: ["value"], progress: ["value", "targetValue"], kpi: ["value", "previous"]
};
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const WIDTH = 1200;
const HEIGHT = 720;

function fail(message) { throw new Error(message); }
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function finite(value) { return typeof value === "number" && Number.isFinite(value); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function esc(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
function text(value, max = 42) { const s = String(value ?? ""); return s.length > max ? `${s.slice(0, max - 1)}…` : s; }
function slug(value) { return String(value || "chart").normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 64) || "chart"; }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function revision(spec) { return createHash("sha256").update(JSON.stringify(canonical(spec))).digest("hex"); }

export function validateSpec(spec) {
  const errors = [];
  if (!isObject(spec)) return { valid: false, errors: ["Root must be an object."], warnings: [] };
  if (spec.protocol !== "dokki-charts@1") errors.push("protocol must be dokki-charts@1.");
  if (typeof spec.title !== "string" || !spec.title.trim() || spec.title.length > 160) errors.push("title must contain 1–160 characters.");
  const type = spec.chart?.type;
  if (!TYPES.has(type)) errors.push(`chart.type must be one of: ${[...TYPES].join(", ")}.`);
  if (!isObject(spec.encoding)) errors.push("encoding must be an object.");
  if (!Array.isArray(spec.data) || spec.data.length === 0) errors.push("data must contain at least one row.");
  if (Array.isArray(spec.data) && spec.data.length > 5000) errors.push("data exceeds the hard limit of 5,000 rows.");
  if (TYPES.has(type) && Array.isArray(spec.data) && spec.data.length > LIMITS[type]) errors.push(`${type} supports at most ${LIMITS[type]} rows in v1.`);
  if (TYPES.has(type) && isObject(spec.encoding)) for (const role of REQUIRED[type]) if (typeof spec.encoding[role] !== "string" || !spec.encoding[role]) errors.push(`${type} requires encoding.${role}.`);
  if (isObject(spec.theme)) for (const [key, value] of Object.entries(spec.theme)) if (!["accent", "background", "foreground"].includes(key) || !HEX.test(value)) errors.push(`theme.${key} must be a six-digit hex color.`);
  const warnings = [];
  if (Array.isArray(spec.data) && isObject(spec.encoding)) {
    for (const [role, field] of Object.entries(spec.encoding)) {
      if (typeof field !== "string") { errors.push(`encoding.${role} must name a field.`); continue; }
      const present = spec.data.filter((row) => isObject(row) && Object.hasOwn(row, field));
      if (present.length === 0) errors.push(`encoding.${role} references missing field ${field}.`);
      if ((NUMERIC_BY_TYPE[type] || []).includes(role)) {
        const bad = present.filter((row) => row[field] !== null && !finite(row[field]));
        if (bad.length) errors.push(`encoding.${role} field ${field} contains ${bad.length} non-numeric value(s).`);
        const missing = present.filter((row) => row[field] === null).length;
        if (missing) warnings.push(`${missing} row(s) with missing ${field} will be omitted.`);
      }
    }
    spec.data.forEach((row, index) => {
      if (!isObject(row)) errors.push(`data[${index}] must be an object.`);
      else for (const [key, value] of Object.entries(row)) {
        if (!["string", "number", "boolean"].includes(typeof value) && value !== null) errors.push(`data[${index}].${key} must be a scalar or null.`);
        if (typeof value === "number" && !Number.isFinite(value)) errors.push(`data[${index}].${key} must be finite.`);
        if (typeof value === "string" && CONTROL.test(value)) errors.push(`data[${index}].${key} contains a control character.`);
      }
    });
  }
  for (const value of [spec.title, spec.subtitle, spec.insight, ...(spec.notes || []), ...(spec.transformNotes || [])]) if (typeof value === "string" && CONTROL.test(value)) errors.push("Text fields may not contain control characters.");
  if (["donut", "waffle", "sankey"].includes(type) && isObject(spec.encoding) && Array.isArray(spec.data)) {
    const field = spec.encoding.value;
    if (spec.data.some((row) => finite(row?.[field]) && row[field] < 0)) errors.push(`${type} does not accept negative values.`);
  }
  if (spec.numberFormat === "currency" && !/^[A-Z]{3}$/.test(spec.currency || "")) errors.push("currency format requires a three-letter uppercase currency code.");
  if (type === "donut" && spec.data?.length > 6) warnings.push("A bar chart is usually more precise when a part-to-whole view has more than six categories.");
  return { valid: errors.length === 0, errors, warnings };
}

function fmt(spec, value) {
  if (!finite(value)) return "Missing";
  if (spec.numberFormat === "percent") return new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 1 }).format(value);
  if (spec.numberFormat === "currency") return new Intl.NumberFormat("en", { style: "currency", currency: spec.currency, maximumFractionDigits: 1 }).format(value);
  return new Intl.NumberFormat("en", { notation: Math.abs(value) >= 1000000 ? "compact" : "standard", maximumFractionDigits: 2 }).format(value);
}
function palette(spec) {
  const theme = { accent: "#5B5CF0", background: "#F7F7F4", foreground: "#171717", ...(spec.theme || {}) };
  return { ...theme, muted: "#6B6B68", grid: "#D9D9D2", surface: "#FFFFFF", colors: [theme.accent, "#1F9D8A", "#F59E5B", "#D65A7A", "#6A8FDB", "#9A72C7", "#6B8E4E", "#BD7A42"] };
}
function field(spec, role) { return spec.encoding[role]; }
function rowsWith(spec, ...roles) { return spec.data.filter((row) => roles.every((role) => row[field(spec, role)] !== null && row[field(spec, role)] !== undefined)); }
function mark(body, label, extra = "") { return `<g class="mark" tabindex="0" role="img" aria-label="${esc(label)}" ${extra}><title>${esc(label)}</title>${body}</g>`; }
function linear(domainMin, domainMax, rangeMin, rangeMax) { const span = domainMax - domainMin || 1; return (value) => rangeMin + ((value - domainMin) / span) * (rangeMax - rangeMin); }
function extent(values, includeZero = false) { let min = Math.min(...values); let max = Math.max(...values); if (includeZero) { min = Math.min(0, min); max = Math.max(0, max); } if (min === max) { min -= Math.abs(min || 1) * 0.1; max += Math.abs(max || 1) * 0.1; } return [min, max]; }
function axisY(scale, min, max, p) {
  return Array.from({ length: 5 }, (_, i) => { const v = min + ((max - min) * i) / 4; const y = scale(v); return `<line x1="92" y1="${y}" x2="1150" y2="${y}" stroke="${p.grid}"/><text x="82" y="${y + 5}" text-anchor="end" class="axis">${esc(new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(v))}</text>`; }).join("");
}

function renderBar(spec, p) {
  const rows = rowsWith(spec, "category", "value"); const values = rows.map((row) => row[field(spec, "value")]); const [min, max] = extent(values, true);
  const vertical = spec.chart.orientation !== "horizontal"; let body = "";
  if (vertical) {
    const y = linear(min, max, 590, 105); const zero = y(0); const step = 1040 / rows.length; body += axisY(y, min, max, p);
    rows.forEach((row, i) => { const value = row[field(spec, "value")]; const yy = y(value); const x = 105 + i * step; const h = Math.abs(zero - yy); const label = `${row[field(spec, "category")]}: ${fmt(spec, value)}`; body += mark(`<rect x="${x}" y="${Math.min(zero, yy)}" width="${step * 0.68}" height="${Math.max(1, h)}" rx="5" fill="${p.accent}"/><text x="${x + step * 0.34}" y="620" text-anchor="middle" class="axis">${esc(text(row[field(spec, "category")], 14))}</text><text x="${x + step * 0.34}" y="${Math.min(zero, yy) - 10}" text-anchor="middle" class="value">${esc(fmt(spec, value))}</text>`, label); });
  } else {
    const [lo, hi] = extent(values, true); const x = linear(lo, hi, 230, 1135); const zero = x(0); const step = 490 / rows.length;
    rows.forEach((row, i) => { const value = row[field(spec, "value")]; const xx = x(value); const y = 105 + i * step; const label = `${row[field(spec, "category")]}: ${fmt(spec, value)}`; body += mark(`<text x="215" y="${y + step * 0.52}" text-anchor="end" class="axis">${esc(text(row[field(spec, "category")], 24))}</text><rect x="${Math.min(zero, xx)}" y="${y + step * 0.12}" width="${Math.max(1, Math.abs(xx - zero))}" height="${step * 0.58}" rx="5" fill="${p.accent}"/><text x="${value >= 0 ? xx + 10 : xx - 10}" y="${y + step * 0.52}" text-anchor="${value >= 0 ? "start" : "end"}" class="value">${esc(fmt(spec, value))}</text>`, label); });
  }
  return { body, marks: rows.length };
}

function renderLine(spec, p, area = false) {
  const rows = rowsWith(spec, "x", "y"); const seriesField = field(spec, "series"); const groups = new Map();
  for (const row of rows) { const key = seriesField ? String(row[seriesField] ?? "Other") : "Value"; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); }
  const values = rows.map((row) => row[field(spec, "y")]); const [min, max] = extent(values, true); const y = linear(min, max, 590, 110); let body = axisY(y, min, max, p); let marks = 0;
  [...groups.entries()].forEach(([name, group], gi) => {
    const x = (i) => 110 + (group.length === 1 ? 520 : (1040 * i) / (group.length - 1)); const points = group.map((row, i) => `${x(i)},${y(row[field(spec, "y")])}`).join(" "); const color = p.colors[gi % p.colors.length];
    if (area) body += `<polygon points="110,590 ${points} 1150,590" fill="${color}" opacity="0.16"/>`;
    body += `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
    group.forEach((row, i) => { const value = row[field(spec, "y")]; const label = `${name}, ${row[field(spec, "x")]}: ${fmt(spec, value)}`; body += mark(`<circle cx="${x(i)}" cy="${y(value)}" r="6" fill="${p.background}" stroke="${color}" stroke-width="4"/><text x="${x(i)}" y="620" text-anchor="middle" class="axis">${esc(text(row[field(spec, "x")], 12))}</text>`, label); marks++; });
  });
  return { body, marks };
}

function renderDot(spec, p) {
  const rows = rowsWith(spec, "category", "value"); const values = rows.map((row) => row[field(spec, "value")]); const [min, max] = extent(values, true); const x = linear(min, max, 260, 1130); const zero = x(0); const step = 480 / rows.length; let body = "";
  rows.forEach((row, i) => { const value = row[field(spec, "value")]; const xx = x(value); const y = 118 + i * step; const label = `${row[field(spec, "category")]}: ${fmt(spec, value)}`; body += mark(`<text x="235" y="${y + 5}" text-anchor="end" class="axis">${esc(text(row[field(spec, "category")], 24))}</text><line x1="${zero}" y1="${y}" x2="${xx}" y2="${y}" stroke="${p.grid}" stroke-width="3"/><circle cx="${xx}" cy="${y}" r="9" fill="${p.accent}"/><text x="${xx + (value >= 0 ? 16 : -16)}" y="${y + 5}" text-anchor="${value >= 0 ? "start" : "end"}" class="value">${esc(fmt(spec, value))}</text>`, label); });
  return { body, marks: rows.length };
}

function renderScatter(spec, p) {
  const rows = rowsWith(spec, "x", "y"); const xs = rows.map((r) => r[field(spec, "x")]); const ys = rows.map((r) => r[field(spec, "y")]); const [xmin, xmax] = extent(xs); const [ymin, ymax] = extent(ys); const sx = linear(xmin, xmax, 105, 1145); const sy = linear(ymin, ymax, 590, 105); const groupField = field(spec, "series"); const sizeField = field(spec, "size"); const groups = [...new Set(rows.map((r) => String(groupField ? r[groupField] : "Value")))]; let body = axisY(sy, ymin, ymax, p);
  rows.forEach((row) => { const group = String(groupField ? row[groupField] : "Value"); const color = p.colors[groups.indexOf(group) % p.colors.length]; const size = sizeField && finite(row[sizeField]) ? clamp(Math.sqrt(Math.abs(row[sizeField])) * 1.8, 5, 22) : 8; const label = `${group}: ${field(spec, "x")} ${fmt(spec, row[field(spec, "x")])}, ${field(spec, "y")} ${fmt(spec, row[field(spec, "y")])}`; body += mark(`<circle cx="${sx(row[field(spec, "x")])}" cy="${sy(row[field(spec, "y")])}" r="${size}" fill="${color}" fill-opacity="0.72" stroke="${p.background}" stroke-width="2"/>`, label); });
  return { body, marks: rows.length };
}

function arc(cx, cy, r1, r2, start, end) {
  const point = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]; const [a1, b1] = point(r2, start); const [a2, b2] = point(r2, end); const [c1, d1] = point(r1, end); const [c2, d2] = point(r1, start); const large = end - start > Math.PI ? 1 : 0;
  return `M ${a1} ${b1} A ${r2} ${r2} 0 ${large} 1 ${a2} ${b2} L ${c1} ${d1} A ${r1} ${r1} 0 ${large} 0 ${c2} ${d2} Z`;
}
function renderDonut(spec, p) {
  const rows = rowsWith(spec, "category", "value"); const total = rows.reduce((sum, row) => sum + row[field(spec, "value")], 0); let angle = -Math.PI / 2; let body = "";
  rows.forEach((row, i) => { const value = row[field(spec, "value")]; const next = angle + (total ? (value / total) * Math.PI * 2 : 0); const label = `${row[field(spec, "category")]}: ${fmt(spec, value)} (${total ? ((value / total) * 100).toFixed(1) : 0}%)`; body += mark(`<path d="${arc(390, 350, 125, 235, angle, next)}" fill="${p.colors[i % p.colors.length]}" stroke="${p.background}" stroke-width="4"/><circle cx="760" cy="${170 + i * 58}" r="8" fill="${p.colors[i % p.colors.length]}"/><text x="780" y="${176 + i * 58}" class="axis">${esc(text(row[field(spec, "category")], 25))} · ${esc(fmt(spec, value))}</text>`, label); angle = next; });
  body += `<text x="390" y="345" text-anchor="middle" class="kpi">${esc(fmt(spec, total))}</text><text x="390" y="380" text-anchor="middle" class="axis">total</text>`;
  return { body, marks: rows.length };
}

function renderWaffle(spec, p) {
  const rows = rowsWith(spec, "category", "value"); const total = rows.reduce((sum, r) => sum + r[field(spec, "value")], 0); const counts = rows.map((row) => Math.round(total ? (row[field(spec, "value")] / total) * 100 : 0)); let assigned = counts.reduce((a, b) => a + b, 0); if (counts.length) counts[counts.length - 1] += 100 - assigned; let owner = 0; let remaining = counts[0] || 0; let body = "";
  for (let i = 0; i < 100; i++) { while (remaining <= 0 && owner < rows.length - 1) { owner++; remaining = counts[owner]; } const row = rows[owner]; const x = 120 + (i % 10) * 49; const y = 120 + (9 - Math.floor(i / 10)) * 49; const label = row ? `${row[field(spec, "category")]}: ${fmt(spec, row[field(spec, "value")])}` : "Unassigned"; body += mark(`<rect x="${x}" y="${y}" width="39" height="39" rx="6" fill="${row ? p.colors[owner % p.colors.length] : p.grid}"/>`, label); remaining--; }
  rows.forEach((row, i) => { body += `<circle cx="710" cy="${170 + i * 58}" r="8" fill="${p.colors[i % p.colors.length]}"/><text x="730" y="${176 + i * 58}" class="axis">${esc(text(row[field(spec, "category")], 22))} · ${esc(total ? ((row[field(spec, "value")] / total) * 100).toFixed(1) : 0)}%</text>`; });
  return { body, marks: 100 };
}

function renderHeatmap(spec, p) {
  const rows = rowsWith(spec, "x", "y", "value"); const xs = [...new Set(rows.map((r) => String(r[field(spec, "x")])))] ; const ys = [...new Set(rows.map((r) => String(r[field(spec, "y")])))] ; const values = rows.map((r) => r[field(spec, "value")]); const [min, max] = extent(values); const cw = 930 / xs.length; const ch = 470 / ys.length; let body = "";
  rows.forEach((row) => { const xi = xs.indexOf(String(row[field(spec, "x")])); const yi = ys.indexOf(String(row[field(spec, "y")])); const value = row[field(spec, "value")]; const opacity = 0.15 + 0.85 * ((value - min) / (max - min || 1)); const label = `${row[field(spec, "x")]}, ${row[field(spec, "y")]}: ${fmt(spec, value)}`; body += mark(`<rect x="${195 + xi * cw}" y="${110 + yi * ch}" width="${cw - 4}" height="${ch - 4}" rx="5" fill="${p.accent}" fill-opacity="${opacity}"/><text x="${195 + (xi + 0.5) * cw}" y="${116 + (yi + 0.5) * ch}" text-anchor="middle" class="value">${esc(fmt(spec, value))}</text>`, label); });
  xs.forEach((x, i) => { body += `<text x="${195 + (i + 0.5) * cw}" y="615" text-anchor="middle" class="axis">${esc(text(x, 14))}</text>`; }); ys.forEach((y, i) => { body += `<text x="180" y="${116 + (i + 0.5) * ch}" text-anchor="end" class="axis">${esc(text(y, 18))}</text>`; });
  return { body, marks: rows.length };
}

function renderWaterfall(spec, p) {
  const rows = rowsWith(spec, "category", "value"); const totals = []; let running = 0; for (const row of rows) { const start = running; running += row[field(spec, "value")]; totals.push([start, running]); } const vals = totals.flat(); const [min, max] = extent(vals, true); const y = linear(min, max, 590, 110); const step = 1040 / rows.length; let body = axisY(y, min, max, p);
  rows.forEach((row, i) => { const [start, end] = totals[i]; const value = row[field(spec, "value")]; const yy = Math.min(y(start), y(end)); const h = Math.abs(y(start) - y(end)); const x = 105 + i * step; const color = value >= 0 ? p.accent : "#D65A7A"; const label = `${row[field(spec, "category")]}: ${fmt(spec, value)}, running total ${fmt(spec, end)}`; body += mark(`<rect x="${x}" y="${yy}" width="${step * 0.64}" height="${Math.max(2, h)}" rx="4" fill="${color}"/><text x="${x + step * 0.32}" y="620" text-anchor="middle" class="axis">${esc(text(row[field(spec, "category")], 12))}</text><text x="${x + step * 0.32}" y="${yy - 9}" text-anchor="middle" class="value">${esc(value >= 0 ? `+${fmt(spec, value)}` : fmt(spec, value))}</text>`, label); if (i < rows.length - 1) body += `<line x1="${x + step * 0.64}" y1="${y(end)}" x2="${x + step}" y2="${y(end)}" stroke="${p.grid}" stroke-dasharray="5 5"/>`; });
  return { body, marks: rows.length };
}

function renderTimeline(spec, p) {
  const rows = rowsWith(spec, "date", "label"); const x = (i) => 115 + (rows.length === 1 ? 520 : (1020 * i) / (rows.length - 1)); let body = `<line x1="105" y1="350" x2="1145" y2="350" stroke="${p.foreground}" stroke-width="3"/>`;
  rows.forEach((row, i) => { const up = i % 2 === 0; const xx = x(i); const label = `${row[field(spec, "date")]}: ${row[field(spec, "label")]}`; body += mark(`<line x1="${xx}" y1="350" x2="${xx}" y2="${up ? 220 : 480}" stroke="${p.grid}" stroke-width="2"/><circle cx="${xx}" cy="350" r="10" fill="${p.accent}"/><text x="${xx}" y="${up ? 195 : 515}" text-anchor="middle" class="value">${esc(text(row[field(spec, "date")], 18))}</text><text x="${xx}" y="${up ? 220 : 540}" text-anchor="middle" class="axis">${esc(text(row[field(spec, "label")], 22))}</text>`, label); });
  return { body, marks: rows.length };
}

function renderSankey(spec, p) {
  const rows = rowsWith(spec, "source", "target", "value"); const sources = [...new Set(rows.map((r) => String(r[field(spec, "source")])))]; const targets = [...new Set(rows.map((r) => String(r[field(spec, "target")])))]; const total = rows.reduce((s, r) => s + r[field(spec, "value")], 0) || 1; const sy = new Map(sources.map((s, i) => [s, 120 + i * (450 / Math.max(1, sources.length - 1))])); const ty = new Map(targets.map((t, i) => [t, 120 + i * (450 / Math.max(1, targets.length - 1))])); let body = "";
  rows.forEach((row, i) => { const s = String(row[field(spec, "source")]); const t = String(row[field(spec, "target")]); const value = row[field(spec, "value")]; const width = clamp((value / total) * 150, 3, 42); const label = `${s} to ${t}: ${fmt(spec, value)}`; body += mark(`<path d="M 280 ${sy.get(s)} C 500 ${sy.get(s)}, 700 ${ty.get(t)}, 920 ${ty.get(t)}" fill="none" stroke="${p.colors[i % p.colors.length]}" stroke-width="${width}" stroke-opacity="0.55"/>`, label); });
  sources.forEach((s) => { body += `<rect x="230" y="${sy.get(s) - 14}" width="50" height="28" rx="5" fill="${p.foreground}"/><text x="215" y="${sy.get(s) + 5}" text-anchor="end" class="axis">${esc(text(s, 20))}</text>`; }); targets.forEach((t) => { body += `<rect x="920" y="${ty.get(t) - 14}" width="50" height="28" rx="5" fill="${p.foreground}"/><text x="985" y="${ty.get(t) + 5}" class="axis">${esc(text(t, 20))}</text>`; });
  return { body, marks: rows.length };
}

function renderNetwork(spec, p) {
  const rows = rowsWith(spec, "source", "target"); const names = [...new Set(rows.flatMap((r) => [String(r[field(spec, "source")]), String(r[field(spec, "target")])]))]; if (names.length > 80) fail("network supports at most 80 unique nodes in v1."); const pos = new Map(names.map((name, i) => { const a = -Math.PI / 2 + (i / names.length) * Math.PI * 2; const radius = names.length < 12 ? 225 : 260; return [name, [600 + Math.cos(a) * radius, 345 + Math.sin(a) * radius]]; })); let body = "";
  rows.forEach((row) => { const s = String(row[field(spec, "source")]); const t = String(row[field(spec, "target")]); const [x1, y1] = pos.get(s); const [x2, y2] = pos.get(t); const valueField = field(spec, "value"); const value = valueField ? row[valueField] : null; const label = `${s} connected to ${t}${finite(value) ? `: ${fmt(spec, value)}` : ""}`; body += mark(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${p.grid}" stroke-width="${finite(value) ? clamp(value, 1, 8) : 2}"/>`, label); });
  names.forEach((name, i) => { const [x, y] = pos.get(name); body += mark(`<circle cx="${x}" cy="${y}" r="${names.length > 30 ? 8 : 13}" fill="${p.colors[i % p.colors.length]}"/><text x="${x}" y="${y + (names.length > 30 ? 24 : 30)}" text-anchor="middle" class="axis">${esc(text(name, 16))}</text>`, `Node ${name}`); });
  return { body, marks: rows.length + names.length };
}

function renderProgress(spec, p) {
  const rows = rowsWith(spec, "category", "value", "targetValue"); const step = 480 / rows.length; let body = "";
  rows.forEach((row, i) => { const value = row[field(spec, "value")]; const target = row[field(spec, "targetValue")]; const ratio = target ? value / target : 0; const y = 125 + i * step; const label = `${row[field(spec, "category")]}: ${fmt(spec, value)} of ${fmt(spec, target)}`; body += mark(`<text x="110" y="${y}" class="axis">${esc(text(row[field(spec, "category")], 30))}</text><text x="1110" y="${y}" text-anchor="end" class="value">${esc(fmt(spec, value))} / ${esc(fmt(spec, target))}</text><rect x="110" y="${y + 22}" width="1000" height="24" rx="12" fill="${p.grid}"/><rect x="110" y="${y + 22}" width="${1000 * clamp(ratio, 0, 1)}" height="24" rx="12" fill="${ratio >= 1 ? "#1F9D8A" : p.accent}"/>`, label); });
  return { body, marks: rows.length };
}

function renderKpi(spec, p) {
  const rows = rowsWith(spec, "category", "value"); const cols = Math.min(3, rows.length); const cellW = 1040 / cols; let body = "";
  rows.forEach((row, i) => { const x = 90 + (i % cols) * cellW; const y = 110 + Math.floor(i / cols) * 245; const value = row[field(spec, "value")]; const prevField = field(spec, "previous"); const previous = prevField ? row[prevField] : null; const delta = finite(previous) ? value - previous : null; const label = `${row[field(spec, "category")]}: ${fmt(spec, value)}${delta === null ? "" : `, change ${fmt(spec, delta)}`}`; body += mark(`<rect x="${x}" y="${y}" width="${cellW - 24}" height="210" rx="18" fill="${p.surface}" stroke="${p.grid}"/><text x="${x + 28}" y="${y + 48}" class="axis">${esc(text(row[field(spec, "category")], 28))}</text><text x="${x + 28}" y="${y + 125}" class="kpi">${esc(fmt(spec, value))}</text>${delta === null ? "" : `<text x="${x + 28}" y="${y + 170}" class="value" fill="${delta >= 0 ? "#1F9D8A" : "#D65A7A"}">${delta >= 0 ? "+" : ""}${esc(fmt(spec, delta))}</text>`}`, label); });
  return { body, marks: rows.length };
}

export function renderSvg(spec) {
  const validation = validateSpec(spec); if (!validation.valid) fail(validation.errors.join("\n")); const p = palette(spec); let rendered;
  switch (spec.chart.type) {
    case "bar": rendered = renderBar(spec, p); break; case "line": rendered = renderLine(spec, p); break; case "area": rendered = renderLine(spec, p, true); break; case "dot": rendered = renderDot(spec, p); break; case "scatter": rendered = renderScatter(spec, p); break; case "donut": rendered = renderDonut(spec, p); break; case "waffle": rendered = renderWaffle(spec, p); break; case "heatmap": rendered = renderHeatmap(spec, p); break; case "waterfall": rendered = renderWaterfall(spec, p); break; case "timeline": rendered = renderTimeline(spec, p); break; case "sankey": rendered = renderSankey(spec, p); break; case "network": rendered = renderNetwork(spec, p); break; case "progress": rendered = renderProgress(spec, p); break; case "kpi": rendered = renderKpi(spec, p); break; default: fail("Unsupported chart type.");
  }
  const description = [spec.subtitle, spec.insight].filter(Boolean).join(". ") || `${spec.chart.type} chart with ${rendered.marks} marks.`;
  const svg = `<svg id="dokki-chart" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="chart-title chart-description"><title id="chart-title">${esc(spec.title)}</title><desc id="chart-description">${esc(description)}</desc><style>text{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:${p.foreground}}.axis{font-size:17px;fill:${p.muted}}.value{font-size:18px;font-weight:650}.kpi{font-size:48px;font-weight:760}.mark:focus{outline:none}.mark:focus>rect,.mark:focus>circle,.mark:focus>path,.mark:focus>line{filter:drop-shadow(0 0 5px ${p.accent});stroke:${p.foreground};stroke-width:4px}</style><rect width="1200" height="720" fill="${p.background}"/>${rendered.body}</svg>`;
  return { svg, markCount: rendered.marks, warnings: validation.warnings };
}

export function toCsv(spec) {
  const keys = [...new Set(spec.data.flatMap((row) => Object.keys(row)))]; const quote = (value) => { const s = value === null || value === undefined ? "" : String(value); return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; }; return [keys.map(quote).join(","), ...spec.data.map((row) => keys.map((key) => quote(row[key])).join(","))].join("\n") + "\n";
}
function tableHtml(spec) { const keys = [...new Set(spec.data.flatMap((row) => Object.keys(row)))]; return `<table><thead><tr>${keys.map((key) => `<th scope="col">${esc(key)}</th>`).join("")}</tr></thead><tbody>${spec.data.map((row) => `<tr>${keys.map((key) => `<td>${esc(row[key] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table>`; }
function b64(value) { return Buffer.from(value).toString("base64"); }
function htmlDocument(spec, svg, rev, csv, json) {
  const p = palette(spec); const source = (spec.sources || []).map((s) => s.url ? `<span>${esc(s.label)} · ${esc(s.url)}</span>` : `<span>${esc(s.label)}</span>`).join(""); const notes = (spec.notes || []).map((n) => `<li>${esc(n)}</li>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="dokki-chart-revision" content="${rev}"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'"><title>${esc(spec.title)}</title><style>:root{color-scheme:light;--bg:${p.background};--fg:${p.foreground};--muted:${p.muted};--accent:${p.accent};--surface:${p.surface};--grid:${p.grid}}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.shell{max-width:1240px;margin:auto;padding:38px 28px 64px}header{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:start}h1{font-size:clamp(30px,5vw,58px);line-height:1.02;letter-spacing:-.045em;margin:0;max-width:900px}.subtitle{color:var(--muted);font-size:18px;margin:12px 0 0}.actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}button{appearance:none;border:1px solid var(--grid);background:var(--surface);color:var(--fg);border-radius:999px;padding:10px 15px;font:600 14px inherit;cursor:pointer}button:hover,button:focus-visible{border-color:var(--accent);outline:3px solid color-mix(in srgb,var(--accent) 20%,transparent)}.chart{margin-top:28px;border:1px solid var(--grid);border-radius:22px;overflow:hidden;background:var(--bg)}.chart svg{display:block;width:100%;height:auto}.insight{font-size:24px;line-height:1.35;max-width:900px;margin:26px 0 0}.meta{display:flex;gap:16px;flex-wrap:wrap;color:var(--muted);font-size:13px;margin-top:18px}.notes{color:var(--muted);line-height:1.55}details{margin-top:28px;border-top:1px solid var(--grid);padding-top:18px}summary{cursor:pointer;font-weight:700}table{border-collapse:collapse;width:100%;margin-top:16px;background:var(--surface)}th,td{text-align:left;padding:10px;border-bottom:1px solid var(--grid);font-size:14px}th{position:sticky;top:0;background:var(--surface)}.table-wrap{max-height:420px;overflow:auto}@media(max-width:760px){header{grid-template-columns:1fr}.actions{justify-content:flex-start}.shell{padding:24px 14px}h1{font-size:36px}}</style></head><body><main class="shell"><header><div><h1>${esc(spec.title)}</h1>${spec.subtitle ? `<p class="subtitle">${esc(spec.subtitle)}</p>` : ""}</div><div class="actions" aria-label="Download chart"><button data-download="svg">SVG</button><button data-download="png">PNG</button><button data-download="csv">CSV</button><button data-download="json">JSON</button></div></header><section class="chart" aria-label="Interactive chart">${svg}</section>${spec.insight ? `<p class="insight">${esc(spec.insight)}</p>` : ""}<div class="meta"><span>Revision ${rev.slice(0, 12)}</span>${source}</div>${notes ? `<ul class="notes">${notes}</ul>` : ""}<details><summary>View accessible data table</summary><div class="table-wrap">${tableHtml(spec)}</div></details></main><script>(()=>{const csv="${b64(csv)}",json="${b64(json)}",name="${slug(spec.title)}";const bytes=(s)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));const save=(blob,file)=>{const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=file;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};document.querySelectorAll("[data-download]").forEach(b=>b.addEventListener("click",()=>{const kind=b.dataset.download;if(kind==="csv")return save(new Blob([bytes(csv)],{type:"text/csv"}),name+".csv");if(kind==="json")return save(new Blob([bytes(json)],{type:"application/json"}),name+".json");const svg=document.querySelector("#dokki-chart");const xml=new XMLSerializer().serializeToString(svg);if(kind==="svg")return save(new Blob([xml],{type:"image/svg+xml"}),name+".svg");const image=new Image();image.onload=()=>{const canvas=document.createElement("canvas");canvas.width=2400;canvas.height=1440;const ctx=canvas.getContext("2d");ctx.drawImage(image,0,0,2400,1440);canvas.toBlob(blob=>save(blob,name+".png"),"image/png")};image.src=URL.createObjectURL(new Blob([xml],{type:"image/svg+xml"}))}))})();</script></body></html>`;
}

export function suggestSpec(spec) {
  if (!isObject(spec) || !Array.isArray(spec.data) || !spec.data.length) fail("suggest expects an object with non-empty data."); const keys = [...new Set(spec.data.slice(0, 50).flatMap((row) => Object.keys(row)))]; const numeric = keys.filter((key) => spec.data.some((row) => finite(row[key]))); const categorical = keys.filter((key) => spec.data.some((row) => typeof row[key] === "string")); const recommendations = [];
  if (categorical.length && numeric.length) recommendations.push({ type: "bar", encoding: { category: categorical[0], value: numeric[0] }, reason: "One categorical and one numeric field support direct comparison." });
  if (categorical.length && numeric.length) recommendations.push({ type: "line", encoding: { x: categorical[0], y: numeric[0] }, reason: "Use only if the categorical field has a meaningful order, usually time." });
  if (numeric.length >= 2) recommendations.push({ type: "scatter", encoding: { x: numeric[0], y: numeric[1] }, reason: "Two numeric fields support relationship analysis." });
  if (categorical.length >= 2 && numeric.length) recommendations.push({ type: "heatmap", encoding: { x: categorical[0], y: categorical[1], value: numeric[0] }, reason: "Two discrete dimensions and a measure support a matrix view." });
  return { fields: { numeric, categorical }, recommendations: recommendations.slice(0, 3) };
}

export async function packageChart(spec, outDir) {
  const validation = validateSpec(spec); if (!validation.valid) fail(validation.errors.join("\n")); const rev = revision(spec); const { svg, markCount, warnings } = renderSvg(spec); const json = JSON.stringify(spec, null, 2) + "\n"; const csv = toCsv(spec); const report = { protocol: "dokki-charts-qa@1", chartRevision: rev, chartType: spec.chart.type, rows: spec.data.length, marks: markCount, warnings: [...new Set([...validation.warnings, ...warnings])], outputs: ["chart.json", "index.html", "exports/chart.svg", "exports/data.csv", "exports/data.json"], accessibility: { svgTitle: true, svgDescription: true, keyboardMarks: markCount, dataTable: true }, security: { externalRequests: false, inlineInputHtml: false, contentSecurityPolicy: true } };
  await mkdir(path.join(outDir, "exports"), { recursive: true }); await Promise.all([writeFile(path.join(outDir, "chart.json"), json), writeFile(path.join(outDir, "index.html"), htmlDocument(spec, svg, rev, csv, json)), writeFile(path.join(outDir, "exports", "chart.svg"), svg), writeFile(path.join(outDir, "exports", "data.csv"), csv), writeFile(path.join(outDir, "exports", "data.json"), json), writeFile(path.join(outDir, "quality-report.json"), JSON.stringify(report, null, 2) + "\n")]); return report;
}

async function readJson(file) { return JSON.parse(await readFile(file, "utf8")); }
async function main(argv) {
  const [command, input, ...rest] = argv; if (!command || !input) fail("Usage: dokki-charts <validate|suggest|package> <chart.json> [--out-dir DIR]"); const spec = await readJson(path.resolve(input));
  if (command === "validate") { const result = validateSpec(spec); console.log(JSON.stringify(result, null, 2)); if (!result.valid) process.exitCode = 1; return; }
  if (command === "suggest") { console.log(JSON.stringify(suggestSpec(spec), null, 2)); return; }
  if (command === "package") { const flag = rest.indexOf("--out-dir"); if (flag < 0 || !rest[flag + 1]) fail("package requires --out-dir DIR."); const report = await packageChart(spec, path.resolve(rest[flag + 1])); console.log(JSON.stringify(report, null, 2)); return; }
  fail(`Unknown command: ${command}`);
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invoked) main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
