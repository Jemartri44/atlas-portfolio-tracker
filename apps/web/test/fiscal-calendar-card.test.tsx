// @vitest-environment happy-dom
//
// The fiscal calendar (feature 020, E4, M12): the strip and the list on
// `/fiscal`, and the short version (the strip and the next date) inside the
// card of the summary in the season. The dates are the domain's; this checks
// what is placed, said and dimmed, and that no amount appears.

import { fiscalCalendar } from "@atlas/domain/fiscal";
import { describe, expect, it } from "vitest";
import { CalendarCard, LedgerCalendar } from "../src/routes/fiscal/CalendarCard.jsx";
import FiscalCard from "../src/routes/resumen/FiscalCard.jsx";
import { fiscalStatus } from "../src/routes/resumen/fiscal-status.js";
import { goldenEvents } from "./helpers/golden.js";
import { show, text, until, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const events = goldenEvents();
const MAY = "2029-05-10";

describe("the fiscal calendar of /fiscal", () => {
  it("draws the strip and lists every date, the past ones dimmed and said", async () => {
    const calendar = fiscalCalendar(events, MAY);
    const host = await show("/", () => <CalendarCard calendar={calendar} today={MAY} names={{}} />);
    const strip = host.querySelector("svg.calendar-strip");
    // The label says every date, for a screen reader.
    const label = strip?.getAttribute("aria-label") ?? "";
    expect(label).toContain("Calendario fiscal de 2029: ");
    expect(label.split("; ").length).toBe(calendar.dates.length);
    expect(label).toContain("Termina la campaña de la Renta");
    const rows = [...host.querySelectorAll(".calendar-list li")];
    expect(rows.length).toBe(calendar.dates.length + calendar.unknown_deadlines.length);
    expect(text(host)).toContain("Termina la campaña de la Renta");
    const past = calendar.dates.filter((one) => one.date < MAY).length;
    expect(text(host).match(/· pasado/g)?.length ?? 0).toBe(past);
    // One mark per date with a shape; the season is the band, not a mark.
    const marks = calendar.dates.filter(
      (one) => one.kind !== "season_start" && one.kind !== "season_end",
    );
    expect(strip?.querySelectorAll("svg path").length).toBe(marks.length);
    expect(strip?.querySelectorAll("rect").length).toBe(1);
  });

  it("says the years with no verified deadline instead of supposing one", async () => {
    const calendar = fiscalCalendar(events, "2031-05-10");
    expect(calendar.unknown_deadlines.length).toBeGreaterThan(0);
    const host = await show("/", () => (
      <CalendarCard calendar={calendar} today="2031-05-10" names={{}} />
    ));
    expect(text(host)).toMatch(/Plazo del Modelo 72[01] de 2030: sin verificar/);
  });

  it("marks a deadline nobody verified, and no other", async () => {
    const calendar = fiscalCalendar(events, MAY);
    const deadline = (verified: boolean) =>
      ({
        date: "2029-03-31",
        kind: "filing_deadline",
        model: "720",
        year: 2028,
        verified,
        sources: [],
      }) as ReturnType<typeof fiscalCalendar>["dates"][number];
    const host = await show("/", () => (
      <CalendarCard
        calendar={{ ...calendar, dates: [deadline(false), { ...deadline(true), model: "721" }] }}
        today={MAY}
        names={{}}
      />
    ));
    const rows = [...host.querySelectorAll(".calendar-list li")].map((row) => text(row));
    expect(rows[0]).toContain("Plazo del Modelo 720 de 2028 · sin verificar");
    expect(rows[1]).toContain("Plazo del Modelo 721 de 2028");
    expect(rows[1]).not.toContain("sin verificar");
    // The strip marks the unverified deadline and says so to a screen reader.
    const strip = host.querySelector("svg.calendar-strip");
    expect(strip?.querySelectorAll(":scope > svg text").length).toBe(1);
    expect(strip?.getAttribute("aria-label")).toContain("2028 · sin verificar");
  });

  it("names every asset whose window ends the same day", async () => {
    const calendar = {
      ...fiscalCalendar(events, MAY),
      dates: [
        {
          date: "2029-06-10",
          kind: "wash_sale_end",
          year: 2029,
          sources: ["e1", "ast_a", "e2", "ast_b", "e3", "ast_a"],
        },
      ] as ReturnType<typeof fiscalCalendar>["dates"],
      unknown_deadlines: [],
    };
    const names = { ast_a: "Fondo A", ast_b: "Fondo B" };
    const host = await show("/", () => (
      <CalendarCard calendar={calendar} today={MAY} names={names} />
    ));
    expect(text(host.querySelector(".calendar-list"))).toContain("recompra: Fondo A, Fondo B");
    expect(host.querySelector("svg.calendar-strip")?.getAttribute("aria-label")).toContain(
      "Fondo B",
    );
  });

  it("puts a date after the year at the right edge with its year and an arrow", async () => {
    const calendar = {
      ...fiscalCalendar(events, MAY),
      dates: [
        { date: "2030-02-01", kind: "wash_sale_end", year: 2029, sources: ["a", "b"] },
      ] as ReturnType<typeof fiscalCalendar>["dates"],
      unknown_deadlines: [],
    };
    const host = await show("/", () => <CalendarCard calendar={calendar} today={MAY} names={{}} />);
    expect(text(host.querySelector("svg.calendar-strip"))).toContain("2030 ›");
    expect(host.querySelector("svg.calendar-strip svg")?.getAttribute("x")).toBe("100%");
  });
});

describe("the calendar of the ledger", () => {
  it("is the calendar of the domain at the date, placed in the grid", async () => {
    const host = await show("/", () => <LedgerCalendar events={events} today={MAY} names={{}} />);
    expect(text(host)).toContain("Calendario fiscal");
    const calendar = fiscalCalendar(events, MAY);
    expect(host.querySelectorAll(".calendar-list li").length).toBe(
      calendar.dates.length + calendar.unknown_deadlines.length,
    );
  });
});

describe("the short calendar inside the card of the summary", () => {
  it("shows the strip and the next date, loaded after the first paint, and no list", async () => {
    const status = fiscalStatus(events, MAY);
    const host = await show("/", () => (
      <FiscalCard season={true} status={() => status} year={2028} today={MAY} names={{}} />
    ));
    await until(() => host.querySelector(".calendar-short") !== null, "the short calendar");
    expect(host.querySelector(".calendar-short svg.calendar-strip")).not.toBeNull();
    expect(host.querySelector(".calendar-list")).toBeNull();
    expect(text(host.querySelector(".calendar-short"))).toMatch(/Próxima fecha: \d/);
  });

  it("says no next date when the year has none left", async () => {
    const status = {
      ...fiscalStatus(events, MAY),
      calendar: {
        ...fiscalCalendar(events, MAY),
        dates: [],
        unknown_deadlines: [],
      },
    };
    const host = await show("/", () => (
      <FiscalCard season={true} status={() => status} year={2028} today={MAY} names={{}} />
    ));
    await until(() => host.querySelector(".calendar-short") !== null, "the short calendar");
    expect(host.querySelector(".calendar-short svg")).not.toBeNull();
    expect(text(host.querySelector(".calendar-short"))).not.toContain("Próxima fecha");
  });
});
