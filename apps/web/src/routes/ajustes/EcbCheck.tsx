// «Tipos del BCE» in the verification (feature 012, block 4): the rates of the
// ledger against the official history, with the findings of the domain — and,
// without a history, **«sin contrastar»**, never «sin hallazgos»: saying the
// rates are right without having looked is worse than saying nothing
// (decisions (f) and (p) of prompt 012). Everything of the ECB is loaded here,
// lazily, when the screen opens.

import type { IntegrityFinding, LedgerEvent, LedgerState } from "@atlas/domain";
import { createResource, type JSX, Match, Show, Switch } from "solid-js";
import { Notice, type NoticeItem, NoticeList, Section, Tag } from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import { countOf } from "../../format/number.js";
import { today } from "../../ledger/state.js";

const check = async (state: LedgerState, events: readonly LedgerEvent[]) => {
  const [{ loadWebHistory }, { checkLedgerRates }] = await Promise.all([
    import("../../ecb/history.js"),
    import("@atlas/domain/ecb"),
  ]);
  const web = await loadWebHistory();
  return checkLedgerRates(web.history, state, events, web.staleDays, today());
};

export const EcbCheck = (props: {
  state: LedgerState;
  events: readonly LedgerEvent[];
  items: (findings: readonly IntegrityFinding[]) => NoticeItem[];
}): JSX.Element => {
  const [result] = createResource(() => check(props.state, props.events));
  return (
    <Section
      title="Tipos del BCE"
      aside={
        <Show when={result()?.kind === "unchecked" && (result() as { rates: number }).rates > 0}>
          <Tag tone="caution">sin contrastar</Tag>
        </Show>
      }
    >
      <Show when={result()} fallback={<p class="meta">Contrastando…</p>}>
        {(outcome) => (
          <Switch>
            <Match when={outcome().kind === "checked" && outcome()}>
              {(checked) => {
                const done = checked() as Extract<ReturnType<typeof outcome>, { kind: "checked" }>;
                return (
                  <Show
                    when={done.findings.length > 0}
                    fallback={
                      <p class="calm">
                        {done.compared === 0
                          ? "No hay tipos en otra divisa que contrastar."
                          : `${countOf(done.compared, "tipo contrastado", "tipos contrastados")} con el histórico oficial, que llega hasta el ${formatDate(done.latest)}: todos son los oficiales de su fecha.`}
                      </p>
                    }
                  >
                    <p class="card-note">
                      Contrastados con el histórico oficial, que llega hasta el{" "}
                      {formatDate(done.latest)}. Un tipo distinto del oficial no se recalcula: se
                      corrige anulando y registrando de nuevo.
                    </p>
                    <NoticeList
                      label="Hallazgos de los tipos del BCE"
                      items={props.items(done.findings)}
                    />
                  </Show>
                );
              }}
            </Match>
            <Match when={outcome().kind === "unchecked" && outcome()}>
              {(unchecked) => {
                const rates = (unchecked() as { rates: number }).rates;
                return (
                  <Show
                    when={rates > 0}
                    fallback={<p class="calm">No hay tipos en otra divisa que contrastar.</p>}
                  >
                    <Notice severity="caution" title="Sin contrastar">
                      {countOf(rates, "tipo en otra divisa está", "tipos en otra divisa están")} sin
                      contrastar: no hay histórico del BCE en este dispositivo. No se dan por buenos
                      ni por malos. Enlaza la carpeta de la consola o importa el histórico en
                      Ajustes.
                    </Notice>
                  </Show>
                );
              }}
            </Match>
          </Switch>
        )}
      </Show>
    </Section>
  );
};
