// The simulated remotes honour `docs/api.md` §5 (block 5): conditional writes,
// `412` writing nothing, the valid stretch only, the device of the credential.
// Both media, the memory and the directory, pass the same checks.

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EMPTY_ETAG, RemoteError, textOfLines } from "@atlas/domain/sync";
import { describe, expect, it } from "vitest";
import { Builder, base, linesOf, textOf } from "./builder.js";
import { SimulatedBucket } from "./simulated-remote.js";

const media: [string, () => Promise<SimulatedBucket>][] = [
  ["memory", async () => SimulatedBucket.inMemory()],
  [
    "directory",
    async () => SimulatedBucket.inDirectory(await mkdtemp(join(tmpdir(), "atlas-bucket-014-"))),
  ],
];

describe.each(media)("the simulated remote in %s", (_medium, make) => {
  it("reads nothing as the etag of zero bytes, and initialises only on it", async () => {
    const bucket = await make();
    const remote = bucket.as("one");
    expect(await remote.read()).toEqual({ text: "", etag: EMPTY_ETAG });
    const shared = base();
    await expect(remote.init(textOf(shared), [], "other")).rejects.toMatchObject({
      code: "precondition_failed",
      status: 412,
    });
    expect(await remote.init(textOf(shared), [], EMPTY_ETAG)).toMatchObject({
      lines: shared.length,
    });
    await expect(remote.init(textOf(shared), [], EMPTY_ETAG)).rejects.toMatchObject({
      code: "precondition_failed",
    });
    expect(await bucket.text()).toBe(textOf(shared));
  });

  it("appends only on the current etag, writing nothing on a stale one (13a, 13b)", async () => {
    const bucket = await make();
    const remote = bucket.as("one");
    await remote.init(textOf(base()), [], EMPTY_ETAG);
    const { etag } = await remote.read();
    const one = new Builder(100).deposit("1");
    const answer = await remote.append([{ line: linesOf([one])[0] as string }], etag);
    expect(answer).toMatchObject({ accepted: 1, lines: base().length + 1 });
    expect(answer.etag).toBe((await remote.read()).etag);
    const before = await bucket.text();
    const two = new Builder(200).deposit("2");
    await expect(
      remote.append([{ line: linesOf([two])[0] as string }], etag),
    ).rejects.toMatchObject({
      code: "precondition_failed",
      status: 412,
    });
    expect(await bucket.text()).toBe(before);
    await expect(remote.append([], "")).rejects.toMatchObject({
      code: "precondition_required",
      status: 428,
    });
  });

  it("writes the valid stretch and says the first rejected line (13c)", async () => {
    const bucket = await make();
    const remote = bucket.as("one");
    await remote.init(textOf(base()), [], EMPTY_ETAG);
    const b = new Builder(100);
    const good = b.deposit("1");
    const bad = b.trade("sell", "99", "2027-06-10");
    const after = b.deposit("3");
    const answer = await remote.append(
      linesOf([good, bad, after]).map((line) => ({ line })),
      (await remote.read()).etag,
    );
    expect(answer).toMatchObject({ accepted: 1, rejected: { index: 1, code: "domain_rejected" } });
    expect(await bucket.text()).toBe(textOf([...base(), good]));
    const nothing = await remote.append(
      [{ line: linesOf([bad])[0] as string }],
      (await remote.read()).etag,
    );
    expect(nothing).toMatchObject({ accepted: 0, etag: (await remote.read()).etag });
  });

  it("publishes under the device of the credential; a device in the body is body_invalid (13f)", async () => {
    const bucket = await make();
    await bucket.as("laptop").publish({ pending: 2, held: 1, last_sync_at: "t" });
    expect(await bucket.devices()).toEqual([
      expect.objectContaining({ device_id: "laptop", pending: 2, held: 1, device_format: 1 }),
    ]);
    await expect(
      bucket
        .as("laptop")
        .publishBody({ pending: 0, held: 0, last_sync_at: "t", device_id: "phone" }),
    ).rejects.toBeInstanceOf(RemoteError);
    expect((await bucket.devices()).map((entry) => entry.device_id)).toEqual(["laptop"]);
  });

  it("can be rewritten by the administration and fail on purpose", async () => {
    const bucket = await make();
    await bucket.rewrite(textOfLines(["x"]));
    expect(await bucket.text()).toBe("x\n");
    bucket.failNext = { what: "read", error: new RemoteError("internal", 500) };
    await expect(bucket.as("one").read()).rejects.toMatchObject({ code: "internal" });
    expect((await bucket.as("one").read()).text).toBe("x\n");
  });
});
