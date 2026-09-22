// What was just written, said on the movement it wrote.
//
// A rectification used to leave the user where they were. For a movement of a
// past tax year the form stayed open with a notice, and the reload of the
// ledger that follows every write mounted the form again with the original
// values and without the notice: «8.700» on screen again, as if nothing had
// happened, and a second try answered «Ese evento ya está anulado» (third pass
// of the review of 2026-09-19). Now every write leads to the detail of the
// movement it wrote, and the confirmation travels in the address, so no reload
// can take it away.

import { useSearchParams } from "@solidjs/router";
import { type JSX, Show } from "solid-js";
import { Notice } from "../../components/index.js";

export type Done = "registrado" | "corregido" | "anulado";

/** Where to go after a write: the movement written, with what was done. */
export const doneUrl = (id: string, done: Done, priorYear: boolean): string =>
  `/movimientos/${id}?hecho=${done}${priorYear ? "&ejercicio=anterior" : ""}`;

const SAID: Readonly<Record<Done, { title: string; text: string }>> = {
  registrado: { title: "Registrado", text: "El movimiento ya está en tus datos." },
  corregido: {
    title: "Corrección registrada",
    text: "Se anuló el original y se registró este en su lugar. Los dos siguen en tus datos, enlazados.",
  },
  anulado: {
    title: "Anulación registrada",
    text: "El movimiento anulado deja de tener efecto. Sigue en tus datos, marcado como anulado.",
  },
};

/** What happened to the original, in the warning of a past year: said as it was done. */
const WHAT: Readonly<Record<Done, string>> = {
  registrado: "registrado",
  corregido: "corregido",
  anulado: "anulado",
};

export const Rectified = (): JSX.Element => {
  const [params] = useSearchParams<{ hecho?: string; ejercicio?: string }>();
  const said = () => SAID[params.hecho as Done] as (typeof SAID)[Done] | undefined;
  return (
    <>
      <Show when={said()}>
        {(done) => (
          <Notice severity="info" title={done().title}>
            {done().text}
          </Notice>
        )}
      </Show>
      <Show when={params.ejercicio === "anterior"}>
        <Notice severity="caution" title="Ejercicio anterior">
          El movimiento {WHAT[params.hecho as Done] ?? "rectificado"} pertenece a un ejercicio
          anterior: puede afectar a una declaración ya presentada.
        </Notice>
      </Show>
    </>
  );
};
