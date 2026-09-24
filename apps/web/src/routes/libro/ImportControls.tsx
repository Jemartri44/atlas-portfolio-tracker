// Importing a ledger into this browser: from a file, or — on a desktop that
// has the File System Access API — straight from the console's folder, which
// the web reads and never writes (feature 012).
//
// **Importing replaces the whole ledger of this browser**, so when there is
// one it asks first, with both numbers in front of the user: what is here and
// what the file brings. It used to replace without asking (feature 012, block
// 0). A file that is not a ledger is refused before anything is asked or
// touched.

import { createSignal, type JSX, Show } from "solid-js";
import { Icon, Notice } from "../../components/index.js";
import { countOf } from "../../format/number.js";
import { toAppError } from "../../ledger/errors.js";
import { type ImportPlan, importLedger, planImport } from "../../ledger/export.js";
import { readLedgerFromFolder } from "../../ledger/folder.js";
import { canLinkFolder } from "../../ledger/source.js";
import { messageWithLine } from "../../ledger/state.js";

interface Pending {
  text: string;
  plan: ImportPlan;
  /** Where it comes from, in words: «el archivo elegido», «la carpeta Cartera». */
  from: string;
}

export const ImportControls = (props: {
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onImported: (events: number) => void;
  onError: (message: string | undefined) => void;
}): JSX.Element => {
  const [pending, setPending] = createSignal<Pending | undefined>(undefined);

  const guarded = async (action: () => Promise<void>): Promise<void> => {
    props.setBusy(true);
    props.onError(undefined);
    try {
      await action();
    } catch (failure) {
      props.onError(messageWithLine(toAppError(failure)));
    } finally {
      props.setBusy(false);
    }
  };

  const commit = async (text: string): Promise<void> => {
    setPending(undefined);
    props.onImported(await importLedger(text));
  };

  /** Validates first; asks only when there is something to replace. */
  const offer = async (text: string, from: string): Promise<void> => {
    const plan = await planImport(text);
    if (plan.replaces === 0) {
      await commit(text);
      return;
    }
    setPending({ text, plan, from });
  };

  const onFile = async (event: Event): Promise<void> => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file === undefined) {
      return;
    }
    await guarded(async () => offer(await file.text(), "el archivo elegido"));
    input.value = "";
  };

  const onFolder = (): Promise<void> =>
    guarded(async () => {
      const read = await readLedgerFromFolder();
      if (read !== undefined) {
        await offer(read.text, `la carpeta ${read.folder}`);
      }
    });

  return (
    <>
      <div class="choice-actions">
        <label class="file-button">
          <Icon name="import" class="icon-sm" />
          <span>Importar un archivo</span>
          <input
            type="file"
            class="sr-only"
            accept=".jsonl,.json,application/x-ndjson,text/plain"
            disabled={props.busy}
            onChange={(event) => void onFile(event)}
          />
        </label>
        <Show when={canLinkFolder()}>
          <button
            type="button"
            class="secondary"
            disabled={props.busy}
            onClick={() => void onFolder()}
          >
            <Icon name="laptop" class="icon-sm" />
            Importar desde la carpeta de la consola
          </button>
        </Show>
      </div>
      <Show when={pending()}>
        {(current) => (
          <Notice
            severity="caution"
            title="¿Sustituir los datos de este navegador?"
            action={
              <div class="button-row">
                <button
                  type="button"
                  disabled={props.busy}
                  onClick={() => void guarded(() => commit(current().text))}
                >
                  Sustituir
                </button>
                <button
                  type="button"
                  class="secondary"
                  disabled={props.busy}
                  onClick={() => setPending(undefined)}
                >
                  Cancelar
                </button>
              </div>
            }
          >
            Este navegador tiene {countOf(current().plan.replaces, "movimiento", "movimientos")} y{" "}
            {current().from} trae {countOf(current().plan.events, "movimiento", "movimientos")}.
            Importar los sustituye todos: lo que no esté en {current().from} desaparece de este
            navegador. Si no lo has exportado, exporta antes.
          </Notice>
        )}
      </Show>
    </>
  );
};
