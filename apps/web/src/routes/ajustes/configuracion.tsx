// "¿Qué umbrales tengo puestos?" — the configuration, with the two expensive
// warnings **before** writing: what this change silences (constitution IV) and
// which past tax years it moves (ADR-0013). Both come from the domain
// (`silencedWarnings`, `movedFiscalYears`), so the CLI and the web cannot
// disagree about what a change does.

import {
  ASSET_TYPES,
  type AssetType,
  assets as assetsOf,
  type FiscalYearImpact,
  mergeSettings,
  movedFiscalYears,
  type Settings,
  settingsAt,
  silencedWarnings,
  type Warning,
  yearOf,
} from "@atlas/domain";
import { createMemo, createSignal, For, type JSX, Show } from "solid-js";
import { Amount, Badge, Callout, Dialog, Field, SelectField } from "../../components/index.js";
import { valueLabel } from "../../format/labels.js";
import { describeWarning } from "../../format/messages/warnings.js";
import { formatDecimalString } from "../../format/number.js";
import { changeSettings } from "../../ledger/actions.js";
import { store, today } from "../../ledger/state.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { targetWeightTotal, type WeightTotal } from "../../view-models/index.js";
import { RequireLedger } from "../guard.jsx";

interface NumberSetting {
  key: keyof Settings;
  label: string;
  hint?: string;
  integer?: boolean;
}

const NUMBERS: NumberSetting[] = [
  {
    key: "deviation_threshold_pp",
    label: "Umbral de desviación (pp)",
    hint: "Avisa cuando un activo del núcleo se separa tanto de su objetivo (regla 3).",
  },
  {
    key: "satellite_min_weight_pct",
    label: "Mínimo de un satélite (%)",
    hint: "Por debajo de esto, oro o cripto dejan de ser significativos (regla 6b).",
  },
  { key: "monthly_contribution_eur", label: "Aportación mensual (EUR)" },
  {
    key: "bucket_pct_of_contribution",
    label: "Porcentaje al cubo (%)",
    hint: "El cubo es un presupuesto sobre la aportación, nunca una asignación.",
  },
  { key: "bucket_max_cumulative_contribution", label: "Tope de aporte al cubo (EUR)" },
  { key: "bucket_stop_loss_pct", label: "Regla de parada del cubo (%)" },
  { key: "bucket_max_weight_pct", label: "Peso máximo del cubo (%)" },
  { key: "model_720_alert_threshold_eur", label: "Umbral del Modelo 720 (EUR)" },
  { key: "model_721_alert_threshold_eur", label: "Umbral del Modelo 721 (EUR)" },
  {
    key: "stale_price_days",
    label: "Días para que un precio caduque",
    integer: true,
    hint: "Pasados estos días, un precio se marca caducado (nunca se oculta).",
  },
  {
    key: "transfer_max_days",
    label: "Días máximos de un traspaso",
    integer: true,
    hint: "Referencia del plan; hoy no dispara ningún aviso.",
  },
];

const TEXTS: { key: keyof Settings; label: string; hint?: string }[] = [
  { key: "tax_residence", label: "Residencia fiscal", hint: "Dos letras (ISO 3166-1)." },
  { key: "notification_email", label: "Correo de avisos", hint: "Lo usará la Fase 4." },
];

export default function ConfiguracionRoute(): JSX.Element {
  const [patch, setPatch] = createSignal<Record<string, unknown>>({});
  const [weights, setWeights] = createSignal<Record<string, string> | undefined>(undefined);
  const [error, setError] = createSignal<string | undefined>(undefined);
  const [silenced, setSilenced] = createSignal<Warning[] | undefined>(undefined);
  const [moved, setMoved] = createSignal<FiscalYearImpact[] | undefined>(undefined);
  const [invalidating, setInvalidating] = createSignal<
    readonly { id: string; type: string; error: string }[] | undefined
  >(undefined);
  const [saved, setSaved] = createSignal(false);

  return (
    <RequireLedger skeleton={10}>
      {(snapshot) => {
        const date = today();
        const resolution = () => settingsAt(snapshot.state, date);
        const current = () => resolution().settings;

        const value = (key: keyof Settings): string => {
          const override = patch()[key as string];
          if (override !== undefined) {
            return String(override);
          }
          const existing = current()[key];
          return existing === undefined ? "" : String(existing);
        };

        const set = (key: keyof Settings, raw: string, integer = false): void => {
          const text = raw.trim();
          setPatch({
            ...patch(),
            [key]:
              text === ""
                ? undefined
                : integer
                  ? Number.parseInt(text, 10)
                  : text.replace(",", "."),
          });
        };

        const coreAssets = () => assetsOf(snapshot.state).filter((asset) => asset.book === "core");
        const weightValues = (): Record<string, string> => {
          const existing = weights();
          if (existing !== undefined) {
            return existing;
          }
          const from = current().target_weights ?? {};
          const result: Record<string, string> = {};
          for (const asset of coreAssets()) {
            result[asset.asset_id] = from[asset.asset_id] ?? "";
          }
          return result;
        };
        const weightTotal = createMemo<WeightTotal>(() => targetWeightTotal(weightValues()));

        /** The candidate configuration: what is in force plus what was touched. */
        const candidate = (): Settings => {
          const changes: Record<string, unknown> = { ...patch() };
          const declared = weights();
          if (declared !== undefined) {
            const target: Record<string, string> = {};
            for (const [asset, raw] of Object.entries(declared)) {
              if (raw.trim() !== "") {
                target[asset] = raw.replace(",", ".");
              }
            }
            changes.target_weights = target;
          }
          return mergeSettings(current(), changes as Partial<Settings>);
        };

        const save = async (acceptInvalid = false): Promise<void> => {
          setError(undefined);
          setSaved(false);
          let next: Settings;
          try {
            next = candidate();
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : "La configuración no es válida.");
            return;
          }
          if (!acceptInvalid) {
            const silencedResult = silencedWarnings(snapshot.state, date, current(), next);
            if (silencedResult.silenced.length > 0 && silenced() === undefined) {
              setSilenced(silencedResult.silenced);
              return;
            }
            const movedResult = movedFiscalYears(snapshot.events, current(), next, yearOf(date));
            if (movedResult.length > 0 && moved() === undefined) {
              setMoved(movedResult);
              return;
            }
          }
          const result = await changeSettings(next, acceptInvalid ? { acceptInvalid: true } : {});
          setSilenced(undefined);
          setMoved(undefined);
          if (result.ok) {
            setInvalidating(undefined);
            setPatch({});
            setWeights(undefined);
            setSaved(true);
            return;
          }
          if (result.failure.kind === "dependents") {
            setInvalidating(result.failure.affected);
            return;
          }
          setError(
            result.failure.kind === "conflict"
              ? "El libro ha cambiado desde que se cargó: se ha recargado, vuelve a guardar."
              : result.failure.kind === "error"
                ? result.failure.error.message
                : "No se ha podido guardar.",
          );
        };

        const touched = (): boolean => Object.keys(patch()).length > 0 || weights() !== undefined;

        return (
          <>
            <PageHeader
              title="Configuración"
              lead={`Vigente el ${date} (origen: ${resolution().origin}). Guardar escribe un evento con la configuración completa.`}
            />

            <Show when={saved()}>
              <Callout tone="info" title="Configuración guardada">
                Se ha registrado un cambio de configuración con todos los parámetros.
              </Callout>
            </Show>
            <Show when={error() !== undefined}>
              <Callout tone="error" title="No se ha podido guardar">
                {error()}
              </Callout>
            </Show>

            <div class="stack">
              <section class="card">
                <header>
                  <h2>Pesos objetivo del núcleo</h2>
                  <span class="row tiny">
                    suman {formatDecimalString(weightTotal().total, { decimals: 2 })} de 100
                    <Show when={!weightTotal().addsUp}>
                      <Badge tone="warning">no suman 100</Badge>
                    </Show>
                  </span>
                </header>
                <div class="fieldset">
                  <For each={coreAssets()}>
                    {(asset) => (
                      <Field
                        id={`w-${asset.asset_id}`}
                        kind="decimal"
                        label={`${asset.name} (%)`}
                        hint={asset.asset_id}
                        value={weightValues()[asset.asset_id] ?? ""}
                        onInput={(raw) => setWeights({ ...weightValues(), [asset.asset_id]: raw })}
                      />
                    )}
                  </For>
                </div>
                <p class="note">
                  Los pesos se aplican sobre el valor total del núcleo y tienen que sumar 100. El
                  cubo no entra aquí: es un presupuesto (constitución III).
                </p>
              </section>

              <section class="card">
                <header>
                  <h2>Umbrales y avisos</h2>
                </header>
                <div class="fieldset">
                  <For each={NUMBERS}>
                    {(setting) => (
                      <Field
                        id={`s-${String(setting.key)}`}
                        kind={setting.integer === true ? "integer" : "decimal"}
                        label={setting.label}
                        {...(setting.hint === undefined ? {} : { hint: setting.hint })}
                        value={value(setting.key)}
                        onInput={(raw) => set(setting.key, raw, setting.integer === true)}
                      />
                    )}
                  </For>
                </div>
              </section>

              <section class="card">
                <header>
                  <h2>Cubo e identidad fiscal</h2>
                </header>
                <div class="fieldset">
                  <SelectField
                    id="s-benchmark"
                    label="Índice de referencia del cubo"
                    hint="La alternativa aburrida contra la que se mide cada tesis (regla 16)."
                    placeholder="Sin configurar"
                    value={value("bucket_benchmark_asset_id")}
                    options={assetsOf(snapshot.state).map((asset) => ({
                      value: asset.asset_id,
                      label: asset.name,
                      hint: asset.asset_id,
                    }))}
                    onInput={(raw) =>
                      setPatch({
                        ...patch(),
                        bucket_benchmark_asset_id: raw === "" ? undefined : raw,
                      })
                    }
                  />
                  <For each={TEXTS}>
                    {(setting) => (
                      <Field
                        id={`s-${String(setting.key)}`}
                        kind="text"
                        label={setting.label}
                        {...(setting.hint === undefined ? {} : { hint: setting.hint })}
                        value={value(setting.key)}
                        onInput={(raw) =>
                          setPatch({
                            ...patch(),
                            [setting.key]: raw.trim() === "" ? undefined : raw.trim(),
                          })
                        }
                      />
                    )}
                  </For>
                </div>
              </section>

              <section class="card">
                <header>
                  <h2>Fecha fiscal y ventana de recompra</h2>
                </header>
                <p class="subtle">
                  Por tipo de activo (ADR-0013, ADR-0014). Lo que no se toca toma el valor por
                  defecto documentado, así que añadir un tipo nuevo nunca invalida el libro
                  (ADR-0018).
                </p>
                <div class="fieldset">
                  <For each={ASSET_TYPES}>
                    {(type: AssetType) => (
                      <>
                        <SelectField
                          id={`fdr-${type}`}
                          label={`${valueLabel(type)}: fecha fiscal`}
                          value={String(
                            (patch().fiscal_date_rule as Record<string, string> | undefined)?.[
                              type
                            ] ??
                              current().fiscal_date_rule[type] ??
                              "",
                          )}
                          placeholder="Valor por defecto"
                          options={[
                            { value: "trade_date", label: "Fecha de contratación" },
                            { value: "value_date", label: "Fecha valor" },
                          ]}
                          onInput={(raw) =>
                            setPatch({
                              ...patch(),
                              fiscal_date_rule: {
                                ...current().fiscal_date_rule,
                                ...((patch().fiscal_date_rule as Record<string, string>) ?? {}),
                                ...(raw === "" ? {} : { [type]: raw }),
                              },
                            })
                          }
                        />
                        <Field
                          id={`wsw-${type}`}
                          kind="text"
                          label={`${valueLabel(type)}: ventana`}
                          hint="2m, 1y o <n>d"
                          value={String(
                            (patch().wash_sale_window as Record<string, string> | undefined)?.[
                              type
                            ] ??
                              current().wash_sale_window[type] ??
                              "",
                          )}
                          onInput={(raw) =>
                            setPatch({
                              ...patch(),
                              wash_sale_window: {
                                ...current().wash_sale_window,
                                ...((patch().wash_sale_window as Record<string, string>) ?? {}),
                                ...(raw.trim() === "" ? {} : { [type]: raw.trim() }),
                              },
                            })
                          }
                        />
                      </>
                    )}
                  </For>
                </div>
              </section>

              <Callout tone="info" title="Lo que no se edita aquí">
                Los tramos del ahorro y las frecuencias de los avisos programados los usará el motor
                fiscal y la Fase 4; se editan desde la CLI hasta que existan sus pantallas.
              </Callout>

              <div class="actions-bar">
                <button
                  type="button"
                  class="secondary"
                  disabled={!touched()}
                  onClick={() => {
                    setPatch({});
                    setWeights(undefined);
                  }}
                >
                  Descartar cambios
                </button>
                <button
                  type="button"
                  disabled={!touched() || store.writing()}
                  onClick={() => void save()}
                >
                  Guardar configuración
                </button>
              </div>
            </div>

            <Dialog
              open={silenced() !== undefined}
              title="Este cambio silencia avisos activos"
              onClose={() => setSilenced(undefined)}
              actions={
                <>
                  <button type="button" class="secondary" onClick={() => setSilenced(undefined)}>
                    Cancelar
                  </button>
                  <button type="button" onClick={() => void save()}>
                    Guardar de todas formas
                  </button>
                </>
              }
            >
              <p>
                Subir un umbral no debe apagar un aviso vivo sin que te enteres (constitución IV):
              </p>
              <ul>
                <For each={silenced() ?? []}>
                  {(warning) => <li>{describeWarning(warning)}</li>}
                </For>
              </ul>
            </Dialog>

            <Dialog
              open={moved() !== undefined}
              title="Este cambio mueve ganancias de ejercicios anteriores"
              onClose={() => setMoved(undefined)}
              actions={
                <>
                  <button type="button" class="secondary" onClick={() => setMoved(undefined)}>
                    Cancelar
                  </button>
                  <button type="button" onClick={() => void save()}>
                    Guardar de todas formas
                  </button>
                </>
              }
            >
              <p>
                Los hechos no cambian, cambia su lectura: una declaración ya presentada puede dejar
                de cuadrar.
              </p>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Ejercicio</th>
                    <th scope="col" class="num">
                      Antes
                    </th>
                    <th scope="col" class="num">
                      Después
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <For each={moved() ?? []}>
                    {(impact) => (
                      <tr>
                        <td>{impact.year}</td>
                        <td class="num">
                          <Amount value={impact.before} />
                        </td>
                        <td class="num">
                          <Amount value={impact.after} />
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </Dialog>

            <Dialog
              open={invalidating() !== undefined}
              title="Hay eventos que quedarían inválidos"
              onClose={() => setInvalidating(undefined)}
              actions={
                <>
                  <button
                    type="button"
                    class="secondary"
                    onClick={() => setInvalidating(undefined)}
                  >
                    Cancelar
                  </button>
                  <button type="button" onClick={() => void save(true)}>
                    Aceptar y guardar
                  </button>
                </>
              }
            >
              <p>
                Con la configuración nueva, {invalidating()?.length} eventos ya registrados dejan de
                ser válidos. Los hechos no cambian, cambia su interpretación (ADR-0015): las
                consultas seguirán avisando y no podrás registrar hasta rectificarlos.
              </p>
              <ul>
                <For each={invalidating() ?? []}>
                  {(item) => (
                    <li>
                      {item.type}: {item.error}
                    </li>
                  )}
                </For>
              </ul>
            </Dialog>
          </>
        );
      }}
    </RequireLedger>
  );
}
