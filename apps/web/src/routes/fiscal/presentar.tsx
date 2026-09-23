// "Registrar lo presentado" — the return that was actually filed (ADR-0020).
//
// It starts from **what the application computes**, because nobody types a
// dozen figures for fun, and every field can be corrected to what was really
// declared: the two are not the same thing, and the whole point of the event
// is that the ledger keeps the second one even when the application computes
// something else today (decision (l) of the prompt).
//
// Two rules of the house live in the form itself: what arrives preloaded is
// **the user's data**, so it is masked until the field has the focus
// (`system.md` §5.10), and what the user types is never masked back at them.
// And nothing is written without a confirmation: turning a calculation into
// "what was filed" by pressing enter is exactly what ADR-0020 separates.

import type { FilingModel } from "@atlas/domain";
import { filingProposal } from "@atlas/domain/fiscal";
import { A, useNavigate, useParams } from "@solidjs/router";
import { createMemo, createSignal, For, type JSX, Show } from "solid-js";
import { Field, Notice, Section } from "../../components/index.js";
import { decimalForInput, parseDecimalInput } from "../../format/input.js";
import { nameIndex } from "../../format/names.js";
import { toAppError } from "../../ledger/errors.js";
import type { AppError } from "../../ledger/state.js";
import { today } from "../../ledger/state.js";
import { recordDraft } from "../../ledger/write.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { filingFields, filingTitle } from "../../view-models/fiscal/index.js";
import { RequireLedger } from "../guard.jsx";
import { FormActions } from "../registrar/FormActions.jsx";

const MODELS = new Set(["renta", "720", "721"]);

/** What went wrong with a write, in one sentence and with no jargon. */
const failureText = (kind: string): string =>
  kind === "conflict"
    ? "Tus datos han cambiado mientras rellenabas esto. Se han vuelto a leer: comprueba las cifras y vuelve a registrarlo."
    : kind === "duplicate"
      ? "Ya hay una presentación idéntica registrada."
      : "No se ha podido registrar.";

export default function PresentarRoute(): JSX.Element {
  const params = useParams<{ modelo: string; ano: string }>();
  const navigate = useNavigate();
  const [typed, setTyped] = createSignal<Record<string, string>>({});
  const [meta, setMeta] = createSignal({ filed_at: today(), receipt: "", notes: "" });
  const [problem, setProblem] = createSignal<string | undefined>();
  const [failure, setFailure] = createSignal<AppError | undefined>();
  const [busy, setBusy] = createSignal(false);

  return (
    <RequireLedger writes skeleton={5}>
      {(snapshot) => {
        const model = params.modelo as FilingModel;
        const year = Number(params.ano);
        if (!MODELS.has(model) || !Number.isInteger(year)) {
          return (
            <Notice severity="danger" title="Esa declaración no existe">
              Vuelve a <A href="/fiscal">la pantalla de la declaración</A> y elige el ejercicio
              desde ahí.
            </Notice>
          );
        }
        const names = nameIndex(snapshot.state);
        const proposal = createMemo(() =>
          filingProposal(snapshot.events, model, year, { today: today() }),
        );
        const fields = createMemo(() => filingFields(proposal(), names));
        /** What the field shows: what was typed, or what the application computes. */
        const shown = (key: string, proposed: string): string =>
          typed()[key] ?? decimalForInput(proposed);

        const record = async (): Promise<void> => {
          setProblem(undefined);
          setFailure(undefined);
          const declared = new Map<string, string>();
          for (const field of fields()) {
            const raw = typed()[field.key];
            if (raw === undefined) {
              continue;
            }
            const parsed = parseDecimalInput(raw);
            if (!parsed.ok) {
              setProblem(`${field.label}: ${parsed.message}`);
              return;
            }
            declared.set(field.key, parsed.value);
          }
          const current = meta();
          if (current.receipt.trim() === "") {
            setProblem(
              "Falta el justificante. Es el número que te da la Agencia Tributaria al presentar; sin él no hay forma de encontrar esta declaración después.",
            );
            return;
          }
          const draft = proposal().draft(declared, {
            filed_at: current.filed_at,
            receipt_reference: current.receipt.trim(),
            ...(current.notes.trim() === "" ? {} : { notes: current.notes.trim() }),
          });
          setBusy(true);
          try {
            const result = await recordDraft(draft as never);
            if (result.ok) {
              navigate(`/fiscal?ejercicio=${year}`, { replace: true });
              return;
            }
            if (result.failure.kind === "error") {
              setFailure(result.failure.error);
            } else {
              setProblem(failureText(result.failure.kind));
            }
          } catch (error) {
            setFailure(toAppError(error));
          } finally {
            setBusy(false);
          }
        };

        return (
          <>
            <PageHeader
              title="Registrar lo presentado"
              lead={filingTitle(model, year)}
              actions={
                <A href={`/fiscal?ejercicio=${year}`} role="button" class="secondary">
                  Cancelar
                </A>
              }
            />
            <div class="grid">
              <Section title="Lo que declaraste" class="span-12">
                <Show when={proposal().supersedes !== undefined}>
                  <Notice severity="info" title="Esto es una complementaria">
                    Ya consta una presentación de este ejercicio. La que registres ahora la
                    sustituye; la primera sigue constando, porque ocurrió.
                  </Notice>
                </Show>
                <p class="card-note">
                  Las cifras llegan con lo que la aplicación calcula hoy. Corrige la que no coincida
                  con lo que presentaste: lo que se guarda es lo tuyo, aunque la aplicación calcule
                  otra cosa.
                </p>
                <For each={fields()}>
                  {(field) => (
                    <Field
                      id={`f-${field.key.replaceAll(".", "-")}`}
                      kind="decimal"
                      unit="€"
                      sensitive
                      label={field.label}
                      value={shown(field.key, field.computed)}
                      onInput={(value) => setTyped({ ...typed(), [field.key]: value })}
                    />
                  )}
                </For>
                <Field
                  id="f-filed-at"
                  kind="date"
                  label="Fecha de presentación"
                  value={meta().filed_at}
                  onInput={(value) => setMeta({ ...meta(), filed_at: value })}
                  required
                />
                <Field
                  id="f-receipt"
                  kind="text"
                  label="Número de justificante"
                  hint="El que da la Agencia Tributaria al presentar."
                  value={meta().receipt}
                  onInput={(value) => setMeta({ ...meta(), receipt: value })}
                  required
                />
                <Field
                  id="f-notes"
                  kind="textarea"
                  label="Notas"
                  value={meta().notes}
                  onInput={(value) => setMeta({ ...meta(), notes: value })}
                />
                <FormActions problem={problem()} failure={failure()}>
                  <button type="button" disabled={busy()} onClick={() => void record()}>
                    Registrar lo presentado
                  </button>
                </FormActions>
              </Section>
            </div>
          </>
        );
      }}
    </RequireLedger>
  );
}
