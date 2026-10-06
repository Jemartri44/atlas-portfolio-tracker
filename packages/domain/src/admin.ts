// The rules of the administration of the remote (feature 015, E5; ADR-0026,
// Part A; ADR-0032; ADR-0033, point 8), as a **door of its own**, apart from
// `@atlas/domain/access`: the API reaches that one, and nothing of the
// administration may be reachable from it (architecture test). Only the
// console's `atlas admin` and `atlas backup --from-bucket` import this.

export {
  type AdminDeviceRead,
  type AdminEnvironment,
  compareForRestore,
  forgetRefusal,
  forgottenDevice,
  parseAdminConfig,
  type RestoreComparison,
} from "./access/admin.js";
