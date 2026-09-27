// Where the administration finds its environments (feature 015, E5;
// `data-model.md` §9): `admin.json` under the configuration folder, read
// strictly, and the clients built from it with the standard chain of the SDK —
// built, never called: no test reaches AWS.

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { adminConfigPath, environmentOf, systemAdminAccess } from "../../src/admin/environment.js";

const CONFIG = {
  admin_format: 1,
  environments: {
    prod: { region: "eu-west-1", data_bucket: "atlas-prod-data-x1", ssm_prefix: "/atlas/prod/" },
  },
};

const configFolder = async (text?: string): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "atlas-admin-config-"));
  if (text !== undefined) {
    await mkdir(join(root, "atlas"), { recursive: true });
    await writeFile(join(root, "atlas", "admin.json"), text);
  }
  return root;
};

describe("adminConfigPath", () => {
  it("lives beside the credentials: under XDG_CONFIG_HOME, or ~/.config", () => {
    expect(adminConfigPath({ XDG_CONFIG_HOME: "/x" }, "/home/u")).toBe("/x/atlas/admin.json");
    expect(adminConfigPath({}, "/home/u")).toBe("/home/u/.config/atlas/admin.json");
  });
});

describe("environmentOf", () => {
  it("reads the environment it is asked for", async () => {
    const root = await configFolder(JSON.stringify(CONFIG));
    expect(await environmentOf(join(root, "atlas", "admin.json"), "prod")).toEqual(
      CONFIG.environments.prod,
    );
  });

  it("says a missing file, an unreadable one and an environment it does not name", async () => {
    const none = await configFolder();
    await expect(environmentOf(join(none, "atlas", "admin.json"), "prod")).rejects.toMatchObject({
      code: "admin_config_missing",
    });
    const bad = await configFolder("{");
    await expect(environmentOf(join(bad, "atlas", "admin.json"), "prod")).rejects.toMatchObject({
      code: "admin_config_unreadable",
    });
    const good = await configFolder(JSON.stringify(CONFIG));
    await expect(environmentOf(join(good, "atlas", "admin.json"), "dev")).rejects.toMatchObject({
      code: "admin_environment_unknown",
      details: { environment: "dev" },
    });
  });
});

describe("systemAdminAccess", () => {
  const saved = process.env.XDG_CONFIG_HOME;
  afterEach(() => {
    if (saved === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = saved;
    }
  });

  it("builds the clients of the environment from admin.json, with no credential of its own", async () => {
    process.env.XDG_CONFIG_HOME = await configFolder(JSON.stringify(CONFIG));
    const clients = await systemAdminAccess().clientsFor("prod");
    expect(clients.ssmPrefix).toBe("/atlas/prod/");
    expect(typeof clients.objects.getVersion).toBe("function");
    expect(typeof clients.parameters.listByPath).toBe("function");
  });
});

/**
 * Block 0 of E5, verified with the SDK itself and no AWS: the chain of a
 * client **does not ask for the MFA code** of a profile with `mfa_serial` —
 * it has no callback, and it stops there (`tryNextLink: false`), before any
 * call to STS. So the console takes a session already opened: `aws sso
 * login`, or `aws configure export-credentials` after the AWS CLI asked for
 * the code (runbook «Revocar todos los tokens», «Lo que necesitas»).
 */
describe("the standard chain with a profile that asks for MFA", () => {
  const names = [
    "XDG_CONFIG_HOME",
    "AWS_CONFIG_FILE",
    "AWS_SHARED_CREDENTIALS_FILE",
    "AWS_PROFILE",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_EC2_METADATA_DISABLED",
  ] as const;
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  afterEach(() => {
    for (const name of names) {
      if (saved[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = saved[name];
      }
    }
  });

  it("is refused before reaching AWS, and said as admin_aws_refused", async () => {
    const { run } = await import("../../src/main.js");
    const root = await configFolder(JSON.stringify(CONFIG));
    const aws = join(root, "aws");
    await mkdir(aws);
    await writeFile(
      join(aws, "config"),
      [
        "[profile atlas-prod-admin]",
        "role_arn = arn:aws:iam::000000000000:role/atlas-prod-admin",
        "source_profile = base",
        "mfa_serial = arn:aws:iam::000000000000:mfa/usuario",
        "region = eu-west-1",
        "[profile base]",
        "region = eu-west-1",
        "",
      ].join("\n"),
    );
    await writeFile(
      join(aws, "credentials"),
      "[base]\naws_access_key_id = AKIAEXAMPLE0000000000\naws_secret_access_key = example\n",
    );
    for (const name of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"]) {
      delete process.env[name];
    }
    Object.assign(process.env, {
      XDG_CONFIG_HOME: root,
      AWS_CONFIG_FILE: join(aws, "config"),
      AWS_SHARED_CREDENTIALS_FILE: join(aws, "credentials"),
      AWS_PROFILE: "atlas-prod-admin",
      AWS_EC2_METADATA_DISABLED: "true",
    });
    const lines: string[] = [];
    const code = await run(
      ["--ledger", join(root, "ledger.jsonl"), "admin", "devices", "--env", "prod"],
      { out: (t) => lines.push(t), err: (t) => lines.push(t), confirm: async () => undefined },
    );
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("admin_aws_refused");
    expect(lines.join("\n")).toContain("CredentialsProviderError");
  });
});
