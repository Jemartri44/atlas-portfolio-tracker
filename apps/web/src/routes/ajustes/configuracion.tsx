// "¿Qué umbrales tengo puestos?" — the configuration, with the two expensive
// warnings **before** writing: what this change silences (constitution IV) and
// which past tax years it moves (ADR-0013). Both come from the domain
// (`silencedWarnings`, `movedFiscalYears`), so the CLI and the web cannot
// disagree about what a change does.
//
// What is left here is the state of the draft and the save. The fields live in
// `view-models/settings.ts`, where a test reaches them without a DOM; the four
// blocks in `SettingsCards.tsx`, and the three questions in
// `SettingsDialogs.tsx` (review of 2026-09-18: this file was 517 lines).

import {
  type AssetType,
  assets as assetsOf,
  type FiscalYearImpact,
  movedFiscalYears,
  type Settings,
  settingsAt,
  silencedWarnings,
  type Warning,
  yearOf,
} from "@atlas/domain";
import { createSignal, type JSX, Show } from "solid-js";
import { Callout } from "../../components/index.js";
import { nameIndex } from "../../format/names.js";
import { toAppError } from "../../ledger/errors.js";
import type { AppError } from "../../ledger/state.js";
import { store, today } from "../../ledger/state.js";
import { changeSettings } from "../../ledger/write.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import {
  candidateSettings,
  type PerAssetTypeKey,
  type SettingsPatch,
  settingsTouched,
  type WeightDraft,
  weightValues,
  withNumber,
  withOption,
  withPerAssetType,
  withText,
} from "../../view-models/index.js";
import { RequireLedger } from "../guard.jsx";
import { FormActions } from "../registrar/FormActions.jsx";
import {
  FiscalCard,
  IdentityCard,
  type SettingsDraft,
  ThresholdsCard,
  WeightsCard,
} from "./SettingsCards.jsx";
import { type InvalidatedEvent, SettingsDialogs } from "./SettingsDialogs.jsx";

export default function ConfiguracionRoute(): JSX.Element {
  const [patch, setPatch] = createSignal<SettingsPatch>({});
  const [weights, setWeights] = createSignal<WeightDraft>(undefined);
  const [error, setError] = createSignal<AppError | undefined>(undefined);
  const [silenced, setSilenced] = createSignal<readonly Warning[] | undefined>(undefined);
  const [moved, setMoved] = createSignal<readonly FiscalYearImpact[] | undefined>(undefined);
  const [invalidating, setInvalidating] = createSignal<readonly InvalidatedEvent[] | undefined>(
    undefined,
  );
  const [saved, setSaved] = createSignal(false);

  return (
    <RequireLedger skeleton={10}>
      {(snapshot) => {
        const date = today();
        const resolution = () => settingsAt(snapshot.state, date);
        const current = (): Settings => resolution().settings;

        const coreAssets = () => assetsOf(snapshot.state).filter((asset) => asset.book === "core");
        const values = (): Record<string, string> =>
          weightValues(
            current(),
            coreAssets().map((asset) => asset.asset_id),
            weights(),
          );

        const draft = (): SettingsDraft => ({
          current: current(),
          patch: patch(),
          onNumber: (key, raw, integer) => setPatch(withNumber(patch(), key, raw, integer)),
          onText: (key, raw) => setPatch(withText(patch(), key, raw)),
          onOption: (key, raw) => setPatch(withOption(patch(), key, raw)),
          onPerAssetType: (key: PerAssetTypeKey, type: AssetType, raw: string) =>
            setPatch(withPerAssetType(current(), patch(), key, type, raw)),
        });

        const discard = (): void => {
          setPatch({});
          setWeights(undefined);
        };

        const save = async (acceptInvalid = false): Promise<void> => {
          setError(undefined);
          setSaved(false);
          let next: Settings;
          try {
            next = candidateSettings(current(), patch(), weights());
          } catch (failure) {
            // `toAppError` and not `failure.message`: the domain speaks English
            // by contract and each interface translates (decision (i)).
            setError(toAppError(failure));
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
            discard();
            setSaved(true);
            // The confirmation is at the top: take the user there to read it.
            window.scrollTo?.({ top: 0 });
            return;
          }
          if (result.failure.kind === "dependents") {
            setInvalidating(result.failure.affected);
            return;
          }
          /*
           * The whole `AppError`, not just its text: it carries the action that
           * fixes the problem — "Exportar el libro" when the browser storage is
           * full, "Abrir el libro" when the folder permission is gone — and
           * this screen used to drop it, so the user read what to do and had
           * nowhere to press (inventory V6).
           */
          setError(
            result.failure.kind === "error"
              ? result.failure.error
              : {
                  code: result.failure.kind,
                  message:
                    result.failure.kind === "conflict"
                      ? "El libro ha cambiado desde que se cargó: se ha recargado, vuelve a guardar."
                      : "No se ha podido guardar.",
                },
          );
        };

        const touched = (): boolean => settingsTouched(patch(), weights());

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
            <div class="stack">
              <WeightsCard
                assets={coreAssets()}
                values={values()}
                onWeight={(assetId, raw) => setWeights({ ...values(), [assetId]: raw })}
              />
              <ThresholdsCard draft={draft()} />
              <IdentityCard draft={draft()} assets={assetsOf(snapshot.state)} />
              <FiscalCard draft={draft()} />

              <Callout tone="info" title="Lo que no se edita aquí">
                Los tramos del ahorro y las frecuencias de los avisos programados los usará el motor
                fiscal y la Fase 4; se editan desde la CLI hasta que existan sus pantallas.
              </Callout>

              {/* The error of a save goes next to the button that caused it. */}
              <FormActions
                failure={error()}
                failureTitle="No se ha podido guardar"
                blocked={touched() ? undefined : "No has cambiado nada todavía."}
              >
                <button type="button" class="secondary" disabled={!touched()} onClick={discard}>
                  Descartar cambios
                </button>
                <button
                  type="button"
                  disabled={!touched() || store.writing()}
                  onClick={() => void save()}
                >
                  Guardar configuración
                </button>
              </FormActions>
            </div>

            <SettingsDialogs
              silenced={silenced()}
              moved={moved()}
              invalidating={invalidating()}
              onDismiss={(which) => {
                if (which === "silenced") {
                  setSilenced(undefined);
                } else if (which === "moved") {
                  setMoved(undefined);
                } else {
                  setInvalidating(undefined);
                }
              }}
              onSave={(acceptInvalid) => void save(acceptInvalid ?? false)}
              names={nameIndex(snapshot.state)}
            />
          </>
        );
      }}
    </RequireLedger>
  );
}
