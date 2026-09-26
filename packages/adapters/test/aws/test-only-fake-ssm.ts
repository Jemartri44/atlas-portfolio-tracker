// TEST ONLY — a double of SSM Parameter Store for the narrow `ParameterStore`,
// never reachable from the product. It reads by exact name; a throttled call
// fails as a `ThrottlingException` does once translated (ADR-0034, row 13).
// The selectors `name:version` and `name:label` (ADR-0033, F17) are imitated in
// E2, after its block 0.

import { DependencyUnavailable, type ParameterStore } from "@atlas/adapters/aws";

export class TestOnlyFakeSsm implements ParameterStore {
  private readonly values = new Map<string, string>();
  private throttles = 0;
  readonly reads: string[] = [];

  set(name: string, value: string): void {
    this.values.set(name, value);
  }

  delete(name: string): void {
    this.values.delete(name);
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
    return this.values.get(name);
  }
}
