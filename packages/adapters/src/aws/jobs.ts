// The door `@atlas/adapters/aws-jobs` (feature 016): what the scheduled jobs
// build on the narrow interfaces of S3 and SSM — their records and streaks,
// and the `Notifier` of SES over its narrow `MailSender`. Apart from
// `@atlas/adapters/aws` so the API, which imports that door, never reaches
// what sends mail (`tests/jobs-access.test.ts`). Node only.

export { JobsStore, JobsWriteConflict, type Read } from "./jobs-store.js";
export {
  MailRefused,
  type MailSender,
  MailUnknown,
  type OutgoingMail,
  recipientParameter,
  type SesNotifierDeps,
  sesNotifier,
} from "./mail.js";
