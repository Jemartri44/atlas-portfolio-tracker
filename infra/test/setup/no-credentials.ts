import { assertNoAwsCredentials } from "../lib/env.js";

// Runs before every test file of the `infra` project: the suite refuses to
// start when the process has any way into an AWS account.
assertNoAwsCredentials(process.env);
