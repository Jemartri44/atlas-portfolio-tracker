// Saving what the owner types, a moment after they stop. One write at a time, because each needs the
// etag the one before left: what arrives meanwhile waits, and only the last of it goes. A write that
// fails drops what was waiting, which was typed over what the owner must now look at again.

export interface Autosave<T> {
  /** Saves `value` after the pause, replacing whatever was waiting. */
  soon(value: T): void;
  /** Saves `value` without the pause. */
  now(value: T): void;
  /** Sends what was waiting without the pause: leaving the screen must not lose it. */
  flush(): void;
}

export const createAutosave = <T>(
  /** The sentence of what went wrong, or `undefined` when it is saved. */
  save: (value: T) => Promise<string | undefined>,
  delayMs: number,
  onDone: (said: string | undefined) => void,
): Autosave<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let waiting: { value: T } | undefined;
  let writing = false;

  const flush = (): void => {
    clearTimeout(timer);
    if (writing || waiting === undefined) {
      return;
    }
    const { value } = waiting;
    waiting = undefined;
    writing = true;
    void save(value).then((said) => {
      writing = false;
      if (said !== undefined) {
        clearTimeout(timer);
        waiting = undefined;
      }
      onDone(said);
      flush();
    });
  };

  return {
    soon: (value) => {
      waiting = { value };
      clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    now: (value) => {
      waiting = { value };
      flush();
    },
    flush,
  };
};
