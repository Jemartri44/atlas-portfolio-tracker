// The warning of *Atención* for tasks that stopped running: how many, and where to see which. Only
// when one is late; a status that could not be read is said in the card of Ajustes, not here.

import type { NoticeItem } from "../components/index.js";
import type { JobHealthLoad } from "../jobs/job-health.js";

export const lateJobsNotice = (load: JobHealthLoad | undefined): NoticeItem | undefined => {
  const late = load?.kind === "ready" ? load.rows.filter((row) => row.late).length : 0;
  return late === 0
    ? undefined
    : {
        severity: "caution",
        message:
          late === 1
            ? "Una tarea automática lleva más días de la cuenta sin ejecutarse: sus avisos pueden no llegar."
            : `${late} tareas automáticas llevan más días de la cuenta sin ejecutarse: sus avisos pueden no llegar.`,
        action: { label: "Ver las tareas", to: "/ajustes#tareas" },
        count: 1,
      };
};
