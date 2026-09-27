// The event EventBridge Scheduler hands each function (feature 016;
// `specs/016-scheduled-jobs/contracts/scheduler-event.md`): the `Input` of its
// schedule, `{ "event_format": 1, "tasks": [...] }`, and nothing else. Read
// strictly: anything else is `job_event_invalid` with its reason, and **does
// nothing** — neither the ledger is read nor a record written (mutant 7).
//
// The runtime of Lambda parses the payload before the handler sees it, so a
// repeated key or a lone surrogate of the raw text cannot be seen here; the
// task names are checked against the catalog, which neither could pass.

import { isJobTask, type JobTask } from "./catalog.js";
import { isPlainObject } from "./strict.js";

export type JobEventRefusal =
  | "not_an_object"
  | "unknown_key"
  | "missing_key"
  | "format"
  | "not_a_list"
  | "empty"
  | "unknown_task"
  | "task_not_in_function"
  | "repeated_task";

export type JobEvent =
  | { readonly ok: true; readonly tasks: readonly JobTask[] }
  | { readonly ok: false; readonly code: "job_event_invalid"; readonly reason: JobEventRefusal };

const refuse = (reason: JobEventRefusal): JobEvent => ({
  ok: false,
  code: "job_event_invalid",
  reason,
});

/** The event, against the tasks of this function (`ATLAS_JOBS`). */
export const parseJobEvent = (value: unknown, allowed: readonly JobTask[]): JobEvent => {
  if (!isPlainObject(value)) {
    return refuse("not_an_object");
  }
  if (Object.keys(value).some((key) => key !== "event_format" && key !== "tasks")) {
    return refuse("unknown_key");
  }
  if (!Object.hasOwn(value, "event_format") || !Object.hasOwn(value, "tasks")) {
    return refuse("missing_key");
  }
  if (value.event_format !== 1) {
    return refuse("format");
  }
  const tasks = value.tasks;
  if (!Array.isArray(tasks)) {
    return refuse("not_a_list");
  }
  if (tasks.length === 0) {
    return refuse("empty");
  }
  if (!tasks.every(isJobTask)) {
    return refuse("unknown_task");
  }
  if (!tasks.every((task) => allowed.includes(task))) {
    return refuse("task_not_in_function");
  }
  if (new Set(tasks).size !== tasks.length) {
    return refuse("repeated_task");
  }
  return { ok: true, tasks };
};
