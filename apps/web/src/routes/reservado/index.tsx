// The two reserved destinations. They exist because the navigation has four
// slots of equal standing from day one, and they tell the truth: what will be
// here, and which CLI command already answers it today. No fake screen, no
// decorative placeholder.

import { useLocation } from "@solidjs/router";
import { For, type JSX } from "solid-js";
import { PageHeader } from "../../shell/PageHeader.jsx";

interface Reserved {
  title: string;
  lead: string;
  coming: string[];
  command: string;
}

const CORE: Reserved = {
  title: "Núcleo",
  lead: "Pesos objetivo, desviaciones y la calculadora de la aportación mensual.",
  coming: [
    "Peso real y objetivo de cada activo, con la desviación en puntos porcentuales",
    "Reparto de la aportación del mes hacia lo más rezagado (nunca propone ventas)",
    "Comisiones acumuladas, TER medio ponderado y coste anual estimado",
    "Simulador de traspaso entre fondos",
  ],
  command: "atlas weights · atlas contribute · atlas costs",
};

const BUCKET: Reserved = {
  title: "Cubo",
  lead: "Posiciones abiertas, tesis y rendimiento frente al índice.",
  coming: [
    "Posiciones vivas con P&L latente, días abierta y la condición de invalidación a la vista",
    "Resultado de cada tesis frente al índice (regla 16)",
    "Tasa de acierto, esperanza y comisiones sobre el capital operado",
    "Reglas de parada (17) y de recogida (18)",
  ],
  command: "atlas bucket · atlas thesis list",
};

export default function ReservadoRoute(): JSX.Element {
  const location = useLocation();
  const view = (): Reserved => (location.pathname.startsWith("/cubo") ? BUCKET : CORE);

  return (
    <>
      <PageHeader title={view().title} lead={view().lead} />
      <section class="card reserved">
        <header>
          <h2>Llega en la versión siguiente</h2>
          <span class="badge">pendiente</span>
        </header>
        <p>Esta pantalla es la mitad analítica de la aplicación y se construye a continuación.</p>
        <ul>
          <For each={view().coming}>{(line) => <li>{line}</li>}</For>
        </ul>
        <p class="subtle flush">
          Mientras tanto, esto ya lo responde la CLI: <code>{view().command}</code>. Los datos son
          los mismos; lo que falta es la piel.
        </p>
      </section>
    </>
  );
}
