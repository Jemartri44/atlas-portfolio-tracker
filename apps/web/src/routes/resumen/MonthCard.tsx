// «Este mes»: the contribution of the month as a list of tasks (docs/design/system.md §5.22,
// docs/business-rules.md «Este mes»). The plan is the domain's (`monthPlan`), fixed at the end of
// the month before; each task says whether the month already holds it, and when. The orders are
// placed by hand in the bank: the card only says what is left. Each share is over the whole month,
// bucket included, so they add up to 100 %; those of the Cartera are over the core alone.

import { DomainError } from "@atlas/domain";
import type { MonthPlan, MonthTask } from "@atlas/domain/portfolio";
import { A } from "@solidjs/router";
import { For, type JSX, Show } from "solid-js";
import { Amount, Figure, Icon, Pending, Section, Skeleton, Tag } from "../../components/index.js";
import { formatDate, formatMonth } from "../../format/date.js";
import { valueLabel } from "../../format/labels.js";
import { displayName, type NameIndex } from "../../format/names.js";
import { toAppError } from "../../ledger/errors.js";
import { GRID, mediaQuery } from "../../shell/media.js";
import { shareOf } from "../../view-models/core/index.js";
import { REMEDIES } from "../cartera/remedies.js";

interface TaskLine {
  key: string;
  label: string;
  task: MonthTask;
  /** Over the month's money, in percent. The deposit is that money: it has none. */
  share?: string | undefined;
  /** Where to record it while it is pending. */
  to: string;
}

/** The two long names; the row has to hold the asset too. */
const CLASS_SHORT: Readonly<Record<string, string>> = { equity: "RV", fixed_income: "RF" };

const linesOf = (plan: Extract<MonthPlan, { status: "ready" }>, names: NameIndex): TaskLine[] => [
  { key: "deposit", label: "Ingreso de efectivo", task: plan.deposit, to: "/registrar/cash-in" },
  ...plan.assets.map((row) => ({
    key: row.asset_id,
    label: `${CLASS_SHORT[row.asset_class] ?? valueLabel(row.asset_class)} · ${displayName(names, row.asset_id)}`,
    task: row as MonthTask,
    share: shareOf(row.proposed_eur, plan.plan.amount_eur),
    to: "/registrar/buy",
  })),
  ...(plan.bucket.proposed_eur.isZero()
    ? []
    : [
        {
          key: "bucket",
          label: "Cubo · presupuesto del mes",
          task: plan.bucket,
          share: shareOf(plan.bucket.proposed_eur, plan.plan.amount_eur),
          to: "/registrar/buy",
        },
      ]),
];

const Line = (props: { line: TaskLine }): JSX.Element => {
  const done = (): boolean => props.line.task.done_on !== undefined;
  return (
    <li class={done() ? "task is-done" : "task"}>
      <span class="task-mark" aria-hidden="true">
        <Show when={done()}>
          <Icon name="check" class="icon-sm" />
        </Show>
      </span>
      <span class="task-label" title={props.line.label}>
        {props.line.label}
        <span class="sr-only">{done() ? ": registrado" : ": pendiente"}</span>
      </span>
      <span class="task-figs">
        <Show when={done()} fallback={<Amount value={props.line.task.proposed_eur} decimals={0} />}>
          <span class="task-date num">{formatDate(props.line.task.done_on ?? "")}</span>
          <span class="meta">
            <Amount value={props.line.task.done_eur} decimals={0} /> de{" "}
            <Amount value={props.line.task.proposed_eur} decimals={0} />
          </span>
        </Show>
      </span>
      <span class="task-share meta">
        <Show when={props.line.share}>
          <Figure value={props.line.share} unit="percent" decimals={1} />
        </Show>
      </span>
    </li>
  );
};

const Ready = (props: {
  plan: Extract<MonthPlan, { status: "ready" }>;
  names: NameIndex;
}): JSX.Element => {
  const lines = (): TaskLine[] => linesOf(props.plan, props.names);
  const wide = mediaQuery(GRID);
  const next = (): TaskLine | undefined =>
    lines().find((line) => line.key !== "deposit" && line.task.done_on === undefined) ??
    lines().find((line) => line.task.done_on === undefined);
  return (
    <>
      <Show when={wide()}>
        <p class="card-note">
          Aportación de {formatMonth(`${props.plan.month}-01`)}:{" "}
          <Amount value={props.plan.plan.amount_eur} decimals={0} />, repartida con los precios del{" "}
          {formatDate(props.plan.plan_date)}. Las órdenes las das tú en tu banco.
        </p>
      </Show>
      <ul class="tasks">
        <For each={lines()}>{(line) => <Line line={line} />}</For>
      </ul>
      <p class="card-note">
        Porcentajes sobre los <Amount value={props.plan.plan.amount_eur} decimals={0} /> del mes
        <Show when={!props.plan.bucket.proposed_eur.isZero()}>
          , cubo incluido. En Cartera, sobre los{" "}
          <Amount value={props.plan.plan.core_amount_eur} decimals={0} /> sin el cubo
        </Show>
        .
      </p>
      <Show
        when={next()}
        fallback={
          <p class="calm">
            <Icon name="check" class="icon-sm" />
            Todo lo del mes está registrado.
          </p>
        }
      >
        {(line) => (
          <A href={line().to} class="card-foot">
            <span>
              {!wide()
                ? "Registrar lo siguiente"
                : line().key === "deposit"
                  ? "Registrar el ingreso del mes"
                  : line().key === "bucket"
                    ? "Registrar la compra del cubo"
                    : `Registrar la compra de ${displayName(props.names, line().key)}`}
            </span>
            <Icon name="arrow" class="icon-sm" />
          </A>
        )}
      </Show>
    </>
  );
};

export const MonthCard = (props: {
  plan: MonthPlan | undefined;
  names: NameIndex;
}): JSX.Element => {
  const wide = mediaQuery(GRID);
  const amount = (): MonthPlan["status"] | undefined => props.plan?.status;
  return (
    <Section
      title="Este mes"
      class="summary-month"
      aside={
        <Show when={!wide()} fallback={<Tag tone="accent">Propuesta</Tag>}>
          <Show when={amount() === "ready"}>
            <Amount
              value={(props.plan as Extract<MonthPlan, { status: "ready" }>).plan.amount_eur}
              decimals={0}
            />
          </Show>
        </Show>
      }
    >
      <Show when={props.plan} fallback={<Skeleton lines={4} />}>
        {(plan) => {
          const current = plan();
          if (current.status === "ready") {
            return <Ready plan={current} names={props.names} />;
          }
          const error = toAppError(
            new DomainError(current.code, current.code, { ...current.details }),
          );
          const remedy = REMEDIES[current.code];
          return (
            <Pending {...(remedy === undefined ? {} : { action: remedy })}>
              El plan de este mes no se puede calcular: {error.message}
            </Pending>
          );
        }}
      </Show>
    </Section>
  );
};
