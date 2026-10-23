// «Precios automáticos» in Ajustes: the daily closes the
// web uses are the files imported by hand into this browser; the card says how
// many assets have one and what is wrong when something is. The web never
// downloads a price.

import { createResource, type JSX, Show } from "solid-js";
import { Icon, Section } from "../../components/index.js";
import { formatDate, formatInstantDate } from "../../format/date.js";
import { store } from "../../ledger/state.js";
import { SaidNotice, useCardAction } from "./card-action.jsx";

const prices = () => import("../../prices/quotes.js");

const PROBLEMS = {
  storage:
    "Este navegador no permite guardar datos del sitio: no puede guardar precios importados.",
} as const;

export const PricesCard = (): JSX.Element => {
  // Keyed on the ledger: Ajustes can be painted before the ledger is open, and reading the prices
  // of an empty catalogue said «sin precios» of a device that had them.
  const [quotes, { refetch }] = createResource(
    () => ({ snapshot: store.snapshot() }),
    async ({ snapshot }) =>
      (await prices()).loadWebQuotes([...(snapshot?.state.assets.keys() ?? [])]),
  );
  const { busy, said, run } = useCardAction(() => void refetch());

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
    await run(async () => {
      const outcome = await (await prices()).importPriceFiles(
        await Promise.all(
          chosen.map(async (file) => ({ name: file.name, text: await file.text() })),
        ),
      );
      return outcome.kind === "imported"
        ? `Precios importados de ${outcome.assets.length === 1 ? "un activo" : `${outcome.assets.length} activos`}.${
            outcome.ignored.length === 0
              ? ""
              : ` No se han importado ${outcome.ignored.map((name) => `«${name}»`).join(", ")}: no son precios.`
          }`
        : {
            tone: "caution",
            text: `«${outcome.file}» no es un fichero de precios que se entienda: no se ha importado nada. Elige los ficheros de la carpeta prices que escribe la consola.`,
          };
    });
    input.value = "";
  };

  const onForget = (): Promise<void> =>
    run(async () => {
      await (await prices()).forgetPrices();
      return "Precios importados borrados de este navegador. Las valoraciones que registras a mano siguen ahí.";
    });

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
                Importados a mano en este navegador :{" "}
                {loaded().closes.size === 1 ? "un activo" : `${loaded().closes.size} activos`}, con
                cierres hasta el {formatDate(latest() as string)}
                {loaded().importedAt === undefined
                  ? "."
                  : `; importados el ${formatInstantDate(loaded().importedAt as string)}.`}
              </p>
            </Show>
            <Show when={loaded().problem}>
              {(problem) => <p class="card-note">{PROBLEMS[problem()]}</p>}
            </Show>
            <Show when={loaded().symbolsNotice}>{(said) => <p class="card-note">{said()}</p>}</Show>
          </>
        )}
      </Show>
      <SaidNotice said={said()} />
      <div class="button-row">
        <label class="file-button">
          <Icon name="import" class="icon-sm" />
          <span>Importar precios</span>
          <input
            type="file"
            class="sr-only"
            accept=".jsonl,.json"
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
      <p class="card-note">
        La web no descarga precios y todavía no los baja de la nube. Puedes importar a mano los
        ficheros de la carpeta <code>prices</code> que descarga la consola.
      </p>
      <p class="card-note">
        La consola descarga los precios de los activos de su libro: un activo dado de alta solo en
        esta web no tiene precio automático hasta que pase al libro de la consola exportándolo e
        importándolo.
      </p>
    </Section>
  );
};
