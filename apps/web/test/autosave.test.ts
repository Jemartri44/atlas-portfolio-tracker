import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosave } from "../src/settings-objects/autosave.js";

const rig = () => {
  const sent: string[] = [];
  const answers: ((said?: string) => void)[] = [];
  const done: (string | undefined)[] = [];
  const saver = createAutosave<string>(
    (value) => {
      sent.push(value);
      return new Promise((resolve) => answers.push(resolve));
    },
    800,
    (said) => done.push(said),
  );
  return { saver, sent, answers, done };
};
const answered = async (answer: ((said?: string) => void) | undefined, said?: string) => {
  answer?.(said);
  await vi.advanceTimersByTimeAsync(0);
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createAutosave", () => {
  it("sends only the last value, once the owner stops", () => {
    const { saver, sent } = rig();
    saver.soon("a");
    vi.advanceTimersByTime(700);
    saver.soon("b");
    vi.advanceTimersByTime(700);
    expect(sent).toEqual([]);
    vi.advanceTimersByTime(100);
    expect(sent).toEqual(["b"]);
  });

  it("never has two writes at once: the last value goes after the one in flight", async () => {
    const { saver, sent, answers } = rig();
    saver.now("a");
    saver.soon("b");
    saver.soon("c");
    vi.advanceTimersByTime(800);
    expect(sent).toEqual(["a"]);
    await answered(answers[0]);
    expect(sent).toEqual(["a", "c"]);
  });

  it("drops what was waiting when a write fails, and says it", async () => {
    const { saver, sent, answers, done } = rig();
    saver.now("a");
    saver.soon("b");
    await answered(answers[0], "conflict");
    vi.advanceTimersByTime(800);
    expect(sent).toEqual(["a"]);
    expect(done).toEqual(["conflict"]);
  });

  it("drops a pause still running when a write fails", async () => {
    const { saver, sent, answers } = rig();
    saver.now("a");
    await vi.advanceTimersByTimeAsync(0);
    saver.soon("b");
    await answered(answers[0], "conflict");
    await vi.advanceTimersByTimeAsync(800);
    expect(sent).toEqual(["a"]);
  });

  it("sends what was waiting on leaving, and has nothing to send twice", () => {
    const { saver, sent } = rig();
    saver.soon("a");
    saver.flush();
    saver.flush();
    vi.advanceTimersByTime(800);
    expect(sent).toEqual(["a"]);
  });
});
