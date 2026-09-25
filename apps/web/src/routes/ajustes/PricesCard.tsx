// «Precios automáticos» in Ajustes (feature 013, block 5): where the web gets
// the daily closes — the folder the console writes, or files imported by
// hand —, how many assets have one, and what is wrong when something is.
//
// The web never downloads a price: on the desktop the console does
// (`atlas prices update`); **on the phone there are no automatic prices until
// the cloud exists**, only the import by hand. And the console downloads the
// prices of the assets of **its** ledger (P5). All of it said as it is.

import { createResource, createSignal, type JSX, Show } from "solid-js";
import { Icon, Notice, Section } from "../../components/index.js";
import { formatDate, formatInstantDate } from "../../format/date.js";
import { toAppError } from "../../ledger/errors.js";
import { canLinkFolder } from "../../ledger/source.js";
import { store } from "../../ledger/state.js";

const prices = () => import("../../prices/quotes.js");

const PROBLEMS = {
  permission:
    "Hay una carpeta enlazada, pero el navegador ha perdido el permiso para leerla. Vuelve a enlazarla en «Tipos del BCE».",
  storage:
    "Este navegador no permite guardar datos del sitio: no puede guardar precios importados.",
} as const;

export const PricesCard = (): JSX.Element => {
  // Keyed on the ledger: Ajustes can be painted before the ledger is open, and
  // reading the prices of an empty catalogue said «sin precios» of a device
  // that had them (seen on the screen, 2026-09-25; no test had caught it).
  const [quotes, { refetch }] = createResource(
    () => ({ snapshot: store.snapshot() }),
    async ({ snapshot }) =>
      (await prices()).loadWebQuotes([...(snapshot?.state.assets.keys() ?? [])]),
  );
  const [busy, setBusy] = createSignal(false);
  const [said, setSaid] = createSignal<{ tone: "info" | "danger" | "caution"; text: string }>();

  const latest = (): string | undefined => {
    let last: string | undefined;
    for (const closes of quotes()?.closes.values() ?? []) {
      const date = closes.at(-1)?.date;
      if (date !== undefined && (last === undefined || date > last)) {
        last = date;
      }
    }
    return last;
  };

  const onImport = async (event: Event): Promise<void> => {
    const input = event.currentTarget as HTMLInputElement;
    const chosen = [...(input.files ?? [])];
    if (chosen.length === 0) {
      return;
    }
    setBusy(true);
    setSaid(undefined);
    try {
      const outcome = await (await prices()).importPriceFiles(
        await Promise.all(
          chosen.map(async (file) => ({ name: file.name, text: await file.text() })),
        ),
      );
      setSaid(
        outcome.kind === "imported"
          ? {
              tone: "info",
              text: `Precios importados de ${outcome.assets.length === 1 ? "un activo" : `${outcome.assets.length} activos`}.${
                outcome.ignored.length === 0
                  ? ""
                  : ` No se han importado ${outcome.ignored.map((name) => `«${name}»`).join(", ")}: no son precios.`
              }`,
            }
          : {
              tone: "caution",
              text: `«${outcome.file}» no es un fichero de precios que se entienda: no se ha importado nada. Elige los ficheros de la carpeta prices que escribe la consola.`,
            },
      );
    } catch (failure) {
      setSaid({ tone: "danger", text: toAppError(failure).message });
    } finally {
      setBusy(false);
      input.value = "";
      refetch();
    }
  };

  const onForget = async (): Promise<void> => {
    setBusy(true);
    setSaid(undefined);
    try {
      await (await prices()).forgetPrices();
      setSaid({
        tone: "info",
        text: "Precios importados borrados de este navegador. Las valoraciones que registras a mano siguen ahí.",
      });
    } catch (failure) {
      setSaid({ tone: "danger", text: toAppError(failure).message });
    } finally {
      setBusy(false);
      refetch();
    }
  };

  return (
    <Section title="Precios automáticos">
      <Show when={quotes()} fallback={<p class="meta">Leyendo…</p>}>
        {(loaded) => (
          <>
            <Show
              when={loaded().closes.size > 0}
              fallback={
                <p>
                  <strong>Sin precios automáticos en este dispositivo.</strong> Los valores salen de
                  las valoraciones que registras a mano.
                </p>
              }
            >
              <p>
                {loaded().origin === "folder"
                  ? "Los que descargó la consola en la carpeta enlazada"
                  : "Importados a mano en este navegador"}
                : {loaded().closes.size === 1 ? "un activo" : `${loaded().closes.size} activos`},
                con cierres hasta el {formatDate(latest() as string)}
                {loaded().importedAt === undefined
                  ? "."
                  : `; importados el ${formatInstantDate(loaded().importedAt as string)}.`}
              </p>
            </Show>
            <Show when={loaded().problem}>
              {(problem) => <p class="card-note">{PROBLEMS[problem()]}</p>}
            </Show>
          </>
        )}
      </Show>
      <Show when={said()}>
        {(message) => <Notice severity={message().tone}>{message().text}</Notice>}
      </Show>
      <div class="button-row">
        <label class="file-button">
          <Icon name="import" class="icon-sm" />
          <span>Importar precios</span>
          <input
            type="file"
            class="sr-only"
            accept=".jsonl"
            multiple
            disabled={busy()}
            onChange={(event) => void onImport(event)}
          />
        </label>
        <Show when={quotes()?.origin === "imported"}>
          <button type="button" class="secondary" disabled={busy()} onClick={() => void onForget()}>
            Borrar los precios importados
          </button>
        </Show>
      </div>
      <Show
        when={canLinkFolder()}
        fallback={
          <p class="card-note">
            En el teléfono no hay precios automáticos hasta que exista la sincronización con la
            nube. Puedes importar a mano los ficheros de la carpeta <code>prices</code> que descarga
            la consola.
          </p>
        }
      >
        <p class="card-note">
          La web no descarga precios. Los descarga la consola con <code>atlas prices update</code>{" "}
          en la carpeta del libro, y la web los lee de la carpeta enlazada.
        </p>
      </Show>
      <p class="card-note">
        La consola descarga los precios de los activos de su libro: un activo dado de alta solo en
        esta web no tiene precio automático hasta que pase al libro de la consola exportándolo e
        importándolo.
      </p>
    </Section>
  );
};
