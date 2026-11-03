// The common layout of every mail: the two versions say the same, the HTML escapes what it is
// given and carries nothing remote nor traceable, and no mail writes a date the ISO way.

import { describe, expect, it } from "vitest";
import { composeMail, FOOTER, type MailDocument } from "../../src/jobs/mail/layout.js";
import { NOTICE_CODES, noticeMail } from "../../src/jobs/mail/notice.js";
import {
  informativeMail,
  taxReturnMail,
  weeklyReviewMail,
  weeklyReviewUnavailableMail,
} from "../../src/jobs/mail/periodic.js";
import { reminderMail } from "../../src/jobs/mail/reminder.js";
import { reminderFacts } from "../../src/jobs/reminder.js";
import { Decimal } from "../../src/money/decimal.js";
import type { MailMessage } from "../../src/ports/notifier.js";

const ORIGIN = "https://atlas.example.test";

const DOC: MailDocument = {
  subject: "[Atlas] Prueba",
  kicker: "Atlas · Prueba",
  title: "Título <b>",
  warnings: ["Ojo & <script>alert(1)</script>"],
  sections: [
    {
      heading: 'Sección "uno"',
      blocks: [
        { kind: "paragraph", text: "Párrafo 'con' comillas." },
        {
          kind: "rows",
          rows: [
            { label: "Renta variable", values: ["70,0 %", "630,00 €"] },
            { label: "Oro", values: ["5,0 %"] },
          ],
        },
        { kind: "command", text: "atlas backup --to <dir>" },
      ],
    },
    { blocks: [{ kind: "paragraph", text: "Sin título." }] },
  ],
};

describe("the common layout of the mails", () => {
  const mail = composeMail(DOC, ORIGIN);

  it("writes the text version with nothing aligned by spaces, and the same link and footer", () => {
    expect(mail.body).toBe(
      [
        "TÍTULO <B>",
        "",
        "Aviso. Ojo & <script>alert(1)</script>",
        "",
        'Sección "uno"',
        "Párrafo 'con' comillas.",
        "- Renta variable: 70,0 % (630,00 €)",
        "- Oro: 5,0 %",
        "atlas backup --to <dir>",
        "",
        "Sin título.",
        "",
        `Abrir Atlas: ${ORIGIN}`,
        "",
        "--",
        FOOTER,
        "",
      ].join("\n"),
    );
  });

  it("escapes everything it writes into the HTML", () => {
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<b>");
    expect(mail.html).toContain("Título &lt;b&gt;");
    expect(mail.html).toContain("Ojo &amp; &lt;script&gt;");
    expect(mail.html).toContain("Sección &quot;uno&quot;");
    expect(mail.html).toContain("Párrafo &#39;con&#39; comillas.");
    expect(mail.html).toContain("atlas backup --to &lt;dir&gt;");
    expect(mail.html).toContain(">Abrir Atlas</a>");
    // A figure never breaks from its unit on a narrow screen.
    expect(mail.html).toContain(">630,00&nbsp;€</td>");
    expect(mail.html).toContain(">5,0&nbsp;%</td>");
  });

  it("carries nothing remote and one link only, to the origin as it is", () => {
    expect(mail.html).not.toMatch(
      /<img|<script|<link|<form|<iframe|src=|url\(|@import|@font-face/i,
    );
    expect(mail.html.match(/href="/g)).toHaveLength(1);
    expect(mail.html).toContain(`href="${ORIGIN}"`);
  });

  it("drops the link, in both versions, when the origin is not a bare https address", () => {
    for (const origin of [
      "",
      "http://atlas.example.test",
      "javascript:alert(1)",
      "https://atlas.example.test/?u=1",
      "https://atlas.example.test/#x",
      'https://a.example"onclick="x',
    ]) {
      const bare = composeMail(DOC, origin);
      expect(bare.html, origin).not.toContain("href=");
      expect(bare.body, origin).not.toContain("Abrir Atlas");
    }
  });
});

const UPKEEP = { missingCpi: 2026, staleProfiles: ["MSCI World"], staleFunds: 2 };

/** Every mail Atlas writes, in its variants. */
const everyMail = (): MailMessage[] => {
  const facts = reminderFacts({
    period: "2026-10",
    today: "2026-10-01",
    plan: { failure: "ledger_unreadable" },
    webSignIn: "2026-05-04",
    idleWarningDays: 150,
    repurchase: 2,
    taxDeadlines: [
      {
        kind: "filing",
        year: 2025,
        filing_end: "2026-06-30",
        direct_debit_end: "2026-06-25",
      },
      { kind: "second_instalment", year: 2025, due: "2026-11-05", direct_debit_end: "2026-11-02" },
      { kind: "unverified", year: 2026, deadline: "filing" },
    ],
  });
  const notices = NOTICE_CODES.flatMap((code) =>
    ["2026-10-02", "2026-W41", "2026-10", "2026-Q4", "2026"].flatMap((period) =>
      [
        "ecb_update",
        "prices_update",
        "monthly_backup",
        "quarterly_integrity",
        "eodhd",
        "bucket",
        "prices",
        "ecb",
        "backup",
        "integrity",
      ].map((subject) =>
        noticeMail({ code, subject }, { since: "2026-10-01", period, counts: {} }, ORIGIN),
      ),
    ),
  ).filter((mail): mail is MailMessage => mail !== undefined);
  const review = {
    deviations: [
      { asset_class: "equity", deviation_pp: Decimal.parse("6"), threshold_pp: Decimal.parse("5") },
    ],
    rules: [],
    unmeasured: [],
  } as const;
  return [
    reminderMail(facts, "off", ORIGIN),
    reminderMail(facts, "on", ORIGIN),
    weeklyReviewMail(review, "on", "2026-W41", ORIGIN),
    weeklyReviewMail(review, "off", "2026-10", ORIGIN),
    weeklyReviewUnavailableMail("2026-W41", "ledger_unavailable", ORIGIN),
    taxReturnMail({ ok: true, year: 2026, notes: 1, disputed: 0 }, UPKEEP, ORIGIN),
    taxReturnMail({ ok: false, year: 2026, code: "tax_failed" }, UPKEEP, ORIGIN),
    informativeMail({ year: 2026, invalid: false, models: ["720"] }, ORIGIN) as MailMessage,
    ...notices,
  ];
};

describe("every mail of Atlas", () => {
  const mails = everyMail();

  it("is written through the layout, in its two versions", () => {
    expect(mails.length).toBeGreaterThan(NOTICE_CODES.length);
    for (const mail of mails) {
      expect(mail.body, mail.subject).toContain(FOOTER);
      expect(mail.html, mail.subject).toContain("<!doctype html>");
    }
  });

  it("says its dates and periods the Spanish way, never as ISO", () => {
    // A path of the bucket (`backups/2026-10/`) is a name, not a date said to a person.
    const iso = /(?<![/\d])\d{4}-(\d{2}-\d{2}|W\d{2}|Q[1-4]|\d{2})(?![\d/])/;
    for (const mail of mails) {
      for (const text of [mail.subject, mail.body, mail.html]) {
        expect(text, mail.subject).not.toMatch(iso);
      }
    }
  });

  it("keeps an ASCII subject, and an HTML far from the size at which Gmail clips a mail", () => {
    for (const mail of mails) {
      expect(/^[\x20-\x7e]+$/.test(mail.subject), mail.subject).toBe(true);
      expect(new TextEncoder().encode(mail.html).length, mail.subject).toBeLessThan(20_000);
    }
  });
});
