// SHA-256 of bytes with Node's native implementation, as lowercase hex. The one
// copy the Node-side stores and jobs share; the web uses Web Crypto instead.

import { createHash } from "node:crypto";

export const sha256Bytes = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");
