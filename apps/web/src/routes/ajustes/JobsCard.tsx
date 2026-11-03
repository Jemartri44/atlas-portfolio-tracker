// «Tareas automáticas» in Ajustes: when each scheduled task last ran and how it ended, from the
// records the tasks leave. A task that does not even start sends no mail, so this is where that
// shows. Dates and states only: nothing of what a task found.

import { settingsAt } from "@atlas/domain";
import { createResource, For, type JSX, Show } from "solid-js";
import { Section, Tag } from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import { store, today } from "../../ledger/state.js";

const TASKS: Readonly<Record<string, string>> = {
  ecb_update: "Histórico del BCE",
  prices_update: "Precios de cierre",
  dispatch_findings: "Envío de avisos",
  monthly_reminder: "Recordatorio mensual",
  weekly_review: "Revisión de pesos y del cubo",
  tax_return_ready: "Datos de la Renta",
  informative_thresholds: "Modelos 720 y 721",
  monthly_backup: "Volcado mensual",
  quarterly_integrity: "Comprobación de integridad",
};

const STATES: Readonly<Record<string, string>> = {
  claimed: "en curso",
  sending: "enviando",
  send_failed: "envío rechazado",
  done: "terminada",
  failed: "falló",
  send_unknown: "envío sin confirmar",
  expired: "caducada",
};

export const JobsCard = (): JSX.Element => {
  const [load] = createResource(
    () => ({ snapshot: store.snapshot() }),
    async ({ snapshot }) => {
      const date = today();
      const frequencies =
        snapshot === undefined
          ? undefined
          : settingsAt(snapshot.state, date).settings.job_frequencies;
      return (await import("../../jobs/job-health.js")).loadJobHealth(frequencies, date);
    },
  );

  return (
    <Section title="Tareas automáticas">
      <Show when={load.state === "ready" && load()} fallback={<p class="meta">Leyendo…</p>}>
        {(loaded) => {
          const answer = loaded();
          if (answer.kind === "failed") {
            return (
              <p class="card-note">
                No se ha podido leer cuándo corrieron las tareas. Recarga la página para intentarlo
                otra vez.
              </p>
            );
          }
          return (
            <Show
              when={answer.rows.length > 0}
              fallback={<p class="meta">Este entorno no tiene tareas activas.</p>}
            >
              <ul class="rows">
                <For each={answer.rows}>
                  {(row) => (
                    <li>
                      <div class="row">
                        <div>
                          <div>{TASKS[row.task] ?? row.task}</div>
                          <div class="meta">
                            <Show
                              when={row.last}
                              fallback={row.unreadable ? "registro ilegible" : "sin ejecuciones"}
                            >
                              {(last) =>
                                `${formatDate(last().day)}, ${STATES[last().state] ?? last().state}`
                              }
                            </Show>
                          </div>
                        </div>
                        <Show when={row.late}>
                          <Tag tone="caution" icon="caution">
                            Con retraso
                          </Tag>
                        </Show>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          );
        }}
      </Show>
      <p class="card-note">
        Cada tarea tiene un margen según su frecuencia. Si una no arranca, no llega ningún correo:
        por eso se dice aquí y en Resumen.
      </p>
    </Section>
  );
};
