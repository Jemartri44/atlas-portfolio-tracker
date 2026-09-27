// Feature 016, E1 (R10): the records and the streaks of the jobs in the
// bucket, written conditionally, only under the family's own prefix, and read
// strictly.

import { claimRecord, noticeIn, recordIn, serializeRunRecord } from "@atlas/domain/jobs";
import { describe, expect, it } from "vitest";
import { JobsStore, JobsWriteConflict } from "../../src/aws/jobs-store.js";
import { readWebSignIn, recordWebSignIn } from "../../src/aws/web-sign-in.js";
import { TestOnlyFakeS3 } from "./test-only-fake-s3.js";

const AT = "2026-10-01T06:00:00Z";

describe("the records of the jobs", () => {
  it("claims a period once: the second claim is a conflict, never a second owner", async () => {
    const s3 = new TestOnlyFakeS3();
    const store = new JobsStore(s3, "mail");
    const record = claimRecord("monthly_reminder", "2026-10", AT);
    expect(await store.readRecord("monthly_reminder", "2026-10")).toEqual({ kind: "absent" });
    const etag = await store.writeRecord(record, undefined);
    expect(s3.text("jobs/mail/monthly_reminder/2026-10.json")).toBe(serializeRunRecord(record));
    await expect(store.writeRecord(record, undefined)).rejects.toBeInstanceOf(JobsWriteConflict);
    expect(await store.readRecord("monthly_reminder", "2026-10")).toEqual({
      kind: "read",
      value: record,
      etag,
    });
  });

  it("moves on only from the ETag it read: a stale one is a conflict and writes nothing", async () => {
    const s3 = new TestOnlyFakeS3();
    const store = new JobsStore(s3, "mail");
    const record = claimRecord("monthly_reminder", "2026-10", AT);
    const first = await store.writeRecord(record, undefined);
    const second = await store.writeRecord(recordIn(record, "sending", AT), first);
    expect(second).not.toBe(first);
    await expect(store.writeRecord(recordIn(record, "done", AT), first)).rejects.toBeInstanceOf(
      JobsWriteConflict,
    );
    expect(s3.text("jobs/mail/monthly_reminder/2026-10.json")).toContain('"state":"sending"');
  });

  it("takes a write that another run changed right after as a conflict", async () => {
    const s3 = new TestOnlyFakeS3();
    const store = new JobsStore(s3, "mail");
    const record = claimRecord("monthly_reminder", "2026-10", AT);
    const original = s3.get.bind(s3);
    let reads = 0;
    s3.get = async (key) => {
      reads += 1;
      if (reads === 1) {
        s3.seed(key, "{}\n");
      }
      return original(key);
    };
    await expect(store.writeRecord(record, undefined)).rejects.toBeInstanceOf(JobsWriteConflict);
  });

  it("never writes outside jobs/<its family>/", async () => {
    const store = new JobsStore(new TestOnlyFakeS3(), "prices");
    await expect(
      store.writeRecord(claimRecord("monthly_reminder", "2026-10", AT), undefined),
    ).rejects.toBeInstanceOf(RangeError);
  });

  it("says a record that does not read as unreadable, with its code: never as absent", async () => {
    const s3 = new TestOnlyFakeS3();
    const store = new JobsStore(s3, "mail");
    s3.seed("jobs/mail/monthly_reminder/2026-10.json", "{}\n");
    expect(await store.readRecord("monthly_reminder", "2026-10")).toEqual({
      kind: "unreadable",
      code: "job_record_unreadable",
      etag: s3.etagOf("jobs/mail/monthly_reminder/2026-10.json"),
    });
    s3.seedBytes("jobs/mail/monthly_reminder/2026-11.json", new Uint8Array([0xff, 0xfe]));
    expect(await store.readRecord("monthly_reminder", "2026-11")).toEqual({
      kind: "unreadable",
      code: "not_utf8",
      etag: s3.etagOf("jobs/mail/monthly_reminder/2026-11.json"),
    });
  });
});

describe("the streaks of the warnings", () => {
  it("writes, reads and lists them, and refuses a key it could not build", async () => {
    const s3 = new TestOnlyFakeS3();
    const store = new JobsStore(s3, "mail");
    const notice = noticeIn(
      { code: "task_failed", subject: "ecb_update" },
      "open",
      AT,
      "2026-10-01",
    );
    const etag = await store.writeNotice(notice, undefined);
    expect(await store.readNotice("task_failed", "ecb_update")).toEqual({
      kind: "read",
      value: notice,
      etag,
    });
    expect(await store.readNotice("task_failed", "prices_update")).toEqual({ kind: "absent" });
    s3.seed("jobs/mail/notices/task_failed--prices_update.json", "x");
    expect(await store.readNotice("task_failed", "prices_update")).toEqual({
      kind: "unreadable",
      code: "notice_unreadable",
      etag: s3.etagOf("jobs/mail/notices/task_failed--prices_update.json"),
    });
    s3.seed("jobs/mail/notices/not a notice.json", "x");
    expect(await store.notices()).toEqual([
      { code: "task_failed", subject: "ecb_update" },
      { code: "task_failed", subject: "prices_update" },
    ]);
    expect(await store.readNotice("task_failed", "../../ledger")).toEqual({
      kind: "unreadable",
      code: "notice_key_invalid",
      etag: "",
    });
    await expect(
      store.writeNotice({ ...notice, subject: "../../ledger" }, undefined),
    ).rejects.toBeInstanceOf(RangeError);
  });
});

describe("the last web sign-in in the bucket (R16)", () => {
  it("is created, moved forward, never back, and replaced when it does not read", async () => {
    const s3 = new TestOnlyFakeS3();
    expect(await readWebSignIn(s3)).toEqual({ date: undefined });
    expect(await recordWebSignIn(s3, "2026-10-03")).toBe("written");
    expect(s3.text("access/last-web-sign-in.json")).toBe(
      '{"web_sign_in_format":1,"last_web_sign_in":"2026-10-03"}\n',
    );
    expect(await recordWebSignIn(s3, "2026-10-03")).toBe("unchanged");
    expect(await recordWebSignIn(s3, "2026-10-01")).toBe("unchanged");
    expect(await recordWebSignIn(s3, "2026-10-05")).toBe("written");
    expect((await readWebSignIn(s3)).date).toBe("2026-10-05");
    s3.seedBytes("access/last-web-sign-in.json", new Uint8Array([0xff]));
    expect((await readWebSignIn(s3)).date).toBe("unreadable");
    expect(await recordWebSignIn(s3, "2026-10-06")).toBe("written");
    expect((await readWebSignIn(s3)).date).toBe("2026-10-06");
  });

  it("writes nothing when another sign-in wrote in between", async () => {
    const s3 = new TestOnlyFakeS3();
    await recordWebSignIn(s3, "2026-10-03");
    s3.beforePut = (key) => {
      s3.beforePut = undefined;
      s3.seed(key, '{"web_sign_in_format":1,"last_web_sign_in":"2026-10-04"}\n');
    };
    expect(await recordWebSignIn(s3, "2026-10-05")).toBe("conflict");
    expect((await readWebSignIn(s3)).date).toBe("2026-10-04");
    const empty = new TestOnlyFakeS3();
    empty.beforePut = (key) => {
      empty.beforePut = undefined;
      empty.seed(key, '{"web_sign_in_format":1,"last_web_sign_in":"2026-10-04"}\n');
    };
    expect(await recordWebSignIn(empty, "2026-10-05")).toBe("conflict");
  });
});
