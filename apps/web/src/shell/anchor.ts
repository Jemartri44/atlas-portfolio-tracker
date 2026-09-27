// Going to the fragment of the address once its target is there (feature
// 020, E1, block 6; round 1 of the review of PR #105, B1 and N2).
//
// The browser looks for `#sincronizacion` when the page loads, and the card
// that carries it is painted later, when its screen arrives: at 400px the
// page did not move at all (measured, `specs/020-visual-refresh/questions.md`
// §7). So after entering by an address with a fragment, or following a link
// of the application to one, this waits for the target, a frame at a time and
// up to a bound, and brings it to the top. Under the fixed bar, not behind it:
// `scrollIntoView` honours the `scroll-padding-top` of the document, which
// follows the height of the bar (`--header-h`). Then the focus goes to the
// title that was reached, so the next Tab starts there and not at the top.
//
// Never when coming back through the history: the browser restores where the
// user was, and the back button wins. And the wait stops as soon as the
// address changes again.
//
// Nothing is animated: `behavior: "auto"`, whatever the user's motion setting.

/** About two seconds at sixty frames: a lazy screen is there long before. */
export const FRAMES = 120;

/**
 * The target of a fragment: decoded when it can be, as written when it
 * cannot (`#50%` is not valid percent-encoding, and it once left the screen
 * blank), nothing for a bare `#`.
 */
export const decodeFragment = (hash: string): string | undefined => {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (raw === "") {
    return undefined;
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

export interface FollowOptions {
  find?: (id: string) => Element | null;
  frame?: () => Promise<void>;
  frames?: number;
  /** Aborted when the address changes again: the wait is over. */
  signal?: AbortSignal;
}

/** Where the focus goes on arrival: the title of the target, or the target itself. */
const focusOn = (target: Element): void => {
  const title = target.querySelector("h1, h2, h3") ?? target;
  if (title instanceof HTMLElement) {
    if (!title.hasAttribute("tabindex")) {
      title.setAttribute("tabindex", "-1");
    }
    title.focus({ preventScroll: true });
  }
};

export const scrollToFragment = async (
  id: string,
  options: FollowOptions = {},
): Promise<boolean> => {
  const find = options.find ?? ((target: string) => document.getElementById(target));
  const frame =
    options.frame ?? (() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const frames = options.frames ?? FRAMES;
  for (let attempt = 0; attempt <= frames; attempt += 1) {
    if (options.signal?.aborted === true) {
      return false;
    }
    const target = find(id);
    if (target !== null) {
      target.scrollIntoView({ behavior: "auto", block: "start" });
      focusOn(target);
      return true;
    }
    await frame();
  }
  return false;
};
