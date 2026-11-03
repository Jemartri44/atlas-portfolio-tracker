// The one composition every mail of Atlas goes through: a structured mail —
// a kicker, a title, warnings, sections of paragraphs, rows and commands —
// written twice from the same pieces, as plain text (the fallback, readable in
// a proportional font: nothing aligned with spaces) and as a simple HTML page
// with the colours of direction A (`apps/web/src/styles/tokens.css`).
//
// The HTML is the kind every client renders: tables for the layout, every
// style inline, no image, no remote font, no script, no form, and one link
// only, the origin of the app as it is configured, with nothing appended to
// it — nothing a mail could be traced by. A `<style>` block repaints it in
// the dark for the clients that honour `prefers-color-scheme`; the rest keep
// the light colours or invert them by themselves, and both read.
//
// What a section may say is decided by each redaction (no amounts unless the
// switch is on); this module only writes, and escapes, what it is given.

import type { MailMessage } from "../../ports/notifier.js";

export type MailBlock =
  /** A sentence or two. */
  | { readonly kind: "paragraph"; readonly text: string }
  /** A short list of rows: a label and one or two values, aligned in a table in the HTML. */
  | {
      readonly kind: "rows";
      readonly rows: readonly { readonly label: string; readonly values: readonly string[] }[];
    }
  /** An order to type, in a monospaced box. */
  | { readonly kind: "command"; readonly text: string };

export interface MailSection {
  readonly heading?: string;
  readonly blocks: readonly MailBlock[];
}

export interface MailDocument {
  /** ASCII: the subject is a header, and some clients still mangle what is not. */
  readonly subject: string;
  /** The small line above the title: what kind of mail this is. */
  readonly kicker: string;
  readonly title: string;
  /** What needs a look, first and in the colour of a caution. */
  readonly warnings?: readonly string[];
  readonly sections: readonly MailSection[];
}

export const FOOTER =
  "Correo automático de Atlas. Los importes salen solo con el interruptor activado; nunca nombres de activos ni cuentas.";

const LINK_LABEL = "Abrir Atlas";

/** The origin as a link only when it is one: `https://` and nothing a mail could be traced by. */
const linkOf = (origin: string): string | undefined =>
  /^https:\/\/[a-z0-9.-]+(:\d{1,5})?\/?$/i.test(origin) ? origin : undefined;

// ---- Text ------------------------------------------------------------------

const textBlock = (block: MailBlock): string[] => {
  switch (block.kind) {
    case "paragraph":
      return [block.text];
    case "rows":
      return block.rows.map(
        (row) =>
          `- ${row.label}: ${row.values[0] ?? ""}${row.values.length > 1 ? ` (${row.values.slice(1).join(", ")})` : ""}`,
      );
    case "command":
      return [block.text];
  }
};

const textOf = (mail: MailDocument, link: string | undefined): string =>
  [
    mail.title.toLocaleUpperCase("es"),
    "",
    ...(mail.warnings ?? []).flatMap((warning) => [`Aviso. ${warning}`, ""]),
    ...mail.sections.flatMap((section) => [
      ...(section.heading === undefined ? [] : [section.heading]),
      ...section.blocks.flatMap(textBlock),
      "",
    ]),
    ...(link === undefined ? [] : [`${LINK_LABEL}: ${link}`, ""]),
    "--",
    FOOTER,
    "",
  ].join("\n");

// ---- HTML ------------------------------------------------------------------

/** The colours of direction A, light and dark (`tokens.css`). */
const LIGHT = {
  canvas: "#f3f1ea",
  sheet: "#fffdf8",
  border: "#e2ded3",
  text: "#1c1b18",
  muted: "#54524c",
  meta: "#66645d",
  accent: "#1f4f7c",
  fill: "#efece4",
  caution: "#80530a",
  cautionSoft: "#faf0dc",
  cautionBorder: "#ecd6a8",
} as const;

const DARK_STYLE = `@media (prefers-color-scheme: dark){
.a-canvas{background:#141412!important}
.a-sheet{background:#1d1c19!important;border-color:#30302d!important}
.a-text{color:#edece8!important}
.a-muted{color:#bdbbb4!important}
.a-rule{border-color:#30302d!important}
.a-warn{background:#352a14!important;color:#e8b659!important;border-color:#5a4520!important}
.a-link{color:#8fb6e3!important}
.a-code{background:#2a2a27!important;color:#edece8!important}
}`;

const SANS = "'Segoe UI',Roboto,-apple-system,'Helvetica Neue',Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";
const MONO = "ui-monospace,Menlo,Consolas,monospace";

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    // A figure never breaks from its unit: `100,00 €`, `5,0 %`.
    .replace(/(\d) (€|%)/g, "$1&nbsp;$2");

const cell = (padding: string, content: string): string =>
  `<tr><td style="padding:${padding};font-family:${SANS};">${content}</td></tr>`;

const paragraph = (text: string): string =>
  `<p class="a-text" style="margin:0 0 6px 0;font-size:15px;line-height:1.45;color:${LIGHT.text};">${escapeHtml(text)}</p>`;

const rowsTable = (rows: Extract<MailBlock, { kind: "rows" }>["rows"]): string => {
  const rule = `border-bottom:1px solid ${LIGHT.border};`;
  const body = rows
    .map((row) => {
      const values = row.values
        .map(
          (value, index) =>
            `<td class="${index === 0 ? "a-text" : "a-muted"} a-rule" align="right" style="padding:7px 0 7px 12px;${rule}color:${index === 0 ? LIGHT.text : LIGHT.muted};white-space:nowrap;">${escapeHtml(value)}</td>`,
        )
        .join("");
      return `<tr><td class="a-text a-rule" style="padding:7px 0;${rule}color:${LIGHT.text};">${escapeHtml(row.label)}</td>${values}</tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;line-height:1.4;margin:0 0 8px 0;">${body}</table>`;
};

const command = (text: string): string =>
  `<div class="a-code" style="background:${LIGHT.fill};color:${LIGHT.text};border-radius:8px;padding:10px 12px;margin:0 0 6px 0;font-family:${MONO};font-size:13px;line-height:1.4;word-break:break-all;">${escapeHtml(text)}</div>`;

const htmlBlock = (block: MailBlock): string => {
  switch (block.kind) {
    case "paragraph":
      return paragraph(block.text);
    case "rows":
      return rowsTable(block.rows);
    case "command":
      return command(block.text);
  }
};

const warningBox = (text: string): string =>
  cell(
    "16px 20px 0 20px",
    `<div class="a-warn" style="background:${LIGHT.cautionSoft};color:${LIGHT.caution};border:1px solid ${LIGHT.cautionBorder};border-radius:10px;padding:12px 14px;font-size:15px;line-height:1.45;"><strong>Aviso.</strong> ${escapeHtml(text)}</div>`,
  );

const sectionOf = (section: MailSection): string =>
  cell(
    "20px 20px 0 20px",
    (section.heading === undefined
      ? ""
      : `<h2 class="a-text" style="margin:0 0 8px 0;font-size:17px;font-weight:600;color:${LIGHT.text};">${escapeHtml(section.heading)}</h2>`) +
      section.blocks.map(htmlBlock).join(""),
  );

const htmlOf = (mail: MailDocument, link: string | undefined): string =>
  [
    '<!doctype html><html lang="es"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">',
    `<title>${escapeHtml(mail.subject)}</title><style>${DARK_STYLE}</style></head>`,
    `<body class="a-canvas" style="margin:0;padding:0;background:${LIGHT.canvas};">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="a-canvas" style="background:${LIGHT.canvas};"><tr><td align="center" style="padding:16px 12px;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="a-sheet" style="max-width:560px;background:${LIGHT.sheet};border:1px solid ${LIGHT.border};border-radius:14px;">`,
    cell(
      "20px 20px 4px 20px",
      `<div class="a-muted" style="font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:${LIGHT.muted};">${escapeHtml(mail.kicker)}</div>` +
        `<h1 class="a-text" style="margin:6px 0 0 0;font-family:${SERIF};font-weight:600;font-size:24px;line-height:1.2;color:${LIGHT.text};">${escapeHtml(mail.title)}</h1>`,
    ),
    ...(mail.warnings ?? []).map(warningBox),
    ...mail.sections.map(sectionOf),
    link === undefined
      ? cell("0 20px 20px 20px", "")
      : cell(
          "20px 20px 20px 20px",
          `<a class="a-link" href="${escapeHtml(link)}" style="color:${LIGHT.accent};font-size:16px;font-weight:600;text-decoration:underline;">${LINK_LABEL}</a>`,
        ),
    "</table>",
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;"><tr><td class="a-muted" style="padding:12px 20px;font-family:${SANS};font-size:13px;line-height:1.4;color:${LIGHT.meta};">${escapeHtml(FOOTER)}</td></tr></table>`,
    "</td></tr></table></body></html>",
  ].join("\n");

/** The mail, in its two versions, from one structure. */
export const composeMail = (mail: MailDocument, origin: string): MailMessage => {
  const link = linkOf(origin);
  return { subject: mail.subject, body: textOf(mail, link), html: htmlOf(mail, link) };
};
