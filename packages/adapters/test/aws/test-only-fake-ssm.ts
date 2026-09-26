// TEST ONLY — a double of SSM Parameter Store for the narrow `ParameterStore`,
// never reachable from the product. It imitates what block 0 of E2 verified
// (`specs/015-api-access/questions.md` §18):
//
// - **every version is kept**, and `GetParameter` resolves `name:version` and
//   `name:label` like SSM («To query by parameter label, use "Name":
//   "name:label". To query by parameter version, use "Name":
//   "name:version"»), so the mutant of B1 dies against the service's own
//   behaviour and not against a guess;
// - `PutParameter` without `Overwrite` on an existing name answers
//   `ParameterAlreadyExists` («You can't create duplicate parameters»), and a
//   concurrent update `TooManyUpdates` («There are concurrent updates for a
//   resource that supports one update at a time»), translated to a transient
//   failure as the adapter of the SDK will;
// - a throttled call fails as a `ThrottlingException` does once translated
//   (ADR-0034, row 13).

import {
  DependencyUnavailable,
  type ParameterEntry,
  type ParameterStore,
} from "@atlas/adapters/aws";

export class TestOnlyFakeSsm implements ParameterStore {
  private readonly versions = new Map<string, string[]>();
  private readonly labels = new Map<string, Map<string, number>>();
  private readonly tagsOf = new Map<string, Readonly<Record<string, string>>>();
  private throttles = 0;
  private collisions = 0;
  readonly reads: string[] = [];
  readonly writes: string[] = [];

  set(name: string, value: string): void {
    this.versions.set(name, [...(this.versions.get(name) ?? []), value]);
  }

  delete(name: string): void {
    this.versions.delete(name);
  }

  label(name: string, label: string, version: number): void {
    const labels = this.labels.get(name) ?? new Map<string, number>();
    labels.set(label, version);
    this.labels.set(name, labels);
  }

  throttleNext(count = 1): void {
    this.throttles = count;
  }

  /** The next `putNew` finds another update in flight (`TooManyUpdates`). */
  collideNext(count = 1): void {
    this.collisions = count;
  }

  tags(name: string): Readonly<Record<string, string>> | undefined {
    return this.tagsOf.get(name);
  }

  history(name: string): readonly string[] {
    return this.versions.get(name) ?? [];
  }

  private step(): void {
    if (this.throttles > 0) {
      this.throttles -= 1;
      throw new DependencyUnavailable("ssm", "throttling");
    }
  }

  async get(name: string): Promise<string | undefined> {
    this.reads.push(name);
    this.step();
    const at = name.lastIndexOf(":");
    const base = at > name.lastIndexOf("/") && at >= 0 ? name.slice(0, at) : name;
    const selector = base === name ? undefined : name.slice(at + 1);
    const versions = this.versions.get(base);
    if (versions === undefined) {
      return undefined;
    }
    if (selector === undefined) {
      return versions.at(-1);
    }
    const version = /^\d+$/.test(selector)
      ? Number(selector)
      : this.labels.get(base)?.get(selector);
    return version === undefined ? undefined : versions[version - 1];
  }

  async putNew(
    name: string,
    value: string,
    tags: Readonly<Record<string, string>>,
  ): Promise<"created" | "exists"> {
    this.writes.push(`putNew ${name}`);
    this.step();
    if (this.collisions > 0) {
      this.collisions -= 1;
      throw new DependencyUnavailable("ssm", "too_many_updates");
    }
    if (this.versions.has(name)) {
      return "exists";
    }
    this.versions.set(name, [value]);
    this.tagsOf.set(name, { ...tags });
    return "created";
  }

  async overwrite(name: string, value: string): Promise<void> {
    this.writes.push(`overwrite ${name}`);
    this.step();
    this.set(name, value);
  }

  async listByPath(path: string): Promise<readonly ParameterEntry[]> {
    this.reads.push(`list ${path}`);
    this.step();
    return [...this.versions]
      .filter(([name]) => name.startsWith(path) && !name.slice(path.length).includes("/"))
      .map(([name, versions]) => ({ name, value: versions.at(-1) as string }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
