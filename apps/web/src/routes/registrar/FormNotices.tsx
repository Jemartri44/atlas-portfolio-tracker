// The three things a form may have to say above everything else: the data
// changed underneath it, the record touched a year already declared, or a
// purchase of the bucket has no thesis yet (rule 15).

import { A } from "@solidjs/router";
import type { JSX } from "solid-js";
import { Notice } from "../../components/index.js";

export const Reloaded = (): JSX.Element => (
  <Notice severity="caution" title="Tus datos han cambiado">
    Otra pestaña o la CLI han escrito mientras rellenabas. Se han recargado: vuelve a ver el efecto
    antes de confirmar. No se ha pisado nada.
  </Notice>
);

export const PriorYear = (): JSX.Element => (
  <Notice
    severity="caution"
    title="Ejercicio anterior"
    action={
      <A href="/movimientos" role="button">
        Ver los movimientos
      </A>
    }
  >
    Registrado. El evento rectificado pertenece a un ejercicio anterior: puede afectar a una
    declaración ya presentada.
  </Notice>
);

export const ThesisFirst = (): JSX.Element => (
  <Notice
    severity="caution"
    title="Las compras del cubo exigen una tesis"
    action={
      <A href="/registrar/tesis" role="button">
        Abrir una tesis
      </A>
    }
  >
    La regla 15 pide escribir la tesis <strong>antes</strong> de comprar: la hipótesis, el plazo, la
    condición de invalidación y el tamaño previsto. Si no hay ninguna abierta para esta cuenta y
    este activo, créala ahora y vuelve.
  </Notice>
);
