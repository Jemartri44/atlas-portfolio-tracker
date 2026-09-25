// The door `@atlas/adapters/aws` (feature 015): the narrow interfaces of S3
// and SSM and what the API builds on them. Node only, never in the barrel,
// never reached by the web (architecture test).

export { DeviceStore } from "./device-store.js";
export { DependencyUnavailable } from "./errors.js";
export type { ObjectStore, StoredObject } from "./object-store.js";
export type { ParameterStore } from "./parameter-store.js";
export { AccessSecrets, parameterNames, type SecretsOptions } from "./secrets.js";
