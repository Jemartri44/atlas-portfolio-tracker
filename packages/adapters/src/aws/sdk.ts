// The door `@atlas/adapters/aws-sdk` (feature 015, E3): the two thin adapters
// of the AWS SDK. Apart from `@atlas/adapters/aws` so that nothing that only
// needs the narrow interfaces — the handler, its tests — loads the SDK. Node
// only; never reached by the web (architecture test).

export { productionObjectStore, type S3Sender, SdkObjectStore } from "./sdk-s3.js";
export { productionParameterStore, SdkParameterStore, type SsmSender } from "./sdk-ssm.js";
