// Where the data lives, on every screen (FR-011, brief §3): in the browser —
// on every device since feature 012 — and how long ago it was exported, in the
// colour of a warning after a week. That reminder is the safety net (decision
// (l), ADR-0019). It leads to Ajustes, where it is exported.
//
// While the data are empty there is nothing to lose, so the chip says where
// they live and nothing about exporting: a warning with no stake teaches the
// user to ignore the one that will matter.

import { A } from "@solidjs/router";
import { type JSX, Show } from "solid-js";
import { Icon } from "../components/Icon.jsx";
import { formatInstantDate } from "../format/date.js";
import { countOf } from "../format/number.js";
import { daysSinceExport, exportIsOverdue, type LedgerSource } from "../ledger/source.js";
import { store, today } from "../ledger/state.js";

/** Something has been recorded: from then on there is something to lose. */
const hasData = (): boolean => (store.snapshot()?.events.length ?? 0) > 0;

/** The short second half of the chip: how old the copy is. */
const ageOf = (source: LedgerSource): string => {
  const days = daysSinceExport(source, today());
  if (days === undefined) {
    return "sin exportar";
  }
  return days === 0 ? "exportado hoy" : `hace ${countOf(days, "día", "días")}`;
};

/** The whole sentence, for the title of the chip. */
const detailOf = (source: LedgerSource): string => {
  if (!hasData()) {
    return "Tus datos viven en este navegador. Todavía no hay nada que exportar.";
  }
  if (source.lastExportAt === undefined) {
    return "Tus datos viven en este navegador y nunca se han exportado.";
  }
  return `Tus datos viven en este navegador. Última exportación: ${formatInstantDate(source.lastExportAt)}.`;
};

const needsAttention = (source: LedgerSource): boolean =>
  hasData() && exportIsOverdue(source, today());

export const LedgerChip = (): JSX.Element => (
  <Show
    when={store.source()}
    fallback={
      <A href="/libro" class="source">
        <Icon name="browser" class="icon-sm source-icon" />
        <span class="where">Abrir tus datos</span>
      </A>
    }
  >
    {(source) => (
      // A plain link: the router still handles it, but it does not mark it as
      // the current page, which on /ajustes is the settings button's job.
      <a href="/ajustes" class="source" title={detailOf(source())}>
        <Icon name="browser" class="icon-sm source-icon" />
        <span class="where">Navegador</span>
        <Show when={hasData()}>
          <span class={`age${needsAttention(source()) ? " is-overdue" : ""}`}>
            <Show when={needsAttention(source())}>
              <Icon name="caution" class="icon-sm overdue-icon" />
            </Show>
            <span>{ageOf(source())}</span>
          </span>
        </Show>
      </a>
    )}
  </Show>
);
