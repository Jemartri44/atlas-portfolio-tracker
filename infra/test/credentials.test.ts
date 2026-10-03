import { describe, expect, it } from "vitest";
import {
  assertNoAwsCredentials,
  awsVariablesSet,
  cleanEnv,
  FORBIDDEN_AWS_VARIABLES,
} from "./lib/env.js";

describe("the guard of the credentials", () => {
  it("passes on an environment with none of the variables", () => {
    expect(() => assertNoAwsCredentials({ PATH: "/usr/bin" })).not.toThrow();
  });

  it("counts an empty value as unset", () => {
    expect(awsVariablesSet({ AWS_PROFILE: "" })).toEqual([]);
  });

  it.each(FORBIDDEN_AWS_VARIABLES)(
    "fails when %s is set, naming it and never its value",
    (name) => {
      const env = { [name]: "super-secret-value" };
      expect(() => assertNoAwsCredentials(env)).toThrow(name);
      expect(() => assertNoAwsCredentials(env)).not.toThrow(/super-secret-value/);
    },
  );

  it("builds the environment of a child from nothing, with neutral AWS variables", () => {
    const env = cleanEnv();
    expect(env.AWS_EC2_METADATA_DISABLED).toBe("true");
    expect(env.AWS_PROFILE).toBe("");
    expect(env.AWS_ACCESS_KEY_ID).toBe("");
    expect(env.AWS_SECRET_ACCESS_KEY).toBe("");
    expect(env.AWS_SESSION_TOKEN).toBe("");
    expect(env.HTTPS_PROXY).toBe("http://127.0.0.1:9");
    expect(Object.keys(env).sort()).toEqual(
      expect.arrayContaining(["AWS_CONFIG_FILE", "AWS_SHARED_CREDENTIALS_FILE", "PATH"]),
    );
  });

  it("opens the network only when asked, for `init`", () => {
    expect(cleanEnv({ network: true }).HTTPS_PROXY).toBe("");
  });
});
