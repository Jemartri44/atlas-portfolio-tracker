// Going to the fragment of the address once its target is there (feature
// 020, E1, block 6).
//
// The browser looks for `#sincronizacion` when the page loads, and the card
// that carries it is painted later, when its screen arrives: at 400px the
// page did not move at all (measured, `specs/020-visual-refresh/questions.md`
// §7). So after every navigation with a fragment this waits for the target,
// a frame at a time and up to a bound, and brings it to the top. Under the
// fixed bar, not behind it: `scrollIntoView` honours the `scroll-padding-top`
// of the document, which follows the height of the bar (`--header-h`).
//
// Nothing is animated: `behavior: "auto"`, whatever the user's motion setting.

/** About two seconds at sixty frames: a lazy screen is there long before. */
export const FRAMES = 120;

export const scrollToFragment = async (
  id: string,
  find: (id: string) => Element | null = (target) => document.getElementById(target),
  frame: () => Promise<void> = () =>
    new Promise((resolve) => requestAnimationFrame(() => resolve())),
  frames = FRAMES,
): Promise<boolean> => {
  for (let attempt = 0; attempt <= frames; attempt += 1) {
    const target = find(id);
    if (target !== null) {
      target.scrollIntoView({ behavior: "auto", block: "start" });
      return true;
    }
    await frame();
  }
  return false;
};
