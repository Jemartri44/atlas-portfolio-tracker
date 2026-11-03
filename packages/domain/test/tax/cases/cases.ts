// The ledgers of the cases of the third audit, in the short form of
// `short-form.ts`. Each one is worked out by hand in the test that uses it.
// Everything is synthetic.

import {
  acc,
  asset,
  buy,
  type Case,
  corporateAction,
  deposit,
  dividend,
  fx,
  interest,
  sell,
  thesis,
  transfer,
  valuation,
} from "./short-form.js";

export const c01: Case = {
  accounts: [acc("acc_mi", "myinvestor", "ES")],
  assets: [asset("ast_f1", "fund", { isin: "XX0000000101", transferable: true })],
  events: [
    deposit("acc_mi", "2024-01-08", "1500"),
    buy("acc_mi", "ast_f1", "2024-01-08", "5", "100", { vd: "2024-01-10", kind: "fund" }),
    buy("acc_mi", "ast_f1", "2024-02-08", "4", "125", { vd: "2024-02-12", kind: "fund" }),
    buy("acc_mi", "ast_f1", "2024-03-07", "6.25", "80", { vd: "2024-03-11", kind: "fund" }),
    sell("acc_mi", "ast_f1", "2025-06-06", "10", "130", {
      vd: "2025-06-10",
      kind: "fund",
      withholding: "41.80",
    }),
  ],
};

export const c02: Case = {
  accounts: [acc("acc_ibkr", "ibkr", "IE")],
  assets: [asset("ast_etf", "etf", { isin: "XX0000000201", market: "XETR", issuer_country: "IE" })],
  events: [
    deposit("acc_ibkr", "2025-01-14", "1300"),
    buy("acc_ibkr", "ast_etf", "2025-01-15", "10", "50", { vd: "2025-01-17", fee: "1" }),
    buy("acc_ibkr", "ast_etf", "2025-01-15", "4", "50.5", { vd: "2025-01-17", fee: "1" }),
    buy("acc_ibkr", "ast_etf", "2025-02-14", "10", "55", { vd: "2025-02-18", fee: "1" }),
    sell("acc_ibkr", "ast_etf", "2025-09-15", "12", "60", { vd: "2025-09-17", fee: "1.25" }),
  ],
};

export const c03: Case = {
  accounts: [acc("acc_mi", "myinvestor", "ES")],
  assets: [
    asset("ast_fa", "fund", { isin: "ES0000000301", transferable: true, issuer_country: "ES" }),
    asset("ast_fb", "fund", { isin: "ES0000000302", transferable: true, issuer_country: "ES" }),
  ],
  events: [
    deposit("acc_mi", "2021-05-06", "1800"),
    buy("acc_mi", "ast_fa", "2021-05-06", "10", "100", { vd: "2021-05-10", kind: "fund" }),
    buy("acc_mi", "ast_fa", "2023-05-08", "10", "80", { vd: "2023-05-10", kind: "fund" }),
    transfer(
      "acc_mi",
      "ast_fa",
      "15",
      "120",
      "2024-04-10",
      "acc_mi",
      "ast_fb",
      "18",
      "100",
      "2024-04-12",
    ),
    sell("acc_mi", "ast_fb", "2025-07-08", "15", "110", {
      vd: "2025-07-10",
      kind: "fund",
      withholding: "85.50",
    }),
  ],
};

export const c04: Case = {
  accounts: [acc("acc_ibkr", "ibkr", "IE")],
  assets: [
    asset("ast_lu", "fund", { isin: "LU0000000401", transferable: false, issuer_country: "LU" }),
    asset("ast_ie", "fund", { isin: "IE0000000402", transferable: false, issuer_country: "IE" }),
  ],
  events: [
    deposit("acc_ibkr", "2023-03-01", "1000"),
    buy("acc_ibkr", "ast_lu", "2023-03-01", "20", "50", { vd: "2023-03-03", kind: "fund" }),
    sell("acc_ibkr", "ast_lu", "2025-05-05", "20", "40", { vd: "2025-05-07", kind: "fund" }),
    buy("acc_ibkr", "ast_ie", "2025-05-07", "10", "80", { vd: "2025-05-09", kind: "fund" }),
  ],
};

/** The same change of fund as a `transfer`, which the ledger must refuse. */
export const c04b: Case = {
  accounts: [acc("acc_ibkr", "ibkr", "IE")],
  assets: [
    asset("ast_lu", "fund", { isin: "LU0000000401", transferable: false, issuer_country: "LU" }),
    asset("ast_ie", "fund", { isin: "IE0000000402", transferable: true, issuer_country: "IE" }),
  ],
  events: [
    deposit("acc_ibkr", "2023-03-01", "1000"),
    buy("acc_ibkr", "ast_lu", "2023-03-01", "20", "50", { vd: "2023-03-03", kind: "fund" }),
  ],
};
export const c04bTransfer = transfer(
  "acc_ibkr",
  "ast_lu",
  "20",
  "40",
  "2025-05-07",
  "acc_ibkr",
  "ast_ie",
  "10",
  "80",
  "2025-05-09",
);

export const c05: Case = {
  accounts: [acc("acc_ibkr", "ibkr", "IE"), acc("acc_mi", "myinvestor", "ES")],
  assets: [
    asset("ast_etfd", "etf", { isin: "IE0000000501", market: "XETR", issuer_country: "IE" }),
    asset("ast_etfd2", "etf", { isin: "IE0000000502", market: "XMAD", issuer_country: "IE" }),
  ],
  events: [
    deposit("acc_ibkr", "2024-06-03", "3000"),
    deposit("acc_mi", "2024-06-03", "2000"),
    buy("acc_ibkr", "ast_etfd", "2024-06-03", "100", "30"),
    buy("acc_mi", "ast_etfd2", "2024-06-03", "50", "40"),
    dividend("acc_ibkr", "ast_etfd", "2025-03-26", "60", { country: "IE" }),
    dividend("acc_mi", "ast_etfd2", "2025-06-26", "40", { spain: "7.60", country: "IE" }),
    interest("acc_mi", "2025-12-31", "25", "4.75"),
  ],
};

export const c06: Case = {
  accounts: [acc("acc_cubo", "ibkr", "IE", "bucket")],
  assets: [
    asset("ast_acme", "stock", {
      book: "bucket",
      isin: "US0000000601",
      cur: "USD",
      market: "XNYS",
      issuer_country: "US",
    }),
  ],
  events: [
    thesis("th_acme", "acc_cubo", "ast_acme", "2025-01-09"),
    deposit("acc_cubo", "2025-01-09", "2000"),
    fx("acc_cubo", "2025-01-10", "2000", "EUR", "1", "2100", "USD", "1.05"),
    buy("acc_cubo", "ast_acme", "2025-01-13", "20", "100", {
      cur: "USD",
      fx: "1.04",
      fee: "1",
      thesis: "th_acme",
      vd: "2025-01-14",
    }),
    dividend("acc_cubo", "ast_acme", "2025-06-12", "30", {
      cur: "USD",
      fx: "1.15",
      origin: "4.50",
      country: "US",
    }),
    fx("acc_cubo", "2025-11-14", "124.5", "USD", "1.16", "107.33", "EUR", "1"),
  ],
};

export const c07: Case = {
  accounts: [acc("acc_cubo", "ibkr", "IE", "bucket")],
  assets: [
    asset("ast_xyz", "stock", {
      book: "bucket",
      isin: "US0000000701",
      cur: "USD",
      market: "XNAS",
      issuer_country: "US",
    }),
  ],
  events: [
    thesis("th_xyz", "acc_cubo", "ast_xyz", "2025-01-02"),
    deposit("acc_cubo", "2025-01-02", "1200"),
    fx("acc_cubo", "2025-01-02", "1200", "EUR", "1", "1260", "USD", "1.05"),
    buy("acc_cubo", "ast_xyz", "2025-01-03", "10", "126", {
      cur: "USD",
      fx: "1.05",
      thesis: "th_xyz",
    }),
    sell("acc_cubo", "ast_xyz", "2025-09-01", "10", "126", {
      cur: "USD",
      fx: "1.20",
      thesis: "th_xyz",
    }),
    fx("acc_cubo", "2025-09-03", "1260", "USD", "1.20", "1050", "EUR", "1"),
  ],
};

export const c08: Case = {
  accounts: [acc("acc_ibkr", "ibkr", "IE")],
  assets: [asset("ast_etf", "etf", { isin: "IE0000000801", market: "XETR", issuer_country: "IE" })],
  events: [
    deposit("acc_ibkr", "2024-06-03", "2000"),
    buy("acc_ibkr", "ast_etf", "2024-06-03", "20", "100"),
    sell("acc_ibkr", "ast_etf", "2025-03-14", "20", "80"),
    buy("acc_ibkr", "ast_etf", "2025-05-14", "10", "82"),
    buy("acc_ibkr", "ast_etf", "2025-05-15", "5", "83"),
    sell("acc_ibkr", "ast_etf", "2025-10-01", "10", "90"),
  ],
};

export const c09: Case = {
  accounts: [acc("acc_mi", "myinvestor", "ES")],
  assets: [
    asset("ast_g", "fund", { isin: "IE0000000901", transferable: true }),
    asset("ast_h", "fund", { isin: "IE0000000902", transferable: true }),
  ],
  events: [
    deposit("acc_mi", "2023-02-01", "1400"),
    buy("acc_mi", "ast_h", "2023-01-30", "4", "100", { vd: "2023-02-01", kind: "fund" }),
    buy("acc_mi", "ast_g", "2024-01-30", "10", "100", { vd: "2024-02-01", kind: "fund" }),
    sell("acc_mi", "ast_g", "2025-03-28", "10", "90", { vd: "2025-04-01", kind: "fund" }),
    transfer(
      "acc_mi",
      "ast_h",
      "4",
      "118.75",
      "2025-04-18",
      "acc_mi",
      "ast_g",
      "5",
      "95",
      "2025-04-20",
    ),
  ],
};

export const c10: Case = {
  accounts: [acc("acc_ibkr", "ibkr", "IE"), acc("acc_mi", "myinvestor", "ES")],
  assets: [
    asset("ast_etfa", "etf", { isin: "IE0000001001", market: "XETR" }),
    asset("ast_etfb", "etf", { isin: "IE0000001002", market: "XETR" }),
    asset("ast_fund", "fund", { isin: "ES0000001003", transferable: true }),
    asset("ast_etc", "etc", { cls: "gold", isin: "XS0000001004", market: "XETR" }),
  ],
  events: [
    deposit("acc_ibkr", "2020-01-15", "3700"),
    deposit("acc_mi", "2022-01-10", "1000"),
    buy("acc_ibkr", "ast_etfa", "2020-01-15", "10", "100"),
    buy("acc_ibkr", "ast_etfb", "2020-03-02", "10", "200"),
    sell("acc_ibkr", "ast_etfa", "2020-06-15", "10", "70"),
    sell("acc_ibkr", "ast_etfb", "2021-03-01", "10", "100"),
    buy("acc_mi", "ast_fund", "2022-01-07", "10", "100", { vd: "2022-01-10", kind: "fund" }),
    interest("acc_mi", "2023-06-30", "100", "19"),
    buy("acc_ibkr", "ast_etc", "2024-09-02", "10", "70"),
    sell("acc_mi", "ast_fund", "2025-05-02", "10", "160", {
      vd: "2025-05-05",
      kind: "fund",
      withholding: "114",
    }),
    sell("acc_ibkr", "ast_etc", "2025-08-01", "10", "60"),
    interest("acc_mi", "2025-12-31", "400", "76"),
  ],
};

export const c11: Case = {
  accounts: [acc("acc_cubo", "ibkr", "IE", "bucket")],
  assets: [
    asset("ast_de", "stock", {
      book: "bucket",
      isin: "DE0000001101",
      market: "XETR",
      issuer_country: "DE",
    }),
  ],
  events: [
    thesis("th_de", "acc_cubo", "ast_de", "2024-04-02"),
    deposit("acc_cubo", "2024-04-02", "202"),
    buy("acc_cubo", "ast_de", "2024-04-02", "25", "8", { fee: "2", thesis: "th_de" }),
    corporateAction("reverse_split", "ast_de", "2025-02-10", [
      { op: "scale", ratio: "1/10" },
      {
        op: "forced_sale",
        per_account: [{ account_id: "acc_cubo", quantity: "0.5" }],
        unit_price: "85",
        currency: "EUR",
        fx_rate: "1",
        fx_rate_date: "2025-02-10",
      },
    ]),
    sell("acc_cubo", "ast_de", "2025-09-01", "2", "90", { fee: "2", thesis: "th_de" }),
  ],
};

export const c12: Case = {
  accounts: [acc("acc_cubo", "ibkr", "IE", "bucket")],
  assets: [
    asset("ast_s", "stock", {
      book: "bucket",
      isin: "ES0000001201",
      market: "XMAD",
      issuer_country: "ES",
    }),
    asset("ast_t", "stock", {
      book: "bucket",
      isin: "ES0000001202",
      market: "XMAD",
      issuer_country: "ES",
    }),
  ],
  events: [
    thesis("th_s", "acc_cubo", "ast_s", "2023-05-05"),
    deposit("acc_cubo", "2023-05-05", "600"),
    buy("acc_cubo", "ast_s", "2023-05-05", "30", "20", { thesis: "th_s" }),
    corporateAction(
      "merger",
      "ast_s",
      "2025-06-02",
      [
        { op: "convert", to_asset_id: "ast_t", ratio: "1/4" },
        {
          op: "forced_sale",
          asset_id: "ast_t",
          per_account: [{ account_id: "acc_cubo", quantity: "0.5" }],
          unit_price: "50",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2025-06-02",
        },
        {
          op: "cost_adjustment",
          asset_id: "ast_t",
          per_account: [{ account_id: "acc_cubo", amount: "18" }],
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2025-06-02",
        },
      ],
      true,
    ),
    thesis("th_t", "acc_cubo", "ast_t", "2025-06-03"),
    sell("acc_cubo", "ast_t", "2025-10-01", "7", "90", { thesis: "th_t" }),
  ],
};

export const c13: Case = {
  accounts: [acc("acc_cubo", "ibkr", "IE", "bucket")],
  assets: [
    asset("ast_r", "stock", {
      book: "bucket",
      isin: "ES0000001301",
      market: "XMAD",
      issuer_country: "ES",
    }),
  ],
  events: [
    thesis("th_r", "acc_cubo", "ast_r", "2024-03-01"),
    deposit("acc_cubo", "2024-03-01", "1600"),
    buy("acc_cubo", "ast_r", "2024-03-01", "100", "10", { thesis: "th_r" }),
    buy("acc_cubo", "ast_r", "2024-10-01", "50", "12", { thesis: "th_r" }),
    corporateAction("stock_dividend", "ast_r", "2025-01-15", [{ op: "scale", ratio: "26/25" }]),
    sell("acc_cubo", "ast_r", "2025-07-01", "110", "11", { thesis: "th_r" }),
  ],
};

export const c14: Case = {
  accounts: [acc("acc_cubo", "ibkr", "IE", "bucket")],
  assets: [
    asset("ast_p", "stock", {
      book: "bucket",
      isin: "ES0000001401",
      market: "XMAD",
      issuer_country: "ES",
    }),
  ],
  events: [
    thesis("th_p", "acc_cubo", "ast_p", "2024-05-02"),
    deposit("acc_cubo", "2024-05-02", "510"),
    buy("acc_cubo", "ast_p", "2024-05-02", "100", "5", { thesis: "th_p" }),
    buy("acc_cubo", "ast_p", "2025-01-10", "50", "0.20", { thesis: "th_p" }),
    corporateAction("capital_return", "ast_p", "2025-04-01", [
      {
        op: "cost_adjustment",
        per_account: [{ account_id: "acc_cubo", amount: "45" }],
        currency: "EUR",
        fx_rate: "1",
        fx_rate_date: "2025-04-01",
      },
    ]),
    sell("acc_cubo", "ast_p", "2025-11-03", "150", "5.10", { thesis: "th_p" }),
  ],
};

/** The return of capital of a NYSE share, which the ledger must refuse (the last event). */
export const c14b: Case = {
  accounts: [acc("acc_cubo", "ibkr", "IE", "bucket")],
  assets: [
    asset("ast_us", "stock", {
      book: "bucket",
      isin: "US0000001402",
      cur: "USD",
      market: "XNYS",
      issuer_country: "US",
    }),
  ],
  events: [
    thesis("th_us", "acc_cubo", "ast_us", "2024-05-02"),
    deposit("acc_cubo", "2024-05-02", "1000"),
    fx("acc_cubo", "2024-05-02", "1000", "EUR", "1", "1100", "USD", "1.10"),
    buy("acc_cubo", "ast_us", "2024-05-02", "10", "100", {
      cur: "USD",
      fx: "1.10",
      thesis: "th_us",
    }),
  ],
};
export const c14bReturn = corporateAction("capital_return", "ast_us", "2025-04-01", [
  {
    op: "cost_adjustment",
    per_account: [{ account_id: "acc_cubo", amount: "30" }],
    currency: "USD",
    fx_rate: "1.08",
    fx_rate_date: "2025-04-01",
  },
]);

export const c15: Case = {
  accounts: [acc("acc_ibkr", "ibkr", "IE"), acc("acc_mi", "myinvestor", "ES")],
  assets: [
    asset("ast_w", "etf", { isin: "IE0000001501", market: "XETR", issuer_country: "IE" }),
    asset("ast_f", "fund", { isin: "IE0000001502", transferable: true, issuer_country: "IE" }),
  ],
  events: [
    deposit("acc_ibkr", "2025-01-14", "49500"),
    deposit("acc_mi", "2025-01-14", "30000"),
    buy("acc_ibkr", "ast_w", "2025-01-15", "600", "80"),
    buy("acc_mi", "ast_f", "2025-01-15", "300", "100", { vd: "2025-01-17", kind: "fund" }),
    valuation("acc_ibkr", "ast_w", "2025-12-31", "600", "90"),
    valuation("acc_mi", "ast_f", "2025-12-31", "300", "100"),
  ],
};

export const c15b: Case = {
  accounts: [acc("acc_ibkr", "ibkr", "IE")],
  assets: [asset("ast_w", "etf", { isin: "IE0000001501", market: "XETR", issuer_country: "IE" })],
  events: [
    deposit("acc_ibkr", "2025-01-14", "51500"),
    buy("acc_ibkr", "ast_w", "2025-01-15", "600", "80"),
    fx("acc_ibkr", "2025-10-01", "2000", "EUR", "1", "2200", "USD", "1.10"),
  ],
};

export const c16: Case = {
  accounts: [acc("acc_ibkr", "ibkr", "IE")],
  assets: [
    asset("ast_gold", "etc", {
      cls: "gold",
      isin: "XS0000001601",
      cur: "USD",
      market: "XLON",
      issuer_country: "JE",
    }),
  ],
  events: [
    deposit("acc_ibkr", "2024-03-01", "1100"),
    fx("acc_ibkr", "2024-03-01", "1100", "EUR", "1", "1210", "USD", "1.10"),
    buy("acc_ibkr", "ast_gold", "2024-03-01", "10", "121", { cur: "USD", fx: "1.10" }),
    sell("acc_ibkr", "ast_gold", "2025-04-01", "10", "150", { cur: "USD", fx: "1.08" }),
    fx("acc_ibkr", "2025-04-02", "1500", "USD", "1.08", "1388.89", "EUR", "1"),
  ],
};

export const c17: Case = {
  accounts: [acc("acc_ibkr", "ibkr", "IE"), acc("acc_mi", "myinvestor", "ES")],
  assets: [
    asset("ast_btc", "etp", {
      cls: "crypto",
      isin: "XS0000001701",
      market: "XETR",
      issuer_country: "CH",
    }),
  ],
  events: [
    deposit("acc_ibkr", "2024-11-04", "800"),
    buy("acc_ibkr", "ast_btc", "2024-11-04", "10", "60"),
    sell("acc_ibkr", "ast_btc", "2025-02-03", "10", "45"),
    buy("acc_ibkr", "ast_btc", "2025-03-03", "4", "47"),
    interest("acc_mi", "2025-12-31", "300", "57"),
  ],
};

export const c18: Case = {
  accounts: [acc("acc_ibkr", "ibkr", "IE"), acc("acc_mi", "myinvestor", "ES")],
  assets: [
    asset("ast_etc", "etc", { cls: "gold", isin: "XS0000001801", market: "XETR" }),
    asset("ast_fund", "fund", { isin: "ES0000001802", transferable: true }),
  ],
  events: [
    deposit("acc_ibkr", "2024-02-01", "1000"),
    deposit("acc_mi", "2024-02-01", "1000"),
    buy("acc_ibkr", "ast_etc", "2024-02-01", "10", "100"),
    buy("acc_mi", "ast_fund", "2024-01-30", "10", "100", { vd: "2024-02-01", kind: "fund" }),
    sell("acc_ibkr", "ast_etc", "2025-03-03", "10", "60"),
    sell("acc_mi", "ast_fund", "2025-06-02", "10", "200", {
      vd: "2025-06-04",
      kind: "fund",
      withholding: "190",
    }),
    interest("acc_mi", "2026-06-30", "100", "19"),
  ],
};

export const c19: Case = {
  accounts: [acc("acc_ibkr", "ibkr", "IE")],
  assets: [
    asset("ast_etfusd", "etf", {
      isin: "IE0000001901",
      cur: "USD",
      market: "XLON",
      issuer_country: "IE",
    }),
  ],
  events: [
    deposit("acc_ibkr", "2024-02-01", "1152.38"),
    fx("acc_ibkr", "2024-02-01", "1152.38", "EUR", "1", "1210", "USD", "1.05"),
    buy("acc_ibkr", "ast_etfusd", "2024-03-01", "10", "121", { cur: "USD", fx: "1.10" }),
    sell("acc_ibkr", "ast_etfusd", "2025-04-01", "10", "150", { cur: "USD", fx: "1.08" }),
    fx("acc_ibkr", "2025-04-02", "1500", "USD", "1.08", "1388.89", "EUR", "1"),
  ],
};

export const c20: Case = {
  accounts: [acc("acc_mi", "myinvestor", "ES")],
  assets: [asset("ast_m", "fund", { isin: "IE0000002001", transferable: true })],
  events: [
    deposit("acc_mi", "2025-01-08", "3550"),
    buy("acc_mi", "ast_m", "2025-01-08", "10", "100", { vd: "2025-01-10", kind: "fund" }),
    buy("acc_mi", "ast_m", "2025-02-06", "10", "90", { vd: "2025-02-10", kind: "fund" }),
    buy("acc_mi", "ast_m", "2025-03-06", "10", "80", { vd: "2025-03-10", kind: "fund" }),
    sell("acc_mi", "ast_m", "2025-03-18", "15", "82", { vd: "2025-03-20", kind: "fund" }),
    buy("acc_mi", "ast_m", "2025-04-08", "10", "85", { vd: "2025-04-10", kind: "fund" }),
    sell("acc_mi", "ast_m", "2025-11-18", "10", "95", {
      vd: "2025-11-20",
      kind: "fund",
      withholding: "19",
    }),
  ],
};

export const c21: Case = {
  accounts: [acc("acc_cubo", "ibkr", "IE", "bucket")],
  assets: [
    asset("ast_usx", "stock", {
      book: "bucket",
      isin: "US0000002101",
      cur: "USD",
      market: "XNAS",
      issuer_country: "US",
    }),
  ],
  events: [
    thesis("th_usx", "acc_cubo", "ast_usx", "2024-02-01"),
    deposit("acc_cubo", "2024-02-01", "1152.38"),
    fx("acc_cubo", "2024-02-01", "1152.38", "EUR", "1", "1210", "USD", "1.05"),
    buy("acc_cubo", "ast_usx", "2024-03-01", "10", "121", {
      cur: "USD",
      fx: "1.10",
      thesis: "th_usx",
    }),
    sell("acc_cubo", "ast_usx", "2025-04-01", "10", "150", {
      cur: "USD",
      fx: "1.08",
      thesis: "th_usx",
    }),
    fx("acc_cubo", "2025-04-02", "1500", "USD", "1.08", "1388.89", "EUR", "1"),
  ],
};
