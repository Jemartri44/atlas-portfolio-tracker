// The rules of the administration of the remote (ADR-0026, Part A, ADR-0032), as a **door of its
// own**: nothing of the administration may be reachable from the API (architecture test). Only the
// console's `atlas admin` and `atlas backup --from-bucket` import this.

export {
  type AdminEnvironment,
  compareForRestore,
  parseAdminConfig,
  type RestoreComparison,
} from "./admin/restore.js";
