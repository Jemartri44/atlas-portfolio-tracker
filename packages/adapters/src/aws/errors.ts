// A transient failure of AWS (feature 015; ADR-0034, row 13): a
// `ThrottlingException` of SSM, a 5xx of S3. It is **never** a credential that
// passes and never one that is invalid for ever: the API answers
// `503 remote_unavailable`, which may be retried. Implementations of the
// narrow interfaces translate their SDK's errors into this one.

export class DependencyUnavailable extends Error {
  constructor(
    readonly dependency: "s3" | "ssm",
    /** A short code of our own — never the message of the SDK's error. */
    readonly reason: string,
  ) {
    super(`${dependency} unavailable: ${reason}`);
    this.name = "DependencyUnavailable";
  }
}
