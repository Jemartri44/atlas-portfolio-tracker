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
