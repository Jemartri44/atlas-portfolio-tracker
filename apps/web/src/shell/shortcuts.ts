// The keyboard of a computer (docs/design/system.md §4.4): «/» opens «Buscar o registrar», and one
// letter per form of the day to day. Pure, so the rules that keep it out of the way are tested
// without a browser:
// - only a plain key: with Ctrl, Cmd or Alt it belongs to the browser or the system;
// - never while typing: in a field, a list or anything editable the letter is a letter;
// - never over a dialog, which owns the keyboard while it is open.

/** The letter of each form, and where it goes. */
export const LETTERS: Readonly<Record<string, { to: string; label: string }>> = {
  c: { to: "/registrar/buy", label: "Registrar una compra" },
  v: { to: "/registrar/sell", label: "Registrar una venta" },
  p: { to: "/registrar/valuation", label: "Registrar una valoración" },
};

export type ShortcutAction = { kind: "search" } | { kind: "go"; to: string };

interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  isComposing?: boolean;
  defaultPrevented: boolean;
}

interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
}

const EDITABLE = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** What a key press asks for, or nothing when it is not ours to answer. */
export const shortcutOf = (
  event: KeyLike,
  target: TargetLike | null,
  dialogOpen: boolean,
): ShortcutAction | undefined => {
  if (
    event.defaultPrevented ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.isComposing === true ||
    dialogOpen ||
    (target !== null && (EDITABLE.has(target.tagName ?? "") || target.isContentEditable === true))
  ) {
    return undefined;
  }
  if (event.key === "/") {
    return { kind: "search" };
  }
  const letter = LETTERS[event.key.toLowerCase()];
  return letter === undefined ? undefined : { kind: "go", to: letter.to };
};

export interface Command {
  label: string;
  to: string;
  /** The letter that does it from anywhere, when it has one. */
  key?: string;
}

/** Everything «Buscar o registrar» offers before anything is typed. */
export const COMMANDS: readonly Command[] = [
  ...Object.entries(LETTERS).map(([key, letter]) => ({ label: letter.label, to: letter.to, key })),
  { label: "Registrar un ingreso de efectivo", to: "/registrar/cash-in" },
  { label: "Registrar una retirada de efectivo", to: "/registrar/cash-out" },
  { label: "Registrar un dividendo", to: "/registrar/dividend" },
  { label: "Registrar una orden dada", to: "/registrar/order" },
  { label: "Ir al resumen", to: "/" },
  { label: "Ir a los movimientos", to: "/movimientos" },
  { label: "Ir a la cartera", to: "/cartera" },
  { label: "Ir al cubo", to: "/cubo" },
  { label: "Ir a la declaración", to: "/fiscal" },
  { label: "Ir a los ajustes", to: "/ajustes" },
];

const fold = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/**
 * The commands whose words contain every word typed, accents aside, and always, last, a search
 * of the movements for what was typed: the box searches as much as it registers.
 */
export const commandsFor = (typed: string): Command[] => {
  const words = fold(typed).split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [...COMMANDS];
  }
  const matching = COMMANDS.filter((command) =>
    words.every((word) => fold(command.label).includes(word)),
  );
  return [
    ...matching,
    {
      label: `Buscar «${typed.trim()}» en los movimientos`,
      to: `/movimientos?q=${encodeURIComponent(typed.trim())}`,
    },
  ];
};
