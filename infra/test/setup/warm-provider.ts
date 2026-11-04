import { join } from "node:path";
import { initRoot, scratchCopy } from "../lib/terraform.js";

// Runs once, before the workers of the `infra` project start: Terraform does not
// promise that its plugin cache survives several `init` writing at the same time,
// so the provider is installed here, alone. With the cache warm this is a copy.
export default function warmProvider(): void {
  const scratch = scratchCopy();
  const run = initRoot(join(scratch, "bootstrap", "account"), []);
  if (run.status !== 0) {
    throw new Error(`warming the provider cache failed:\n${run.stderr}${run.stdout}`);
  }
}
