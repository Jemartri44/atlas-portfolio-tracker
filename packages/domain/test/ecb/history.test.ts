// Reading the ECB history (ADR-0029, point 1): the real format of each source,
// synthetic values (tests/fixtures/ecb/).

import { describe, expect, it } from "vitest";
import {
  isPublication,
  lastIndexOnOrBefore,
  latestPublication,
  rateOn,
  readEcbApiCsv,
  readEcbHistory,
  readEcbZipCsv,
  sameRate,
  splitCsvLine,
} from "../../src/ecb/history.js";
import { ValidationError } from "../../src/errors.js";
import { ecbFixture } from "../fixtures-path.js";

const code = (action: () => unknown): string | undefined => {
  try {
    action();
    return undefined;
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return (error as ValidationError).code;
  }
};

describe("the ZIP's CSV", () => {
  const history = readEcbZipCsv(ecbFixture("eurofxref-hist.csv"));

  it("reads every day of publication, oldest first, and the rates as written", () => {
    expect(history.source).toBe("zip");
    expect(history.publications[0]).toBe("2025-10-01");
    expect(latestPublication(history)).toBe("2026-03-31");
    expect(history.publications).toHaveLength(127);
    // The canonical form is the history's: no trailing zeros, integers as integers.
    expect(rateOn(history, "GBP", "2026-01-05")).toBe("0.8595");
    expect(rateOn(history, "ISK", "2025-10-01")).toBe("130");
    expect(rateOn(history, "JPY", "2025-10-01")).toBe("170");
  });

  it("reads N/A as no value, and a day without publication as absent", () => {
    expect(rateOn(history, "BGN", "2025-12-31")).toBe("1.9558");
    expect(rateOn(history, "BGN", "2026-01-02")).toBeUndefined();
    expect(history.series.has("CYP")).toBe(false);
    expect(rateOn(history, "CYP", "2025-10-01")).toBeUndefined();
    expect(isPublication(history, "2025-12-25")).toBe(false);
    expect(rateOn(history, "USD", "2025-12-25")).toBeUndefined();
    expect(isPublication(history, "2025-12-24")).toBe(true);
    expect(isPublication(history, "2025-09-30")).toBe(false);
  });

  it("refuses a file that is not the history, and says where", () => {
    expect(code(() => readEcbZipCsv(""))).toBe("ecb_history_unreadable");
    expect(code(() => readEcbZipCsv("Fecha,USD,\n"))).toBe("ecb_history_unreadable");
    expect(code(() => readEcbZipCsv("Date,USD,\n"))).toBe("ecb_history_empty");
    expect(code(() => readEcbZipCsv("Date,USD,\n2026-13-01,1.1,\n"))).toBe(
      "ecb_history_unreadable",
    );
    expect(code(() => readEcbZipCsv("Date,USD,\n2026-01-02,1.1\n"))).toBe("ecb_history_unreadable");
    expect(code(() => readEcbZipCsv("Date,usd,\n2026-01-02,1.1,\n"))).toBe(
      "ecb_history_unreadable",
    );
    expect(code(() => readEcbZipCsv("Date,USD,\n2026-01-02,1.1,x\n"))).toBe(
      "ecb_history_unreadable",
    );
    expect(code(() => readEcbZipCsv("Date,USD,\n2026-01-02,-1,\n"))).toBe("ecb_history_unreadable");
    expect(code(() => readEcbZipCsv("Date,USD,\n2026-01-02,1e3,\n"))).toBe(
      "ecb_history_unreadable",
    );
    const error = (() => {
      try {
        readEcbZipCsv("Date,USD,\n2026-01-02,1.1,\n2026-01-01,uno,\n");
        return undefined;
      } catch (caught) {
        return caught as ValidationError;
      }
    })();
    expect(error?.details).toEqual({ line: 3 });
    expect(error?.message).toMatch(/^line 3:/);
  });
});

describe("the API's CSV", () => {
  it("reads the rows with a value and takes a row without one for a closing day", () => {
    const history = readEcbApiCsv(ecbFixture("api-exr.csv"));
    expect(history.source).toBe("api");
    expect(isPublication(history, "2025-12-25")).toBe(false);
    expect(rateOn(history, "GBP", "2026-01-05")).toBe("0.8595");
    const zip = readEcbZipCsv(ecbFixture("eurofxref-hist.csv"));
    expect(history.publications).toEqual(zip.publications);
    expect(history.series.get("USD")).toEqual(zip.series.get("USD"));
  });

  it("reads the full detail, with its quoted fields, and refuses what is not the API", () => {
    const full = [
      "KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE,OBS_STATUS,TITLE_COMPL",
      'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-01-02,1.1,A,"ECB reference exchange rate, US dollar/Euro, 2.15 pm (C.E.T.)"',
      'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-01-01,,H,"con ""comillas"""',
    ].join("\r\n");
    const history = readEcbHistory(full, "api");
    expect(history.publications).toEqual(["2026-01-02"]);
    expect(code(() => readEcbApiCsv("KEY,TIME_PERIOD\n"))).toBe("ecb_history_unreadable");
    expect(code(() => readEcbApiCsv(""))).toBe("ecb_history_unreadable");
    expect(code(() => readEcbApiCsv("OBS_VALUE,TIME_PERIOD,CURRENCY\n1.1,2026-01-02\n"))).toBe(
      "ecb_history_unreadable",
    );
    expect(code(() => readEcbApiCsv("CURRENCY,TIME_PERIOD,OBS_VALUE\nUSD,ayer,1\n"))).toBe(
      "ecb_history_unreadable",
    );
    expect(code(() => readEcbApiCsv("CURRENCY,TIME_PERIOD,OBS_VALUE\nUSD,2026-01-02,0\n"))).toBe(
      "ecb_history_unreadable",
    );
    expect(code(() => readEcbApiCsv("CURRENCY,TIME_PERIOD\n"))).toBe("ecb_history_unreadable");
    expect(code(() => readEcbApiCsv("CURRENCY,TIME_PERIOD,OBS_VALUE\nUSD,2026-01-02\n"))).toBe(
      "ecb_history_empty",
    );
    expect(code(() => readEcbApiCsv("CURRENCY,TIME_PERIOD,OBS_VALUE\n,2026-01-02,1\n"))).toBe(
      "ecb_history_unreadable",
    );
    expect(readEcbHistory(ecbFixture("eurofxref-hist.csv"), "zip").source).toBe("zip");
  });
});

describe("the helpers", () => {
  it("splits a CSV line with quotes, and compares rates as numbers", () => {
    expect(splitCsvLine('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
    expect(splitCsvLine("")).toEqual([""]);
    expect(sameRate("0.85950", "0.8595")).toBe(true);
    expect(sameRate("0.8596", "0.8595")).toBe(false);
    expect(sameRate("138", "138.0")).toBe(true);
  });

  it("finds the last date on or before another", () => {
    const dates = ["2026-01-02", "2026-01-05", "2026-01-06"];
    expect(lastIndexOnOrBefore(dates, "2026-01-01")).toBe(-1);
    expect(lastIndexOnOrBefore(dates, "2026-01-04")).toBe(0);
    expect(lastIndexOnOrBefore(dates, "2026-01-05")).toBe(1);
    expect(lastIndexOnOrBefore(dates, "2027-01-01")).toBe(2);
    expect(lastIndexOnOrBefore([], "2027-01-01")).toBe(-1);
  });
});
