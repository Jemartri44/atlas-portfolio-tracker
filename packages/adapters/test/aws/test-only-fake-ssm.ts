// TEST ONLY — a double of SSM Parameter Store for the narrow `ParameterStore`,
// never reachable from the product. Every version of a parameter is kept, and a
// name with a selector (`name:version`, `name:label`) resolves as SSM does, so a
// reader that built one fails against the service's behaviour and not against a
// guess. A throttled call fails as a `ThrottlingException` does once translated
// (ADR-0034, row 13).

import { DependencyUnavailable, type ParameterStore } from "@atlas/adapters/aws";

export class TestOnlyFakeSsm implements ParameterStore {
  private readonly versions = new Map<string, string[]>();
  private readonly labels = new Map<string, Map<string, number>>();
  private throttles = 0;
  readonly reads: string[] = [];

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

  async get(name: string): Promise<string | undefined> {
    this.reads.push(name);
    if (this.throttles > 0) {
      this.throttles -= 1;
      throw new DependencyUnavailable("ssm", "throttling");
    }
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
}
