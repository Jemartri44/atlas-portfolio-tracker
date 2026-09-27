// The yes to «Ya existe un movimiento igual» is a yes to **that** movement
// (review of PR #97, security N5): the dialog does not freeze the form, so a
// field changed with the warning open would otherwise be recorded as a
// confirmed duplicate that nobody saw. A yes confirms only the very draft the
// warning was about; any other is written without the confirmation, and
// warns again if it repeats too.

export interface Warned {
  /** Whether this yes confirms this draft: only the one the warning was about. */
  readonly confirms: (draft: unknown, yes: boolean) => boolean;
  /** The draft a warning is about, by its exact content. */
  readonly remember: (draft: unknown) => void;
}

export const createWarned = (): Warned => {
  let warned: string | undefined;
  return {
    confirms: (draft, yes) => yes && warned === JSON.stringify(draft),
    remember: (draft) => {
      warned = JSON.stringify(draft);
    },
  };
};
