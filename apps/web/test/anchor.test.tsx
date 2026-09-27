// @vitest-environment happy-dom
//
// An anchor of the application stops under the fixed bar, not behind it
// (feature 020, E1, block 6; the defect of `#sincronizacion` that feature 015
// left, §30.5). Two parts, and each has its test:
//
//   1. the document's `scroll-padding-top` is tied to the height of the bar,
//      a variable, never a number, so if the bar changes the margin follows;
//   2. after a navigation with a fragment, the frame waits for the target to
//      exist and brings it up: the card of a lazy screen is painted after the
//      browser looked for the fragment, and at 400px the page did not move.
//
// The real browser measures the rest at 400 and 2045 (`medidas.json`).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { A, useNavigate } from "@solidjs/router";
import { afterEach, describe, expect, it, vi } from "vitest";
import Ajustes from "../src/routes/ajustes/index.jsx";
import Movimientos from "../src/routes/movimientos/index.jsx";
import { decodeFragment, historyGate, scrollToFragment } from "../src/shell/anchor.js";
import { cssRules } from "./helpers/css-rules.js";
import { settle, showInShell, until, withGoldenLedger } from "./helpers/render.jsx";
import { token, withoutStyles, withStyles } from "./helpers/styles.js";

withGoldenLedger();
afterEach(() => {
  withoutStyles();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const styles = join(dirname(fileURLToPath(import.meta.url)), "../src/styles");

describe("the margin of an anchor", () => {
  it("is the height of the bar in force, as a variable", () => {
    const html = cssRules(readFileSync(join(styles, "base.css"), "utf8")).find(
      (rule) => rule.path.join(" ") === ":where(html)",
    );
    const padding = html?.declarations.find(([property]) => property === "scroll-padding-top");
    expect(padding?.[1]).toBe("calc(var(--header-h) + var(--space-3))");
  });

  it("follows the status bar on a phone and the top bar from 1200px", () => {
    withStyles(400);
    expect(token("--header-h")).toBe(token("--statusbar-h"));
    withoutStyles();
    withStyles(1440);
    expect(token("--header-h")).toBe(token("--topbar-h"));
    expect(token("--topbar-h")).not.toBe(token("--statusbar-h"));
  });
});

describe("reading the fragment", () => {
  // Round 1 of the review of PR #105, B1: `#50%` threw `URIError` in the
  // effect of the frame and left the screen blank.
  it("decodes it, falls back to it as written, and reads nothing in a bare #", () => {
    expect(decodeFragment("#sincronizaci%C3%B3n")).toBe("sincronización");
    expect(decodeFragment("#50%")).toBe("50%");
    expect(decodeFragment("#%E0%A4%A")).toBe("%E0%A4%A");
    expect(decodeFragment("#")).toBeUndefined();
    expect(decodeFragment("")).toBeUndefined();
  });

  it.each(["/ajustes#50%", "/ajustes#%E0%A4%A", "/ajustes#"])(
    "opens %s with the frame and its screen, not a blank page",
    async (url) => {
      const host = await showInShell(url, { "/ajustes": Ajustes });
      await until(() => host.querySelector("#sincronizacion") !== null, "la pantalla de Ajustes");
      expect(host.querySelector("header.topbar")).not.toBeNull();
    },
  );
});

describe("the way back through the history", () => {
  it("keeps the gate shut until the address it popped to is reached, in as many steps as it takes", () => {
    // Measured in Chromium: the router moved the path and then the fragment,
    // and a flag spent on the first step let the second one follow.
    const gate = historyGate();
    expect(gate.follows("/ajustes#sincronizacion")).toBe(true);
    gate.popped("/ajustes#sincronizacion");
    expect(gate.follows("/ajustes")).toBe(false);
    expect(gate.follows("/ajustes#sincronizacion")).toBe(false);
    // Arrived: the next change is not from the history.
    expect(gate.follows("/movimientos")).toBe(true);
  });

  it("opens again with a click, whatever the history left behind", () => {
    const gate = historyGate();
    gate.popped("/a#x");
    gate.clicked();
    expect(gate.follows("/b#y")).toBe(true);
  });
});

describe("the title reached by an anchor", () => {
  it("takes the focus without the ring, and anything interactive keeps it", () => {
    // Round 2 of the review of PR #105, O2: a focus from a script met
    // `:focus-visible` in Chromium and painted the accent ring on the title.
    const rule = cssRules(readFileSync(join(styles, "base.css"), "utf8")).find(
      (candidate) => candidate.path.join(" ") === ':where(h1, h2, h3)[tabindex="-1"]:focus',
    );
    expect(rule?.declarations).toEqual([["outline", "none"]]);
    // The ring of everything interactive is untouched.
    const ring = cssRules(readFileSync(join(styles, "base.css"), "utf8")).find((candidate) =>
      candidate.path.join(" ").endsWith(":focus-visible"),
    );
    expect(ring?.path.join(" ")).toBe(
      ":where(a, button, input, select, textarea, summary, [tabindex]):focus-visible",
    );
    expect(ring?.declarations[0]).toEqual([
      "outline",
      "var(--border-strong) solid var(--c-accent)",
    ]);
  });
});

describe("going to the fragment", () => {
  it("waits for a target painted late, brings it to the top once and gives it the focus", async () => {
    const target = document.createElement("div");
    const title = document.createElement("h2");
    target.append(title);
    document.body.append(target);
    const scroll = vi.spyOn(target, "scrollIntoView").mockImplementation(() => {});
    let frames = 0;
    const found = await scrollToFragment("sincronizacion", {
      find: () => (frames >= 3 ? target : null),
      frame: async () => {
        frames += 1;
      },
    });
    expect(found).toBe(true);
    expect(frames).toBe(3);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
    // The next Tab starts at the title that was reached, not at the top.
    expect(title.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(title);
    target.remove();
  });

  it("gives up after its bound on a fragment with no target", async () => {
    let frames = 0;
    const found = await scrollToFragment("nada", {
      find: () => null,
      frame: async () => {
        frames += 1;
      },
      frames: 5,
    });
    expect(found).toBe(false);
    expect(frames).toBe(6);
  });

  it("stops waiting as soon as it is cancelled, and moves nothing", async () => {
    const control = new AbortController();
    const target = { scrollIntoView: vi.fn() } as unknown as Element;
    let frames = 0;
    const found = await scrollToFragment("sincronizacion", {
      find: () => (frames >= 3 ? target : null),
      frame: async () => {
        frames += 1;
        if (frames === 2) {
          control.abort();
        }
      },
      signal: control.signal,
    });
    expect(found).toBe(false);
    expect(frames).toBe(2);
    expect(target.scrollIntoView).not.toHaveBeenCalled();
  });

  const toSync = (scroll: { mock: { contexts: unknown[] } }): number =>
    scroll.mock.contexts.filter((element) => (element as Element).id === "sincronizacion").length;

  it("is what the frame does on entering by /ajustes#sincronizacion", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    await showInShell("/ajustes#sincronizacion", { "/ajustes": Ajustes });
    await until(() => toSync(scroll) === 1, "que el marco lleve a #sincronizacion");
  });

  it("follows a link of the application to a fragment", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    const Enlace = () => <A href="/ajustes#sincronizacion">Sincronización</A>;
    const host = await showInShell("/enlace", { "/ajustes": Ajustes, "/enlace": Enlace });
    (host.querySelector('a[href="/ajustes#sincronizacion"]') as HTMLElement).click();
    // The router scrolls too when the target is already painted; the frame's
    // own arrival is the one that also moves the focus.
    await until(() => toSync(scroll) >= 1, "que el enlace lleve a #sincronizacion");
    await until(
      () => document.activeElement === host.querySelector("#sincronizacion h2"),
      "el foco en el título de destino",
    );
  });

  it("opens the gate again after going back from a filter, which only changes the query", async () => {
    // Round 2 of the review of PR #105, O1: the filters of the movements push
    // their query; back from one, only the query changes, and a gate that
    // compared the path and the fragment stayed shut for the next navigation.
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    let go: ((to: string) => void) | undefined;
    const ConNavegacion = () => {
      go = useNavigate();
      return <Movimientos />;
    };
    await showInShell("/movimientos", { "/movimientos": ConNavegacion, "/ajustes": Ajustes });
    go?.("/movimientos?tipo=buy");
    await until(() => window.location.search === "?tipo=buy", "el filtro");
    window.history.back();
    await until(() => window.location.search === "", "la vuelta atrás del filtro");
    await settle(50);
    // A navigation of the application to a fragment, without a click.
    // The router scrolls too when the target is already there; the frame is
    // the one that also moves the focus, so the focus is what tells them apart.
    go?.("/ajustes#sincronizacion");
    await until(() => toSync(scroll) >= 1, "que se llegue al ancla");
    await until(
      () =>
        document.activeElement?.closest("#sincronizacion") !== null &&
        document.activeElement?.tagName === "H2",
      "que el marco siga el ancla tras la vuelta atrás",
    );
  });

  it("stops waiting when the address changes: a target painted on the next page is not chased", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    // Frames at a browser's pace: happy-dom runs them at once, and 120 would be
    // spent before the click, which would prove nothing.
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 50),
    );
    const Uno = () => <A href="/dos">Dos</A>;
    const Dos = () => (
      <div id="destino">
        <h2>Destino</h2>
      </div>
    );
    const host = await showInShell("/uno#destino", { "/uno": Uno, "/dos": Dos });
    (host.querySelector('a[href="/dos"]') as HTMLElement).click();
    await until(() => host.querySelector("#destino") !== null, "la segunda página");
    await settle(300);
    expect(scroll.mock.contexts.filter((element) => (element as Element).id === "destino")).toEqual(
      [],
    );
  });

  it("does not win over the back button after visiting another screen either", async () => {
    // Measured in Chromium: the frame was mounted again with each screen, so
    // coming back from another one met a fresh gate and followed the fragment.
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    const Otra = () => <p>Otra</p>;
    const Salida = () => <A href="/otra">Otra</A>;
    const Ajustes2 = () => (
      <>
        <Salida />
        <Ajustes />
      </>
    );
    const host = await showInShell("/ajustes#sincronizacion", {
      "/ajustes": Ajustes2,
      "/otra": Otra,
    });
    await until(() => toSync(scroll) === 1, "la primera llegada");
    (host.querySelector('a[href="/otra"]') as HTMLElement).click();
    await until(() => window.location.pathname === "/otra", "la otra pantalla");
    window.history.back();
    await until(() => host.querySelector("#sincronizacion") !== null, "la vuelta a Ajustes");
    await settle(100);
    expect(toSync(scroll)).toBe(1);
  });

  it("does not win over the back button: coming back from the history, it stays", async () => {
    // Round 1 of the review of PR #105, N2.
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    const host = await showInShell("/ajustes#sincronizacion", { "/ajustes": Ajustes });
    await until(() => toSync(scroll) === 1, "la primera llegada");
    // Leave the fragment, then come back to it through the history.
    window.history.pushState({}, "", "/ajustes");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await settle(20);
    window.history.pushState({}, "", "/ajustes#sincronizacion");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await settle(50);
    expect(host.querySelector("#sincronizacion")).not.toBeNull();
    expect(toSync(scroll)).toBe(1);
  });
});
