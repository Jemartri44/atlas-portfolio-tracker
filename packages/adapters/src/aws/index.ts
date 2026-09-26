// The door `@atlas/adapters/aws` (feature 015): the narrow interfaces of S3
// and SSM and what the API builds on them. Node only, never in the barrel,
// never reached by the web (architecture test).

export { DeviceStore } from "./device-store.js";
export { DependencyUnavailable } from "./errors.js";
export type { ListedObject, ObjectStore, StoredObject } from "./object-store.js";
export type { ParameterEntry, ParameterStore } from "./parameter-store.js";
export {
  REFERENCE_PREFIXES,
  type ReferencePrefix,
  type ReferenceReader,
  referenceReader,
} from "./reference-reader.js";
export {
  type AppendOnlyLedger,
  appendOnlyLedger,
  archiveKey,
  LEDGER_KEY,
  S3LedgerBlob,
} from "./s3-ledger.js";
export { AccessSecrets, parameterNames, type SecretsOptions } from "./secrets.js";
export { TokenRegistry } from "./token-registry.js";
