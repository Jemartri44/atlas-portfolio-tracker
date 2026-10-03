// TEST ONLY — a double of the secrets door of SSM (`SecretStore`), never
// reachable from the product. It keeps what was written (so a test can see
// that a value went in and nowhere else) and the tags each write carried.

import { type SecretKind, type SecretStore, SecretTagsFailed } from "@atlas/adapters/aws";

export interface FakeSecretCall {
  readonly operation: "exists" | "create" | "rotate";
  readonly name: string;
}

export class TestOnlyFakeSecrets implements SecretStore {
  readonly calls: FakeSecretCall[] = [];
  private readonly values = new Map<string, { value: string; kind: SecretKind }>();
  private readonly tagsOf = new Map<string, Readonly<Record<string, string>>>();
  /** What the next write throws, if anything: to see the failure path say nothing. */
  failWith: Error | undefined;
  /** `rotate` writes the value and then fails to tag it. */
  tagsFail = false;

  preset(name: string, value: string, kind: SecretKind = "SecureString"): void {
    this.values.set(name, { value, kind });
  }

  valueOf(name: string): string | undefined {
    return this.values.get(name)?.value;
  }

  kindOf(name: string): SecretKind | undefined {
    return this.values.get(name)?.kind;
  }

  tags(name: string): Readonly<Record<string, string>> | undefined {
    return this.tagsOf.get(name);
  }

  names(): string[] {
    return [...this.values.keys()].sort();
  }

  async exists(name: string): Promise<boolean> {
    this.calls.push({ operation: "exists", name });
    return this.values.has(name);
  }

  async create(
    name: string,
    value: string,
    kind: SecretKind,
    tags: Readonly<Record<string, string>>,
  ): Promise<"created" | "exists"> {
    this.calls.push({ operation: "create", name });
    this.throwIfAsked();
    if (this.values.has(name)) {
      return "exists";
    }
    this.values.set(name, { value, kind });
    this.tagsOf.set(name, tags);
    return "created";
  }

  async rotate(
    name: string,
    value: string,
    kind: SecretKind,
    tags: Readonly<Record<string, string>>,
  ): Promise<void> {
    this.calls.push({ operation: "rotate", name });
    this.throwIfAsked();
    this.values.set(name, { value, kind });
    if (this.tagsFail) {
      throw new SecretTagsFailed(name);
    }
    this.tagsOf.set(name, { ...(this.tagsOf.get(name) ?? {}), ...tags });
  }

  private throwIfAsked(): void {
    if (this.failWith !== undefined) {
      throw this.failWith;
    }
  }
}
