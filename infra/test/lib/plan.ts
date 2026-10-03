/** The part of `terraform show -json` the suite reads. */

export interface ResourceChange {
  address: string;
  mode: "managed" | "data";
  type: string;
  name: string;
  index?: number | string;
  provider_name: string;
  change: {
    actions: string[];
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    after_unknown: Record<string, unknown>;
    after_sensitive: Record<string, unknown>;
  };
}

export interface ConfigResource {
  address: string;
  mode: "managed" | "data";
  type: string;
  name: string;
  provider_config_key: string;
  expressions?: Record<string, unknown>;
}

export interface ConfigOutput {
  sensitive?: boolean;
  expression?: unknown;
}

export interface Plan {
  variables: Record<string, { value: unknown }>;
  resource_changes?: ResourceChange[];
  output_changes?: Record<string, { after: unknown; after_sensitive: unknown }>;
  configuration: {
    provider_config: Record<string, { expressions?: Record<string, unknown> }>;
    root_module: {
      resources?: ConfigResource[];
      outputs?: Record<string, ConfigOutput>;
      variables?: Record<string, { sensitive?: boolean }>;
    };
  };
}

export const changes = (plan: Plan): ResourceChange[] => plan.resource_changes ?? [];

export const ofType = (plan: Plan, type: string): ResourceChange[] =>
  changes(plan).filter((change) => change.type === type);

/** One resource, which must exist exactly once. */
export const only = (plan: Plan, type: string, name?: string): ResourceChange => {
  const found = ofType(plan, type).filter((change) => name === undefined || change.name === name);
  if (found.length !== 1) {
    throw new Error(
      `expected exactly one ${type}${name === undefined ? "" : `.${name}`}, found ${found.length}`,
    );
  }
  return found[0] as ResourceChange;
};

export const attr = (change: ResourceChange, key: string): unknown => change.change.after?.[key];

export const isTrue = (value: unknown): boolean => value === true;
