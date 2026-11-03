// Cases worked out by hand for the third tax audit (2026-11-03), before the
// engine's output was read. Each entry carries its own working; the literals
// are the auditor's and are not touched to make a test pass: a difference is
// investigated first, and the literal moves only if the hand calculation
// was the wrong one.
//
// The configuration is written out in full (`CASE_SETTINGS`): two months for a
// fund as well as for a listed security, the treaty rate of the US, the 25 %
// limit. The cases were calculated when two months was the default for a fund;
// nothing here rides a default.
//
// Conventions: GP = capital gains and losses, RCM = movable capital income;
// every operation is rounded once (criterion #6).

import { describe, expect, it } from "vitest";
import * as cases from "./cases.js";
import type { Case } from "./short-form.js";
import { boxesOf, cents, deferredAtYearEnd, reportOf } from "./support.js";

interface Hand {
  id: string;
  case: Case;
  year: number;
  base: string;
  /** What is still to carry at the end of the year: `[origin year, category, amount]`. */
  pending?: [number, string, string][];
  /** What expired, unused, at the end of the year. */
  expired?: [number, string, string][];
  /** The loss still deferred by the wash-sale rule at 31/12 (a loss, so negative). */
  deferred?: string;
  /** Boxes of the 2025 form; see `boxesOf` for the keys. */
  boxes?: Record<string, string>;
}

const HAND: Hand[] = [
  // C01. Three monthly contributions to a fund, partial sale, FIFO.
  // Lots (value date): 5 x 100 = 500; 4 x 125 = 500; 6,25 x 80 = 500. Sale
  // 10/06/2025 of 10 x 130 = 1.300. FIFO (art. 37.2 LIRPF): 5 + 4 + 1 of 6,25
  // (80) = 1.080. Gain 220. 19 % withheld by the distributor: 41,80
  // (art. 101.6 LIRPF, art. 97 RIRPF).
  {
    id: "C01 fund, three contributions and a FIFO sale",
    case: cases.c01,
    year: 2025,
    base: "220.00",
    boxes: {
      "0312": "1300.00",
      "0315": "1080.00",
      "0316": "220.00",
      "0320": "220.00",
      "0324": "220.00",
      "0424": "220.00",
      "0460": "220.00",
      "0603": "41.80",
    },
  },
  // C02. Accumulating ETF, fees, two purchases on the same day.
  // 15/01: 10 x 50 + 1 = 501; 15/01: 4 x 50,5 + 1 = 203; 14/02: 10 x 55 + 1 = 551.
  // Sale 15/09: 12 x 60 - 1,25 = 718,75 (art. 35: the selling fee subtracts).
  // FIFO, same date by order of registration: 501 + 2/4 x 203 = 602,50.
  // Gain 116,25.
  {
    id: "C02 ETF, fees and two purchases on the same day",
    case: cases.c02,
    year: 2025,
    base: "116.25",
    boxes: {
      "2227": "718.75",
      "2229": "602.50",
      "2230": "116.25",
      "2232": "116.25",
      "2235": "116.25",
      "0460": "116.25",
    },
  },
  // C03. Partial transfer between Spanish funds, then sale of the destination.
  // A: 10/05/2021 10 x 100 = 1.000; 10/05/2023 10 x 80 = 800. Transfer
  // 10/04/2024: 15 A leave (FIFO: 10 of 2021 and 5 of 2023, cost 1.000 + 400)
  // and 18 B come in. Art. 94.1.a LIRPF: no income, B inherits date and cost:
  // 12 B (1.000, 2021) and 6 B (400, 2023). Base 2024: 0 (next test).
  // Sale 10/07/2025 of 15 B x 110 = 1.650; cost 1.000 + 3/6 x 400 = 1.200.
  // Gain 450; 19 % withheld: 85,50.
  {
    id: "C03 transfer, sale of the destination (2025)",
    case: cases.c03,
    year: 2025,
    base: "450.00",
    boxes: {
      "0312": "1650.00",
      "0315": "1200.00",
      "0316": "450.00",
      "0460": "450.00",
      "0603": "85.50",
    },
  },
  {
    id: "C03 transfer (2024): not a sale, no income",
    case: cases.c03,
    year: 2024,
    base: "0.00",
  },
  // C04. Non-transferable Luxembourg fund: a change of fund is sale + purchase.
  // 03/03/2023 20 x 50 = 1.000. Sale 07/05/2025 20 x 40 = 800: -200. The other
  // fund bought afterwards is not homogeneous: nothing is deferred. Base 0, 200
  // pending from 2025 (annex C.3, box 1270).
  {
    id: "C04 non-transferable fund, loss not deferred",
    case: cases.c04,
    year: 2025,
    base: "0.00",
    pending: [[2025, "capital_gain", "-200.00"]],
    deferred: "0.00",
    boxes: {
      "0312": "800.00",
      "0315": "1000.00",
      "0321": "200.00",
      "0322": "200.00",
      "0325": "200.00",
      "0423": "200.00",
      "0425": "200.00",
      "0460": "0.00",
      "1270#2025": "200.00",
    },
  },
  // C05. Distributing ETFs and interest.
  // IBKR ETF: 60 (Ireland withholds nothing). MyInvestor ETF: 40, 7,60 withheld
  // in Spain. Interest: 25, 4,75 withheld.
  {
    id: "C05 dividends of distributing ETFs and interest",
    case: cases.c05,
    year: 2025,
    base: "125.00",
    boxes: {
      "0027": "25.00",
      "0029": "100.00",
      "0036": "125.00",
      "0038": "125.00",
      "0041": "125.00",
      "0429": "125.00",
      "0460": "125.00",
      "0597": "12.35",
    },
  },
  // C07. Share bought and sold in USD with the dollar falling, back to euros.
  // 1.200 EUR -> 1.260 USD (1,05); buy 10 x 126 USD (1,05); sell 10 x 126 USD
  // (1,20); 1.260 USD -> 1.050 EUR. Share, first in the currency (V1740-17):
  // (1.260 - 1.260) / 1,20 = 0. Currency: the lot of 1.260 USD at 1.200 EUR
  // travels through the share; converting, 1.050 - 1.200 = -150. Economic loss
  // 1.200 -> 1.050 = -150. Base 0, 150 pending. The share is Nasdaq-listed:
  // "other elements", key 2.
  {
    id: "C07 USD share and a falling dollar",
    case: cases.c07,
    year: 2025,
    base: "0.00",
    pending: [[2025, "capital_gain", "-150.00"]],
    boxes: {
      "1633@ast_xyz": "1050.00",
      "1637@ast_xyz": "1050.00",
      "1640@ast_xyz": "0.00",
      "1633@USD": "1050.00",
      "1637@USD": "1200.00",
      "1638@USD": "150.00",
      "0385": "150.00",
      "0425": "150.00",
      "1270#2025": "150.00",
    },
  },
  // C08. Repurchase on the last day of the window and the day after.
  // 03/06/2024 20 x 100. Sale 14/03/2025 20 x 80: -400. Repurchase 14/05/2025
  // (10): the last day of the two months, date to date, counts (art. 33.5.f
  // LIRPF, art. 5 Civil Code): 10/20 x 400 = 200 deferred, -200 computes.
  // 15/05 (5): one day outside, nothing deferred. Sale 01/10 of 10 (FIFO: the
  // lot of 14/05, 820) x 90 = 900: +80; no homogeneous securities in its window,
  // so it releases -200: -120. GP 2025 -320. Base 0, 320 pending. Nothing is
  // left deferred at 31/12.
  {
    id: "C08 repurchase on the last day of the window and the day after",
    case: cases.c08,
    year: 2025,
    base: "0.00",
    pending: [[2025, "capital_gain", "-320.00"]],
    deferred: "0.00",
    boxes: {
      "2233@2025-03-14": "400.00",
      "2234@2025-03-14": "400.00",
      "2230@2025-10-01": "80.00",
      "2227@2025-10-01": "900.00",
      "2229@2025-10-01": "820.00",
      "2236": "400.00",
      "0425": "320.00",
      "1270#2025": "320.00",
    },
  },
  // C09. Fund: redemption at a loss and an incoming transfer 19 days later.
  // G: 01/02/2024 10 x 100. Redemption 01/04/2025 10 x 90: -100. Incoming
  // transfer 20/04/2025 of 5 G (from H, cost 400 of 2023) counts as an
  // acquisition (criterion #2b): 5/10 x 100 = 50 deferred. GP -50.
  {
    id: "C09 fund redemption and an incoming transfer 19 days later",
    case: cases.c09,
    year: 2025,
    base: "0.00",
    pending: [[2025, "capital_gain", "-50.00"]],
    deferred: "-50.00",
    boxes: {
      "0321": "100.00",
      "0322": "50.00",
      "0325": "50.00",
      "0425": "50.00",
    },
  },
  // C10 (2023). 2020: ETF A -300. 2021: ETF B -1.000. 2023: interest 100.
  // RCM 100; the pending GP offsets up to 25 % = 25, oldest first, 2020
  // (art. 49.1.b, last paragraph). Base 75; 2020 -275 and 2021 -1.000 remain.
  {
    id: "C10 offset and carry-forward (2023)",
    case: cases.c10,
    year: 2023,
    base: "75.00",
    pending: [
      [2020, "capital_gain", "-275.00"],
      [2021, "capital_gain", "-1000.00"],
    ],
  },
  // C10 (2025). Fund +600; ETC -100 (RCM, art. 25.2, V0267-25); interest 400.
  // RCM = 400 - 100 = 300. 2020 expired (its four years are 2021-2024). 2021
  // (last year): 600 against GP without limit; 75 (25 % of 300) against RCM;
  // 325 expire. Base 225.
  {
    id: "C10 offset, expiry and ETC loss (2025)",
    case: cases.c10,
    year: 2025,
    base: "225.00",
    pending: [],
    expired: [[2021, "capital_gain", "-325.00"]],
    boxes: {
      "0027": "400.00",
      "0031": "-100.00",
      "0036": "300.00",
      "0424": "600.00",
      "0429": "300.00",
      "0439#2021": "600.00",
      "0453#2021": "75.00",
      "0460": "225.00",
      "1259#2021": "1000.00",
      "1260#2021": "675.00",
      "0597": "76.00",
      "0603": "114.00",
    },
  },
  // C11. Reverse split 1:10 with the fraction paid in cash.
  // 25 x 8 + 2 = 202. After the split 2,5 titles with the same cost and date.
  // Fraction 0,5 x 85 = 42,50; cost 202 x 0,5/2,5 = 40,40: +2,10. Sale of
  // 2 x 90 - 2 = 178; cost 161,60: +16,40. Base 18,50.
  {
    id: "C11 reverse split with cash in lieu",
    case: cases.c11,
    year: 2025,
    base: "18.50",
    boxes: {
      "0328@2025-02-10": "42.50",
      "0331@2025-02-10": "40.40",
      "0332@2025-02-10": "2.10",
      "0328@2025-09-01": "178.00",
      "0331@2025-09-01": "161.60",
      "0332@2025-09-01": "16.40",
      "0339": "18.50",
      "0460": "18.50",
    },
  },
  // C12. Merger under the special regime, odd lots and cash compensation.
  // 30 S x 20 = 600 (2023). Exchange 1 T for 4 S -> 7,5 T with the cost and
  // date of S (art. 81.2 LIS). Compensation of 18 lowers the value of what is
  // received: 582. Odd lot 0,5 T x 50 = 25; cost 582 x 0,5/7,5 = 38,80: -13,80
  // (a sale made by the custodian). Sale of 7 T x 90 = 630; cost 543,20: +86,80.
  // Base 73,00 = 25 + 18 + 630 - 600.
  {
    id: "C12 merger, odd lots and cash compensation",
    case: cases.c12,
    year: 2025,
    base: "73.00",
    boxes: {
      "0328@2025-06-02": "25.00",
      "0331@2025-06-02": "38.80",
      "0337@2025-06-02": "13.80",
      "0328@2025-10-01": "630.00",
      "0331@2025-10-01": "543.20",
      "0332@2025-10-01": "86.80",
      "0460": "73.00",
    },
  },
  // C13. Bonus shares (1 for 25) on two lots.
  // 100 x 10 (2024-03) and 50 x 12 (2024-10). Bonus: 104 and 52 titles with the
  // same cost and the age of each lot (art. 37.1.a LIRPF). Sale of 110 x 11 =
  // 1.210: 104 (1.000) + 6/52 x 600 (69,23) = 1.069,23. Gain 140,77.
  {
    id: "C13 bonus shares on two lots",
    case: cases.c13,
    year: 2025,
    base: "140.77",
    boxes: {
      "0328": "1210.00",
      "0331": "1069.23",
      "0332": "140.77",
      "0460": "140.77",
    },
  },
  // C14. Return of share premium of a Spanish share (art. 25.1.e LIRPF).
  // 100 x 5 = 500 (2024) and 50 x 0,20 = 10 (2025). Return of 0,30 per title
  // (45): lot 1 500 - 30 = 470; lot 2 10 - 15 -> 0 and the excess of 5 is RCM,
  // without withholding. Sale of 150 x 5,10 = 765; cost 470: +295. Base 300
  // (GP 295 + RCM 5).
  {
    id: "C14 return of share premium",
    case: cases.c14,
    year: 2025,
    base: "300.00",
    boxes: {
      "0029": "5.00",
      "0328": "765.00",
      "0331": "470.00",
      "0332": "295.00",
      "0460": "300.00",
    },
  },
  // C16. Gold ETC in USD (RCM, V0267-25).
  // 1.100 EUR -> 1.210 USD (1,10); buy 10 x 121 USD (1,10). Sale 2025 10 x 150
  // USD (1,08) = 1.388,89; conversion of 1.500 USD at 1,08 = 1.388,89.
  // ETC, first in the currency: (1.500 - 1.210) / 1,08 = 268,52 (box 0031).
  // Currency on conversion: 1.388,89 - (1.100 + 268,52) = +20,37 (GP).
  // Total 288,89 = 1.388,89 - 1.100. Base 288,89.
  {
    id: "C16 gold ETC in USD",
    case: cases.c16,
    year: 2025,
    base: "288.89",
    boxes: {
      "0031": "268.52",
      "0036": "268.52",
      "1633@USD": "1388.89",
      "1637@USD": "1368.52",
      "1640@USD": "20.37",
      "0386": "20.37",
      "0460": "288.89",
    },
  },
  // C17. Bitcoin ETP (RCM) with a partial repurchase.
  // 10 x 60 = 600. Sale 03/02/2025 10 x 45 = 450: -150. Repurchase 03/03/2025
  // of 4 defers 4/10 = 60 (art. 25.2.b, last paragraph, two months without
  // looking at the market). RCM: interest 300 - 90 = 210. Base 210.
  {
    id: "C17 bitcoin ETP, partial repurchase",
    case: cases.c17,
    year: 2025,
    base: "210.00",
    deferred: "-60.00",
    boxes: {
      "0027": "300.00",
      "0031": "-90.00",
      "0036": "210.00",
      "0460": "210.00",
      "0597": "57.00",
    },
  },
  // C18 (2025). Negative RCM that offsets 25 % of the gains.
  // ETC -400 (RCM); fund +1.000. The negative RCM offsets up to 25 % of 1.000 =
  // 250 (box 0436). Base 750; 150 of RCM of 2025 remain (box 1283). The form
  // sends a negative balance of box 0429 to box 0430.
  {
    id: "C18 negative RCM against gains (2025)",
    case: cases.c18,
    year: 2025,
    base: "750.00",
    pending: [[2025, "movable_capital", "-150.00"]],
    boxes: {
      "0031": "-400.00",
      "0430": "400.00",
      "0424": "1000.00",
      "0436": "250.00",
      "0460": "750.00",
      "1283#2025": "150.00",
      "0603": "190.00",
    },
  },
  // C18 (2026). Interest 100; what is pending of RCM offsets against RCM
  // without limit: 100. Base 0; 50 remain.
  {
    id: "C18 the carry-forward against interest (2026)",
    case: cases.c18,
    year: 2026,
    base: "0.00",
    pending: [[2025, "movable_capital", "-50.00"]],
  },
  // C19. USD ETF (IIC, criterion 4:iic).
  // 1.152,38 EUR -> 1.210 USD (1,05). ETF 10 x 121 USD at 1,10 = 1.100. Sale
  // 2025 10 x 150 USD at 1,08 = 1.388,89. ETF, each leg at its own rate:
  // 1.388,89 - 1.100 = 288,89. Exchange difference of the invested currency,
  // imputed on the sale: 1.100 - 1.152,38 = -52,38. Conversion of 1.500 USD at
  // 1,08: 0. Total 236,51 = 1.388,89 - 1.152,38.
  {
    id: "C19 USD ETF, each leg at its own rate",
    case: cases.c19,
    year: 2025,
    base: "236.51",
    boxes: {
      "2227": "1388.89",
      "2229": "1100.00",
      "2230": "288.89",
      "1633@2025-04-01": "1100.00",
      "1637@2025-04-01": "1152.38",
      "1638@2025-04-01": "52.38",
      "0385": "52.38",
      "0460": "236.51",
    },
  },
  // C21. USD share with the dollar bought at another rate.
  // 1.152,38 EUR -> 1.210 USD (1,05). Buy 10 x 121 USD (1,10). Sale 2025 10 x
  // 150 USD (1,08). Conversion at 1,08. Share, first in the currency:
  // (1.500 - 1.210) / 1,08 = 268,52 (to "other elements", key 2, being
  // Nasdaq-listed; the classification is doubtful but the total is not).
  // Currency on conversion: 1.388,89 - (1.152,38 + 268,52) = -32,01.
  // Total 236,51, as in C19 by another road.
  {
    id: "C21 USD share, dollar bought at another rate",
    case: cases.c21,
    year: 2025,
    base: "236.51",
    boxes: {
      "1633@2025-04-01": "1388.89",
      "1637@2025-04-01": "1120.37",
      "1640@2025-04-01": "268.52",
      "1633@2025-04-02": "1388.89",
      "1637@2025-04-02": "1420.90",
      "1638@2025-04-02": "32.01",
      "0385": "32.01",
      "0460": "236.51",
    },
  },
];

const triples = (
  list: { origin_year: number; category: string; amount_eur: Parameters<typeof cents>[0] }[],
) => list.map((p) => [p.origin_year, p.category, cents(p.amount_eur)]);

describe("the cases of the third audit, worked out by hand", () => {
  describe.each(HAND)("$id", (hand) => {
    const report = reportOf(hand.case, hand.year);

    it("gives the base of the savings", () => {
      expect(cents(report.base_eur)).toBe(hand.base);
      expect(cents(report.compensation.base_eur)).toBe(hand.base);
    });

    if (hand.pending !== undefined) {
      it("carries forward what is left to offset", () => {
        expect(triples(report.compensation.pending)).toEqual(hand.pending);
      });
    }

    if (hand.expired !== undefined) {
      it("lets expire what could not be offset in time", () => {
        expect(triples(report.compensation.expired)).toEqual(hand.expired);
      });
    }

    if (hand.deferred !== undefined) {
      it("leaves deferred at 31/12 what the repurchases carry", () => {
        expect(deferredAtYearEnd(report)).toBe(hand.deferred);
      });
    }

    if (hand.boxes !== undefined) {
      it("lays the figures out by box", () => {
        const { at } = boxesOf(hand.case, hand.year);
        const found = Object.fromEntries(
          Object.keys(hand.boxes ?? {}).map((key) => [key, at(key)]),
        );
        expect(found).toEqual(hand.boxes);
      });
    }
  });
});
