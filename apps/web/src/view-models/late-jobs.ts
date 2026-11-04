// The warning of *Atención* for tasks that stopped running: how many, and where to see which. A
// status that could not be read is said too: quiet here would read as all of them on time.

import type { FoldedNotice } from "../components/index.js";
import type { JobHealthLoad } from "../jobs/job-health.js";

const SEE_THEM = { label: "Ver las tareas", to: "/ajustes#tareas" };

export const lateJobsNotice = (load: JobHealthLoad | undefined): FoldedNotice | undefined => {
  if (load?.kind === "failed") {
    return {
      severity: "caution",
      title: "Estado de las tareas sin comprobar",
      message: "No se ha podido comprobar si las tareas automáticas se están ejecutando.",
      action: SEE_THEM,
      count: 1,
    };
  }
  const late = load?.kind === "ready" ? load.rows.filter((row) => row.late).length : 0;
  return late === 0
    ? undefined
    : {
        severity: "caution",
        title:
          late === 1 ? "Tarea automática con retraso" : `${late} tareas automáticas con retraso`,
        message:
          late === 1
            ? "Una tarea automática lleva más días de la cuenta sin ejecutarse: sus avisos pueden no llegar."
            : `${late} tareas automáticas llevan más días de la cuenta sin ejecutarse: sus avisos pueden no llegar.`,
        action: SEE_THEM,
        count: 1,
      };
};
