import { describe, expect, it } from "vitest";
import { initialiseRemote, syncDevice } from "../../src/sync/client.js";
import { Builder, base, textOf } from "./builder.js";
import { clock, consoleDevice, webDevice } from "./devices.js";
import { SimulatedBucket } from "./simulated-remote.js";

describe("smoke", () => {
  it("two devices sync through the remote", async () => {
    const shared = base();
    const bucket = SimulatedBucket.inMemory();
    const cli = await consoleDevice(shared);
    const web = webDevice(shared);
    const options = clock();
    expect(await initialiseRemote(cli.sync, bucket.as("cli"), options)).toMatchObject({
      status: "synced",
    });
    const joined = await syncDevice(web.sync, bucket.as("web"), options);
    expect(joined).toMatchObject({ status: "synced", uploaded: 0, pending: 0 });
    const a = new Builder(100);
    await cli.record([a.deposit("50")]);
    const w = new Builder(200);
    await web.record([w.deposit("70")]);
    expect(await syncDevice(cli.sync, bucket.as("cli"), options)).toMatchObject({
      status: "synced",
      uploaded: 1,
    });
    expect(await syncDevice(web.sync, bucket.as("web"), options)).toMatchObject({
      status: "synced",
      uploaded: 1,
    });
    expect(await syncDevice(cli.sync, bucket.as("cli"), options)).toMatchObject({
      status: "synced",
      uploaded: 0,
    });
    const remote = await bucket.text();
    expect(await cli.text()).toBe(remote);
    expect(await web.text()).toBe(remote);
    expect(remote).toBe(textOf([...shared, ...a.events, ...w.events]));
  });
});
