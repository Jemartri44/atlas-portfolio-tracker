// The run records and the streaks of the jobs in the bucket (feature 016,
// E1; `specs/016-scheduled-jobs/data-model.md` §1 and §2), over the narrow
// `ObjectStore` of the 015. Every write is conditional — `If-None-Match: *`
// to claim, `If-Match` on the ETag just read to move on — and **only under
// `jobs/<family>/`** of the function that writes: one writer per object
// (§8.1 P11 and P18). Reading is free across `jobs/`: the mail reads what the
// others found. Bytes are read as strict UTF-8; what does not read is said as
// such, never taken for «nothing there».
//
// `putIfMatch` does not return the new ETag, so after each write the object
// is read again to take it, and a read that is not what was written is a
// conflict: another run wrote in between.

import {
  type JobFamily,
  type JobTask,
  type Notice,
  noticeKey,
  parseNotice,
  parseRunRecord,
  type RunRecord,
  runRecordKey,
  serializeNotice,
  serializeRunRecord,
} from "@atlas/domain/jobs";
import type { ObjectStore } from "./object-store.js";

const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

const textOf = (bytes: Uint8Array): string | undefined => {
  try {
    return utf8.decode(bytes);
  } catch {
    return undefined;
  }
};

export type Read<T> =
  | { readonly kind: "absent" }
  | { readonly kind: "read"; readonly value: T; readonly etag: string }
  | { readonly kind: "unreadable"; readonly code: string; readonly etag: string };

/** A write that did not happen because another run wrote first. */
export class JobsWriteConflict extends Error {
  override readonly name = "JobsWriteConflict";
  constructor() {
    super("another run wrote first");
  }
}

export class JobsStore {
  constructor(
    private readonly objects: ObjectStore,
    private readonly family: JobFamily,
  ) {}

  private own(key: string): string {
    if (!key.startsWith(`jobs/${this.family}/`)) {
      throw new RangeError("a write outside the jobs of this family");
    }
    return key;
  }

  private async readParsed<T>(
    key: string,
    parse: (text: string) => { ok: true; value: T } | { ok: false; code: string },
  ): Promise<Read<T>> {
    const stored = await this.objects.get(key);
    if (stored === undefined) {
      return { kind: "absent" };
    }
    const text = textOf(stored.body);
    const parsed = text === undefined ? undefined : parse(text);
    if (parsed === undefined || !parsed.ok) {
      return { kind: "unreadable", code: parsed?.code ?? "not_utf8", etag: stored.etag };
    }
    return { kind: "read", value: parsed.value, etag: stored.etag };
  }

  /** Writes `text` at `key`: created when `etag` is absent, over it otherwise. Answers the new ETag. */
  private async write(key: string, text: string, etag: string | undefined): Promise<string> {
    const body = new TextEncoder().encode(text);
    const done =
      etag === undefined
        ? (await this.objects.putIfNoneMatch(this.own(key), body)) === "created"
        : (await this.objects.putIfMatch(this.own(key), body, etag)) === "written";
    const after = done ? await this.objects.get(key) : undefined;
    if (after === undefined || textOf(after.body) !== text) {
      throw new JobsWriteConflict();
    }
    return after.etag;
  }

  readRecord(task: JobTask, period: string): Promise<Read<RunRecord>> {
    return this.readParsed(runRecordKey(task, period), (text) => {
      const read = parseRunRecord(text, task, period);
      return read.ok ? { ok: true, value: read.record } : read;
    });
  }

  /** Claims (no `etag`) or moves on (the ETag read) the record of its task and period. */
  writeRecord(record: RunRecord, etag: string | undefined): Promise<string> {
    return this.write(runRecordKey(record.task, record.period), serializeRunRecord(record), etag);
  }

  readNotice(code: string, subject: string): Promise<Read<Notice>> {
    const key = noticeKey(code, subject);
    if (key === undefined) {
      return Promise.resolve({ kind: "unreadable", code: "notice_key_invalid", etag: "" });
    }
    return this.readParsed(key, (text) => {
      const read = parseNotice(text, code, subject);
      return read.ok ? { ok: true, value: read.notice } : read;
    });
  }

  writeNotice(notice: Notice, etag: string | undefined): Promise<string> {
    const key = noticeKey(notice.code, notice.subject);
    if (key === undefined) {
      return Promise.reject(new RangeError("a notice that cannot name a key"));
    }
    return this.write(key, serializeNotice(notice), etag);
  }

  /** The streaks written, by their code and subject; a key that is not one of ours is left out. */
  async notices(): Promise<readonly { readonly code: string; readonly subject: string }[]> {
    const listed = await this.objects.list("jobs/mail/notices/");
    return listed.flatMap((entry) => {
      const match =
        /^jobs\/mail\/notices\/([a-z][a-z0-9_]{0,63})--([A-Za-z0-9_-]{1,64})\.json$/.exec(
          entry.key,
        );
      return match === null ? [] : [{ code: match[1] as string, subject: match[2] as string }];
    });
  }
}
