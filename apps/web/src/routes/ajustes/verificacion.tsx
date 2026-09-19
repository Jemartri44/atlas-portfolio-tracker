// "¿Están sanos mis datos?" — `integrity` always, and the deep check on
// request because it re-reads the raw lines and re-projects (`deepCheck`),
// which is heavier and only makes sense when asked for.
//
// Findings are explained in Spanish and each one names its events, which is how
// a degraded file gets repaired: read, check, rectify. Everything here is said
// with the one notice of the application, and the warnings of the ledger are
// grouped and ordered exactly as on the summary (docs/design/system.md §7.7):
// the same rule about the same thing is one notice with its count and the
// events it comes from.

import { deepCheck, type IntegrityFinding, integrity } from "@atlas/domain";
import { A } from "@solidjs/router";
import { createSignal, For, type JSX, Show } from "solid-js";
import {
  Disclosure,
  Notice,
  type NoticeItem,
  NoticeList,
  Section,
  Tag,
} from "../../components/index.js";
import { type EventReferences, eventReferences } from "../../format/events.js";
import { describeError } from "../../format/messages/errors.js";
import { describeFinding } from "../../format/messages/findings.js";
import { nameIndex } from "../../format/names.js";
import { countOf } from "../../format/number.js";
import { maskFigures } from "../../format/privacy.js";
import { usePrivacy } from "../../ledger/state.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { attentionItems } from "../../view-models/index.js";
import { RequireLedger } from "../guard.jsx";

/** How many events a notice lists in sight; more than that wait folded. */
const IN_SIGHT = 3;

/** The events a notice is about, each one a link by its type and date. */
const EventLinks = (props: { ids: readonly string[]; events: EventReferences }): JSX.Element => {
  const Links = (): JSX.Element => (
    <span class="event-links">
      <For each={props.ids}>{(id) => <A href={`/movimientos/${id}`}>{props.events(id)}</A>}</For>
    </span>
  );
  return (
    <Show when={props.ids.length > 0}>
      <Show when={props.ids.length > IN_SIGHT} fallback={<Links />}>
        <Disclosure label={`Ver los ${props.ids.length} movimientos`}>
          <Links />
        </Disclosure>
      </Show>
    </Show>
  );
};

/** A finding: what is wrong and what to do, its events, and the raw evidence folded. */
const findingItems = (
  findings: readonly IntegrityFinding[],
  privacy: boolean,
  events: EventReferences,
): NoticeItem[] =>
  findings.map((finding) => ({
    severity: finding.severity === "error" ? "danger" : "caution",
    message: `${describeFinding(finding).what} ${describeFinding(finding).todo}`,
    detail: (
      <>
        <EventLinks ids={finding.event_ids} events={events} />
        {/*
          The domain's own message carries the evidence — which asset, which
          line, which figure — and it is in English by contract (`errors.ts`).
          It goes folded, like the code of an error: the explanation is
          Spanish, the evidence is raw.
        */}
        <Disclosure label="Detalle técnico">
          <p class="meta">
            <code>{finding.code}</code> · {maskFigures(finding.message, privacy)}
          </p>
        </Disclosure>
      </>
    ),
  }));

export default function VerificacionRoute(): JSX.Element {
  const [deep, setDeep] = createSignal<IntegrityFinding[] | undefined>(undefined);
  const privacy = usePrivacy();

  return (
    <RequireLedger skeleton={5}>
      {(snapshot) => {
        const names = nameIndex(snapshot.state);
        const events = eventReferences(snapshot.events);
        const findings = () => integrity(snapshot.state);
        const invalid = () => snapshot.state.invalid;

        /** The warnings of the ledger, grouped and ordered as on the summary. */
        const warnings = (): NoticeItem[] =>
          attentionItems({
            invalidCount: 0,
            warnings: snapshot.state.warnings,
            findings: [],
            openOrders: [],
            openTransfers: [],
            names,
            privacy: privacy(),
          }).map((item) => ({
            severity:
              item.severity === "error"
                ? "danger"
                : item.severity === "warning"
                  ? "caution"
                  : "info",
            message: item.message,
            count: item.count,
            detail: <EventLinks ids={item.eventIds} events={events} />,
          }));

        return (
          <>
            <PageHeader
              title="Verificación"
              lead={`${countOf(snapshot.events.length, "movimiento leído", "movimientos leídos")}. Todo lo que ves se recalcula desde tus datos.`}
            />

            <div class="stack">
              <Show when={invalid().length > 0}>
                <Section
                  title="Movimientos inválidos"
                  aside={<Tag tone="danger">{invalid().length}</Tag>}
                >
                  <p class="card-note">
                    Mientras los haya, se puede consultar pero no registrar. Rectifica cada uno
                    desde su ficha.
                  </p>
                  <NoticeList
                    label="Movimientos inválidos"
                    limit={invalid().length}
                    items={invalid().map((entry) => ({
                      severity: "danger",
                      message: describeError(entry.error, { names, privacy: privacy() }),
                      detail: <EventLinks ids={[entry.event.id]} events={events} />,
                    }))}
                  />
                </Section>
              </Show>

              <Section
                title="Integridad"
                aside={
                  <Show when={findings().length === 0}>
                    <Tag tone="done" icon="check">
                      sin hallazgos
                    </Tag>
                  </Show>
                }
              >
                <Show
                  when={findings().length > 0}
                  fallback={
                    <p class="calm">
                      Posiciones no negativas, lotes cuadrados, huellas únicas y ninguna referencia
                      colgante.
                    </p>
                  }
                >
                  <NoticeList
                    label="Hallazgos de integridad"
                    items={findingItems(findings(), privacy(), events)}
                  />
                </Show>
              </Section>

              <Section
                title="Comprobación profunda"
                aside={
                  <button
                    type="button"
                    class="secondary"
                    onClick={() =>
                      setDeep(deepCheck(snapshot.lines, snapshot.events, snapshot.state))
                    }
                  >
                    {deep() === undefined ? "Ejecutar" : "Volver a ejecutar"}
                  </button>
                }
              >
                <p class="card-note">
                  Relee las líneas tal cual están en el archivo: identificadores repetidos, huellas
                  que no cuadran, líneas no canónicas, campos desconocidos y proyección
                  reproducible.
                </p>
                <Show when={deep()}>
                  {(found) => (
                    <Show
                      when={found().length > 0}
                      fallback={<p class="calm">Sin hallazgos: tus datos son reproducibles.</p>}
                    >
                      <NoticeList
                        label="Hallazgos de la comprobación profunda"
                        items={findingItems(found(), privacy(), events)}
                      />
                    </Show>
                  )}
                </Show>
              </Section>

              <Show when={warnings().length > 0}>
                <Section
                  title="Avisos de tus datos"
                  label="Avisos de tus datos"
                  aside={<span>{warnings().length}</span>}
                >
                  <NoticeList label="Avisos" items={warnings()} />
                </Section>
              </Show>

              <Notice severity="info" title="La copia de seguridad sigue siendo tuya">
                La verificación dice si tus datos son coherentes, no si están a salvo. Exporta desde
                Ajustes, y en el ordenador usa <code>atlas backup</code>.
              </Notice>
            </div>
          </>
        );
      }}
    </RequireLedger>
  );
}
