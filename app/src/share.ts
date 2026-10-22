// Draws share cards (shared/share.ts) as PNG pictures with the canvas, in the
// site's own look: the purple band, cards, colours by meaning. See docs/share-cards.md.

import {
  trimToWidth,
  wrapToWidth,
  type FormBlock,
  type HeadlineBlock,
  type LinesBlock,
  type ShareBlock,
  type ShareCard,
  type ShareRow,
  type ShareTag,
  type ShareTone,
  type StatsBlock,
  type VersusBlock,
  type VersusSide,
} from "../../shared/share";

/**
 * Pictures are drawn as if the site were a 360px-wide phone at three times the
 * pixels, so every size, space and corner token keeps its proportions.
 */
const SCALE = 3;
export const SHARE_WIDTH = 360 * SCALE;
/** At least square. Keep cards under 1350 tall (4:5) so chat apps show them whole. */
const MIN_HEIGHT = SHARE_WIDTH;
const SITE = "draftyinhere.com";

/** Draws the card and returns it as a PNG. */
export function shareImage(card: ShareCard): Promise<Blob> {
  const canvas = drawShareCard(card);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't draw the picture."))), "image/png"),
  );
}

/** Draws the card on a new canvas, SHARE_WIDTH wide and as tall as it needs (at least square). */
export function drawShareCard(card: ShareCard): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_WIDTH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw pictures.");
  const t = lightTheme();
  // Measure first, then size the canvas (which clears it) and draw for real.
  const height = Math.max(MIN_HEIGHT, layout({ ctx, t, draw: false }, card, 0));
  canvas.height = height;
  layout({ ctx, t, draw: true }, card, height);
  return canvas;
}

// ---------------------------------------------------------------- theme

interface Theme {
  /** A colour token's light-theme value, e.g. color("--good"). */
  color: (token: string) => string;
  /** A size token in picture pixels, e.g. size("--fs-lg") is 54. */
  size: (token: string) => number;
  family: string;
}

/**
 * The light theme's tokens, read from the :root rule at the top of styles.css
 * (not the media query that swaps in the dark ones). Pictures always use them,
 * so they look the same whichever theme the phone is in.
 */
function lightTheme(): Theme {
  const roots: CSSStyleRule[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // Another site's stylesheet: can't be read, and has no tokens anyway.
    }
    for (const rule of Array.from(rules)) if (rule instanceof CSSStyleRule && rule.selectorText === ":root") roots.push(rule);
  }
  const page = getComputedStyle(document.documentElement);
  const token = (name: string) =>
    roots.map((r) => r.style.getPropertyValue(name).trim()).find(Boolean) ?? page.getPropertyValue(name).trim();
  return {
    color: token,
    size: (name) => (parseFloat(token(name)) || 0) * SCALE,
    family: getComputedStyle(document.body).fontFamily || "system-ui, sans-serif",
  };
}

// ---------------------------------------------------------------- drawing helpers

/** The canvas, the theme, and whether to draw or only measure. */
interface Pen {
  ctx: CanvasRenderingContext2D;
  t: Theme;
  draw: boolean;
}

interface TextStyle {
  size: number;
  weight?: number;
  color: string;
  align?: CanvasTextAlign;
  alpha?: number;
  /** Extra space between letters, in ems (for small capitals). */
  tracking?: number;
  /** Line height, in ems. */
  leading?: number;
}

const LINE = 1.25;

function setFont(pen: Pen, s: TextStyle) {
  pen.ctx.font = `${s.weight ?? 400} ${s.size}px ${pen.t.family}`;
  pen.ctx.letterSpacing = `${(s.tracking ?? 0) * s.size}px`;
}

function measure(pen: Pen, s: TextStyle): (text: string) => number {
  setFont(pen, s);
  return (text) => pen.ctx.measureText(text).width;
}

/** One line of text, cut short with "…" if it's wider than `max`. `x` is its left, centre or right per `align`. Returns its height. */
function line(pen: Pen, text: string, x: number, y: number, max: number, s: TextStyle): number {
  const h = s.size * (s.leading ?? LINE);
  if (!pen.draw) return h;
  const { ctx } = pen;
  const fitted = trimToWidth(text, max, measure(pen, s));
  ctx.fillStyle = s.color;
  ctx.globalAlpha = s.alpha ?? 1;
  ctx.textAlign = s.align ?? "left";
  ctx.textBaseline = "middle";
  ctx.fillText(fitted, x, y + h / 2);
  ctx.globalAlpha = 1;
  return h;
}

/** Text that wraps onto up to `maxLines` lines. Returns its height. */
function para(pen: Pen, text: string, x: number, y: number, max: number, s: TextStyle, maxLines = 2): number {
  const lines = wrapToWidth(text, max, measure(pen, s), maxLines);
  return lines.reduce((top, l) => top + line(pen, l, x, y + top, max, s), 0);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** A filled, outlined box, e.g. a card. */
function box(pen: Pen, x: number, y: number, w: number, h: number, look: { fill?: string; stroke?: string; radius: number }) {
  if (!pen.draw) return;
  const { ctx } = pen;
  const edge = SCALE; // 1px borders on the site
  roundRect(ctx, x + edge / 2, y + edge / 2, w - edge, h - edge, look.radius);
  if (look.fill) {
    ctx.fillStyle = look.fill;
    ctx.fill();
  }
  if (look.stroke) {
    ctx.strokeStyle = look.stroke;
    ctx.lineWidth = edge;
    ctx.stroke();
  }
}

/** A card on the page: surface, thin border, large corners. */
function card(pen: Pen, x: number, y: number, w: number, h: number) {
  box(pen, x, y, w, h, { fill: pen.t.color("--surface"), stroke: pen.t.color("--line"), radius: pen.t.size("--r-lg") });
}

/** The site's colour for each meaning. */
function toneColor(t: Theme, tone: ShareTone | undefined): string {
  if (tone === "good") return t.color("--good");
  if (tone === "bad") return t.color("--bad");
  if (tone === "live") return t.color("--live");
  return t.color("--neutral");
}

/** A tag pill ("Live", "Won"). `x` is its left, centre or right edge per `align`. Returns its size. */
function pill(pen: Pen, tag: ShareTag, x: number, y: number, align: "left" | "center" | "right", onBrand = false) {
  const { t } = pen;
  const s: TextStyle = { size: t.size("--fs-sm"), weight: 700, color: t.color("--on-color"), align: "center" };
  const w = measure(pen, s)(tag.text) + 2 * t.size("--sp-3");
  const h = s.size * 1.6;
  const left = align === "left" ? x : align === "center" ? x - w / 2 : x - w;
  // On the purple band a grey pill would vanish, so "neither" is a see-through white one there.
  const quiet = onBrand && tag.tone === "neutral";
  const color = quiet ? t.color("--brand-text") : toneColor(t, tag.tone);
  if (quiet) box(pen, left, y, w, h, { fill: t.color("--on-brand-subtle"), stroke: t.color("--on-brand-line"), radius: h / 2 });
  else if (tag.outline) box(pen, left, y, w, h, { stroke: color, radius: h / 2 });
  else box(pen, left, y, w, h, { fill: color, radius: h / 2 });
  line(pen, tag.text, left + w / 2, y + (h - s.size * LINE) / 2, w, { ...s, color: tag.outline || quiet ? color : s.color });
  return { w, h };
}

/** Small capitals over a card or a group, like h3 on the site. */
function heading(pen: Pen, text: string, x: number, y: number, w: number): number {
  const { t } = pen;
  return line(pen, text.toUpperCase(), x, y, w, { size: t.size("--fs-sm"), weight: 700, color: t.color("--muted"), tracking: 0.06 });
}

// ---------------------------------------------------------------- the card

/** Lays out the whole card and returns its height. With pen.draw, draws it into `height` (the footer sits at the bottom). */
function layout(pen: Pen, c: ShareCard, height: number): number {
  const { t, ctx } = pen;
  const gutter = t.size("--sp-4");
  const inner = SHARE_WIDTH - 2 * gutter;
  if (pen.draw) {
    ctx.fillStyle = t.color("--bg");
    ctx.fillRect(0, 0, SHARE_WIDTH, height);
  }

  // The purple band: league name and tag, title, subtitle.
  const bandH = band({ ...pen, draw: false }, c, gutter, inner);
  if (pen.draw) {
    ctx.fillStyle = t.color("--brand");
    ctx.fillRect(0, 0, SHARE_WIDTH, bandH);
    band(pen, c, gutter, inner);
  }

  let y = bandH + t.size("--sp-4");
  for (const b of c.blocks) y += block(pen, b, gutter, y, inner) + t.size("--sp-3");

  // One quiet line at the bottom: where it came from.
  const foot: TextStyle = { size: t.size("--fs-sm"), color: t.color("--muted"), align: "center" };
  const footH = foot.size * LINE + 2 * t.size("--sp-3");
  if (pen.draw) line(pen, SITE, SHARE_WIDTH / 2, height - footH + t.size("--sp-3"), inner, foot);
  return y - t.size("--sp-3") + footH;
}

/** The band's contents. Returns its height. */
function band(pen: Pen, c: ShareCard, x: number, w: number): number {
  const { t } = pen;
  const onBrand = t.color("--brand-text");
  let y = t.size("--sp-4");
  const tag = c.tag ? pill({ ...pen, draw: false }, c.tag, 0, 0, "right") : null;
  const kicker: TextStyle = { size: t.size("--fs-sm"), weight: 700, color: onBrand, alpha: 0.75, tracking: 0.08 };
  const rowH = Math.max(kicker.size * LINE, tag?.h ?? 0);
  line(pen, c.kicker.toUpperCase(), x, y + (rowH - kicker.size * LINE) / 2, w - (tag ? tag.w + t.size("--sp-3") : 0), kicker);
  if (c.tag) pill(pen, c.tag, x + w, y, "right", true);
  y += rowH + t.size("--sp-2");
  y += line(pen, c.title, x, y, w, { size: t.size("--fs-xxl"), weight: 800, color: onBrand });
  if (c.subtitle) y += line(pen, c.subtitle, x, y, w, { size: t.size("--fs-md"), color: onBrand, alpha: 0.8 });
  return y + t.size("--sp-4");
}

function block(pen: Pen, b: ShareBlock, x: number, y: number, w: number): number {
  switch (b.kind) {
    case "versus":
      return versus(pen, b, x, y, w);
    case "headline":
      return headline(pen, b, x, y, w);
    case "stats":
      return stats(pen, b, x, y, w);
    case "lines":
      return lines(pen, b, x, y, w);
    case "form":
      return form(pen, b, x, y, w);
  }
}

// ---------------------------------------------------------------- blocks

/** Two panels side by side. The rows start at the same height in both, so they line up. */
function versus(pen: Pen, b: VersusBlock, x: number, y: number, w: number): number {
  const { t } = pen;
  const gap = t.size("--sp-3");
  const pad = t.size("--sp-4");
  const panelW = (w - gap) / 2;
  const innerW = panelW - 2 * pad;
  const measureOnly = { ...pen, draw: false };
  const headH = Math.max(...b.sides.map((s) => sideHead(measureOnly, s, 0, 0, innerW)));
  const rowsH = Math.max(...b.sides.map((s) => sideRows(measureOnly, s, 0, 0, innerW)));
  const h = pad + headH + rowsH + pad;
  b.sides.forEach((s, i) => {
    const left = x + i * (panelW + gap);
    if (s.highlight) box(pen, left, y, panelW, h, { fill: t.color("--good-bg"), stroke: t.color("--good"), radius: t.size("--r-lg") });
    else card(pen, left, y, panelW, h);
    sideHead(pen, s, left + pad, y + pad, innerW);
    sideRows(pen, s, left + pad, y + pad + headH, innerW);
  });
  return h;
}

/** Name, detail, the big number, badge and note, centred. */
function sideHead(pen: Pen, s: VersusSide, x: number, y: number, w: number): number {
  const { t } = pen;
  const mid = x + w / 2;
  let h = line(pen, s.name, mid, y, w, { size: t.size("--fs-xl"), weight: 700, color: t.color("--text"), align: "center" });
  if (s.detail) h += line(pen, s.detail, mid, y + h, w, { size: t.size("--fs-sm"), color: t.color("--muted"), align: "center" });
  if (s.big !== undefined) {
    // The one hero number: bigger than anything on the site, it's what the picture is for.
    const color = s.highlight ? t.color("--good-text") : t.color("--text");
    h += t.size("--sp-2");
    h += line(pen, s.big, mid, y + h, w, { size: t.size("--fs-xxl") * 1.75, weight: 800, color, align: "center", leading: 1.05 });
  }
  const small: TextStyle = { size: t.size("--fs-sm"), weight: 600, color: t.color("--muted"), align: "center" };
  if (s.bigLabel) h += line(pen, s.bigLabel, mid, y + h, w, small);
  if (s.badge) h += t.size("--sp-2") + pill(pen, s.badge, mid, y + h + t.size("--sp-2"), "center").h;
  if (s.note) h += t.size("--sp-2") + line(pen, s.note, mid, y + h + t.size("--sp-2"), w, small);
  return h + t.size("--sp-3");
}

/** The side's rows under a dividing line, or its "empty" words. */
function sideRows(pen: Pen, s: VersusSide, x: number, y: number, w: number): number {
  const { t } = pen;
  if (pen.draw) {
    pen.ctx.fillStyle = t.color("--line");
    pen.ctx.fillRect(x, y, w, SCALE);
  }
  const top = t.size("--sp-2");
  if (s.rows.length === 0) {
    return top + (s.empty ? line(pen, s.empty, x, y + top, w, { size: t.size("--fs-md"), color: t.color("--muted") }) : 0);
  }
  return s.rows.reduce((h, r) => h + row(pen, r, x, y + h, w), top);
}

/** A name on the left and a number on the right. */
function row(pen: Pen, r: ShareRow, x: number, y: number, w: number): number {
  const { t } = pen;
  const size = t.size("--fs-md");
  const h = size * 1.5;
  const pad = (h - size * LINE) / 2;
  const valueStyle: TextStyle = {
    size,
    weight: 700,
    color: r.tone && r.tone !== "neutral" ? toneColor(t, r.tone) : t.color("--text"),
    align: "right",
  };
  const valueW = r.value ? measure(pen, valueStyle)(r.value) + t.size("--sp-2") : 0;
  line(pen, r.label, x, y + pad, w - valueW, { size, color: t.color("--text") });
  if (r.value) line(pen, r.value, x + w, y + pad, w, valueStyle);
  return h;
}

/** A big statement on a card, with an explanation under it. */
function headline(pen: Pen, b: HeadlineBlock, x: number, y: number, w: number): number {
  const { t } = pen;
  const pad = t.size("--sp-4");
  const inner = w - 2 * pad;
  const body = (p: Pen) => {
    const color = b.tone && b.tone !== "neutral" ? toneColor(t, b.tone) : t.color("--text");
    let h = line(p, b.text, x + w / 2, y + pad, inner, { size: t.size("--fs-xxl"), weight: 800, color, align: "center" });
    if (b.detail) {
      h += t.size("--sp-1");
      h += para(p, b.detail, x + w / 2, y + pad + h, inner, { size: t.size("--fs-md"), color: t.color("--muted"), align: "center" });
    }
    return h;
  };
  const h = pad + body({ ...pen, draw: false }) + pad;
  card(pen, x, y, w, h);
  body(pen);
  return h;
}

/** Tiles in rows, like a .stat-row. Each row is as tall as its tallest tile. */
function stats(pen: Pen, b: StatsBlock, x: number, y: number, w: number): number {
  const { t } = pen;
  const cols = b.columns ?? Math.min(b.items.length, 4);
  const gap = t.size("--sp-2");
  const tileW = (w - gap * (cols - 1)) / cols;
  const pad = t.size("--sp-2");
  // Four across is the site's .stat-row; fewer tiles have room for bigger numbers.
  const valueSize = t.size(cols >= 4 ? "--fs-lg" : cols === 3 ? "--fs-xl" : "--fs-xxl");
  let h = b.title ? heading(pen, b.title, x, y, w) + t.size("--sp-2") : 0;
  for (let i = 0; i < b.items.length; i += cols) {
    const items = b.items.slice(i, i + cols);
    const tile = (p: Pen, s: (typeof items)[number], left: number, top: number) => {
      const mid = left + tileW / 2;
      const inner = tileW - 2 * t.size("--sp-1");
      let th = line(p, s.value, mid, top + pad, inner, { size: valueSize, weight: 700, color: t.color("--text"), align: "center" });
      th += para(p, s.label, mid, top + pad + th, inner, { size: t.size("--fs-sm"), color: t.color("--muted"), align: "center" });
      if (s.rank) {
        const color = s.rank.tone === "neutral" ? t.color("--muted") : toneColor(t, s.rank.tone);
        th += t.size("--sp-1");
        th += para(p, s.rank.text, mid, top + pad + th, inner, { size: t.size("--fs-xs"), weight: 600, color, align: "center" });
      }
      return pad + th + pad;
    };
    const rowH = Math.max(...items.map((s) => tile({ ...pen, draw: false }, s, 0, 0)));
    items.forEach((s, j) => {
      const left = x + j * (tileW + gap);
      card(pen, left, y + h, tileW, rowH);
      tile(pen, s, left, y + h);
    });
    h += rowH + (i + cols < b.items.length ? gap : 0);
  }
  return h;
}

/** A card of rows under an optional title. */
function lines(pen: Pen, b: LinesBlock, x: number, y: number, w: number): number {
  const { t } = pen;
  const pad = t.size("--sp-4");
  const inner = w - 2 * pad;
  const body = (p: Pen) => {
    let h = b.title ? heading(p, b.title, x + pad, y + pad, inner) + t.size("--sp-1") : 0;
    for (const r of b.rows) h += row(p, r, x + pad, y + pad + h, inner);
    return h;
  };
  const h = pad + body({ ...pen, draw: false }) + pad - t.size("--sp-2");
  card(pen, x, y, w, h);
  body(pen);
  return h;
}

/** "Last five" and W/D/L chips on one card. */
function form(pen: Pen, b: FormBlock, x: number, y: number, w: number): number {
  const { t } = pen;
  const pad = t.size("--sp-4");
  // The site's .form: 20px chips, 3px apart.
  const chip = 20 * SCALE;
  const gap = 3 * SCALE;
  const h = chip + 2 * t.size("--sp-3");
  card(pen, x, y, w, h);
  const labelStyle: TextStyle = { size: t.size("--fs-md"), weight: 600, color: t.color("--text") };
  line(pen, b.label, x + pad, y + (h - labelStyle.size * LINE) / 2, w / 2, labelStyle);
  const fills = { W: t.color("--good"), D: t.color("--neutral"), L: t.color("--bad") };
  b.results.forEach((r, i) => {
    const left = x + w - pad - (b.results.length - i) * chip - (b.results.length - 1 - i) * gap;
    const top = y + t.size("--sp-3");
    box(pen, left, top, chip, chip, { fill: fills[r], radius: t.size("--r-sm") });
    const s: TextStyle = { size: t.size("--fs-sm"), weight: 700, color: t.color("--on-color"), align: "center" };
    line(pen, r, left + chip / 2, top + (chip - s.size * LINE) / 2, chip, s);
  });
  return h;
}
