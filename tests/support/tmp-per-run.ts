import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * One temporary folder per test run. Many tests create their scratch folders
 * with `mkdtemp(join(tmpdir(), "atlas-…"))` and never remove them; pointing
 * `TMPDIR` at a folder of the run, deleted at the end, keeps `/tmp` clean
 * without touching each test.
 *
 * The real temporary folder survives as `ATLAS_TEST_CACHE_ROOT`: the infra
 * suite keeps its Terraform provider and plan caches there, on purpose, so
 * they outlive a run.
 */
export default function setup(): () => void {
  const real = process.env.ATLAS_TEST_CACHE_ROOT ?? tmpdir();
  const run = mkdtempSync(join(real, "atlas-run-"));
  mkdirSync(run, { recursive: true });
  process.env.ATLAS_TEST_CACHE_ROOT = real;
  process.env.TMPDIR = run;
  return () => {
    rmSync(run, { recursive: true, force: true });
  };
}
