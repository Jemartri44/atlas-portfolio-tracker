// The automatic prices of a screen: loaded after the
// first paint, from what was imported by hand, and passed to the
// domain through the one gate. Until they arrive — or without any — every
// screen works exactly as before, with the manual prices.

import type { AssetId, ExternalPrices, LedgerState } from "@atlas/domain";
import { type Accessor, createResource, type JSX, Show } from "solid-js";
import { Notice } from "../components/index.js";
import type { WebQuotes } from "./quotes.js";

// Imported when the screen asks, not with it: a static import made every
// screen that shows prices name the chunks of the import store, the ECB and the
// quotes in the table of preloads of the entry, which is on the boot path
// (+33 bytes measured).
const quotesModule = () => import("./quotes.js");

interface ScreenQuotes {
  readonly quotes: Accessor<WebQuotes | undefined>;
  /** The prices could not be loaded at all (the screen works with the manual ones and says so). */
  readonly failed: Accessor<boolean>;
  /** The quotes for the ledger cut at a date (`asOf`): the gate takes them as they are. */
  readonly external: (state: LedgerState) => ExternalPrices | undefined;
}

/** Loads the closes of the assets of `state` once, for one screen. */
export const useQuotes = (state: LedgerState): ScreenQuotes => {
  const ids: AssetId[] = [...state.assets.keys()];
  // Informational prices never take a screen with them: a chunk that does not load (an installed
  // PWA whose chunk is gone) is said by the notice, and the screen goes on with the manual ones.
  const [loaded] = createResource(async () => {
    try {
      const module = await quotesModule();
      return { quotes: await module.loadWebQuotes(ids), externalOf: module.externalOf };
    } catch {
      return "unavailable" as const;
    }
  });
  const ready = () => {
    const current = loaded();
    return current === undefined || current === "unavailable" ? undefined : current;
  };
  return {
    quotes: () => ready()?.quotes,
    failed: () => loaded() === "unavailable",
    external: (dated) => {
      const current = ready();
      return current === undefined ? undefined : current.externalOf(current.quotes, dated);
    },
  };
};

const PROBLEMS = {
  storage:
    "Este navegador no permite leer datos guardados del sitio: no hay precios automáticos importados.",
} as const;

/** What a screen says about its automatic prices when something is wrong: never silent. */
export const QuotesNotice = (props: { prices: ScreenQuotes }): JSX.Element => (
  <>
    <Show when={props.prices.failed()}>
      <Notice severity="caution">
        No se han podido cargar los precios automáticos: las cifras usan solo las valoraciones que
        registraste. Recarga la página para intentarlo otra vez.
      </Notice>
    </Show>
    <Show when={props.prices.quotes()}>
      {(quotes) => (
        <>
          <Show when={quotes().problem}>
            {(problem) => <Notice severity="caution">{PROBLEMS[problem()]}</Notice>}
          </Show>
          <Show when={quotes().symbolsNotice}>
            {(said) => <Notice severity="caution">{said()}</Notice>}
          </Show>
          <Show when={quotes().mismatched.length > 0}>
            <Notice severity="caution">
              {`Hay cierres guardados en una divisa que no es la declarada para su fuente (${quotes()
                .mismatched.map((m) => m.asset_id)
                .join(
                  ", ",
                )}): no se usan en ninguna cifra en euros. Púrgalos desde la consola con «atlas prices purge»: la próxima descarga vuelve a pedir esos días una vez.`}
            </Notice>
          </Show>
          <Show when={quotes().unreadable.length > 0}>
            <Notice severity="caution">
              {`Los precios automáticos de ${quotes().unreadable.length === 1 ? "un activo no se pueden leer" : `${quotes().unreadable.length} activos no se pueden leer`}: esos activos se quedan sin precio automático, porque nunca se leen a medias. Descárgalos otra vez con la consola.`}
            </Notice>
          </Show>
        </>
      )}
    </Show>
  </>
);
