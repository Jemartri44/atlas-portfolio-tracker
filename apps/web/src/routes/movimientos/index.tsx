// "¿Qué he registrado?" — every movement, readable and filterable.
//
// The order and the state of each entry come from the domain (`ledgerEntries`,
// decision (h)); this screen filters through it, paints and **pages**: twenty
// years of ledger never land on screen at once (FR-039).

import { type EntryFilter, ledgerEntries } from "@atlas/domain";
import { A, useSearchParams } from "@solidjs/router";
import { createMemo, createSignal, type JSX, Show } from "solid-js";
import { EmptyState } from "../../components/index.js";
import { eventReferences } from "../../format/events.js";
import { nameIndex } from "../../format/names.js";
import { countOf } from "../../format/number.js";
import { mediaQuery, SIDE_COLUMN } from "../../shell/media.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { movementRows, PAGE_SIZE } from "../../view-models/index.js";
import { RequireLedger } from "../guard.jsx";
import { Filters, type MovementFilters } from "./Filters.jsx";
import { MovementList } from "./MovementList.jsx";

const filterOf = (params: MovementFilters): EntryFilter => ({
  ...(params.tipo === undefined || params.tipo === "" ? {} : { types: [params.tipo] }),
  ...(params.cuenta === undefined || params.cuenta === "" ? {} : { account_id: params.cuenta }),
  ...(params.activo === undefined || params.activo === "" ? {} : { asset_id: params.activo }),
  ...(params.desde === undefined || params.desde === "" ? {} : { from: params.desde }),
  ...(params.hasta === undefined || params.hasta === "" ? {} : { to: params.hasta }),
  ...(params.q === undefined || params.q === "" ? {} : { text: params.q }),
});

export default function MovimientosRoute(): JSX.Element {
  const [params] = useSearchParams<MovementFilters>();
  const side = mediaQuery(SIDE_COLUMN);
  const [page, setPage] = createSignal(1);

  return (
    <RequireLedger skeleton={8}>
      {(snapshot) => {
        // Sorting and filtering the whole ledger once per render, not once per
        // reader: with twenty years of ledger the difference is visible.
        const entries = createMemo(() =>
          ledgerEntries(snapshot.state, snapshot.events, filterOf(params)),
        );
        const names = nameIndex(snapshot.state);
        const events = eventReferences(snapshot.events, names);
        const rows = createMemo(() =>
          movementRows(entries().slice(0, page() * PAGE_SIZE), names, events),
        );
        const filtered = (): boolean =>
          Object.values(filterOf(params)).some((value) => value !== undefined);
        const more = (): boolean => entries().length > rows().length;

        return (
          <>
            <PageHeader
              title="Movimientos"
              lead={
                filtered()
                  ? `${entries().length} de ${countOf(snapshot.events.length, "movimiento", "movimientos")}`
                  : countOf(snapshot.events.length, "movimiento", "movimientos")
              }
            />
            <div class="grid">
              <Filters state={snapshot.state} />
              <section
                class={side() ? "card list-pane span-9" : "card list-pane span-12"}
                aria-label="Lista de movimientos"
              >
                <Show
                  when={entries().length > 0}
                  fallback={
                    <Show
                      when={filtered()}
                      fallback={
                        <EmptyState
                          glyph="movements"
                          what="Todavía no hay ningún movimiento."
                          why="Cada operación que hagas en tu plataforma se anota aquí."
                        >
                          <A href="/registrar" role="button">
                            Registrar el primero
                          </A>
                        </EmptyState>
                      }
                    >
                      <EmptyState
                        glyph="movements"
                        what="Ningún movimiento coincide con los filtros."
                        why="Quita algún filtro para ver más."
                      />
                    </Show>
                  }
                >
                  <MovementList rows={rows()} />
                  <Show when={more()}>
                    <button
                      type="button"
                      class="secondary block load-more"
                      onClick={() => setPage(page() + 1)}
                    >
                      Cargar {Math.min(PAGE_SIZE, entries().length - rows().length)} más
                    </button>
                  </Show>
                  <p class="card-note">
                    {rows().length} de {countOf(entries().length, "movimiento", "movimientos")}
                  </p>
                </Show>
              </section>
            </div>
          </>
        );
      }}
    </RequireLedger>
  );
}
