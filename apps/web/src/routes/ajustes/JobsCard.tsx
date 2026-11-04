// «Tareas automáticas» in Ajustes: when each scheduled task last ran and how it ended, from the
// records the tasks leave. A task that does not even start sends no mail, so this is where that
// shows. Dates and states only: nothing of what a task found.

import { type JobHealth, settingsAt } from "@atlas/domain";
import { createResource, For, type JSX, Show } from "solid-js";
import { FoldSection, Peek, Tag } from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import { store, today } from "../../ledger/state.js";
import { GRID, mediaQuery } from "../../shell/media.js";

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

/** The rows in sight. Those with a problem go first and the title counts them: none hides. */
const IN_SIGHT = 5;

/** How a run that ended badly ended: a failure is judged by its date, so it may not be late. */
const FAILED = new Set(["failed", "send_failed", "send_unknown", "expired"]);

type JobRow = Pick<JobHealth, "late" | "last" | "unreadable">;

const failed = (row: JobRow): boolean =>
  !row.late && (row.unreadable === true || FAILED.has(row.last?.state ?? ""));

/** What the title and the folded line say: every row with a problem, or that all is well. */
export const jobsLine = (rows: readonly JobRow[]): string => {
  const late = rows.filter((row) => row.late).length;
  const bad = rows.filter(failed).length;
  const said = [
    ...(late > 0 ? [`${late} con retraso`] : []),
    ...(bad > 0 ? [`${bad} con fallo`] : []),
  ];
  return said.length === 0 ? "Al día" : said.join(" · ");
};

/** The rows with a problem first, each group in its order. */
const worstFirst = <T extends JobRow>(rows: readonly T[]): T[] => [
  ...rows.filter((row) => row.late || failed(row)),
  ...rows.filter((row) => !row.late && !failed(row)),
];

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
  const wide = mediaQuery(GRID);
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

  const answered = () => (load.state === "ready" ? load() : undefined);
  /** How the tasks are, in a few words: what the title says and the folded card. */
  const state = (): string => {
    const answer = answered();
    if (answer === undefined) {
      return "Leyendo…";
    }
    if (answer.kind === "failed") {
      return "No se ha podido leer";
    }
    return answer.rows.length === 0 ? "Sin tareas activas" : jobsLine(answer.rows);
  };

  return (
    <FoldSection
      title="Tareas automáticas"
      summary={state()}
      aside={wide() ? <span>{state()}</span> : undefined}
    >
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
              <Peek
                items={worstFirst(answer.rows)}
                limit={IN_SIGHT}
                more={(total) => `Ver las ${total} tareas`}
              >
                {(shown) => (
                  <ul class="rows">
                    <For each={shown()}>
                      {(row) => (
                        <li>
                          <div class="row">
                            <div>
                              <div>{TASKS[row.task] ?? row.task}</div>
                              <div class="meta">
                                <Show
                                  when={row.last}
                                  fallback={
                                    row.unreadable ? "registro ilegible" : "sin ejecuciones"
                                  }
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
                )}
              </Peek>
            </Show>
          );
        }}
      </Show>
      <p class="card-note">
        Cada tarea tiene un margen según su frecuencia. Si una no arranca, no llega ningún correo:
        por eso se dice aquí y en Resumen.
      </p>
    </FoldSection>
  );
};
