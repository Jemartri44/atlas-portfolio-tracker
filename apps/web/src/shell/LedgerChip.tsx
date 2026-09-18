// Where the ledger is, on every screen (FR-011). On the phone it is the left
// half of the status bar; on the desktop it sits in the rail footer.
//
// It is also the export nag: with the ledger in browser storage and no export
// for more than a week, the dot turns to warning and the chip says so. That
// reminder is the **only** safety net on a phone, where the File System Access
// API does not exist (decision (l), ADR-0019).

import { A } from "@solidjs/router";
import { type JSX, Show } from "solid-js";
import { formatInstantDate } from "../format/date.js";
import { daysSinceExport, exportIsOverdue, sourceLabel } from "../ledger/source.js";
import { store, today } from "../ledger/state.js";

export const LedgerChip = (): JSX.Element => {
  const source = () => store.source();

  const detail = (): string => {
    const current = source();
    if (current === undefined) {
      return "Sin libro abierto";
    }
    if (current.kind === "directory") {
      return current.permission === "granted"
        ? "Fichero del disco, el mismo que usa la CLI"
        : "Permiso pendiente: hay que reconectar";
    }
    const days = daysSinceExport(current, today());
    if (current.lastExportAt === undefined) {
      return "Nunca exportado: exporta para no depender del navegador";
    }
    return `Exportado el ${formatInstantDate(current.lastExportAt)}${
      days === undefined ? "" : ` (hace ${days} días)`
    }`;
  };

  const overdue = (): boolean => {
    const current = source();
    if (current === undefined) {
      return false;
    }
    return current.kind === "directory"
      ? current.permission !== "granted"
      : exportIsOverdue(current, today());
  };

  return (
    <A
      href={source() === undefined ? "/libro" : "/ajustes"}
      class={`ledger-chip${overdue() ? " needs-attention" : ""}`}
      title={detail()}
    >
      <span class="dot" />
      <span class="truncate">
        <Show when={source()} fallback="Abrir un libro">
          {(current) => sourceLabel(current())}
        </Show>
      </span>
    </A>
  );
};
