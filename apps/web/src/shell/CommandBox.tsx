// «Buscar o registrar» (docs/design/system.md §4.4): on a computer, a button in the top bar and a
// box of commands in a dialog, opened with «/». It also listens for the letters of the day to day
// (`shortcuts.ts`). Not on a phone or a tablet: there is no keyboard to save there, and the bar has
// no room.
//
// The box is an ARIA combobox: the field keeps the focus, the arrows move the active option
// (`aria-activedescendant`), Enter follows it and Esc closes the dialog.

import { useNavigate } from "@solidjs/router";
import { createSignal, createUniqueId, For, type JSX, onCleanup, Show } from "solid-js";
import { Icon } from "../components/Icon.jsx";
import { mediaQuery, TOP_BAR } from "./media.js";
import { type Command, commandsFor, shortcutOf } from "./shortcuts.js";

/**
 * The key that opens the box, set at run time: Solid writes a static attribute (a literal or a
 * constant) into its template without quotes, and `aria-keyshortcuts=/` reads as empty.
 */
const openKey = (): string => "/";

export const CommandBox = (): JSX.Element => {
  const wide = mediaQuery(TOP_BAR);
  const navigate = useNavigate();
  const id = createUniqueId();
  const [open, setOpen] = createSignal(false);
  const [typed, setTyped] = createSignal("");
  const [active, setActive] = createSignal(0);
  let dialog: HTMLDialogElement | undefined;
  let field: HTMLInputElement | undefined;

  const shown = (): Command[] => commandsFor(typed());

  const show = (): void => {
    setTyped("");
    setActive(0);
    setOpen(true);
    dialog?.showModal();
    field?.focus();
  };
  const close = (): void => {
    setOpen(false);
    dialog?.close();
  };
  const follow = (command: Command | undefined): void => {
    if (command !== undefined) {
      close();
      navigate(command.to);
    }
  };

  const onKey = (event: KeyboardEvent): void => {
    if (!wide()) {
      return;
    }
    const target = event.target instanceof HTMLElement ? event.target : null;
    const action = shortcutOf(event, target, document.querySelector("dialog[open]") !== null);
    if (action === undefined) {
      return;
    }
    event.preventDefault();
    if (action.kind === "search") {
      show();
    } else {
      navigate(action.to);
    }
  };
  document.addEventListener("keydown", onKey);
  onCleanup(() => document.removeEventListener("keydown", onKey));

  const onFieldKey = (event: KeyboardEvent): void => {
    const count = shown().length;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((active() + 1) % count);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((active() - 1 + count) % count);
    } else if (event.key === "Enter") {
      event.preventDefault();
      follow(shown()[active()]);
    }
  };

  return (
    <Show when={wide()}>
      <button
        type="button"
        class="command-button secondary"
        aria-haspopup="dialog"
        aria-keyshortcuts={openKey()}
        onClick={show}
      >
        <Icon name="search" class="icon-sm" />
        <span class="command-label">Buscar o registrar</span>
        <kbd>/</kbd>
      </button>
      <dialog
        ref={dialog}
        class="command-dialog"
        aria-label="Buscar o registrar"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClose={() => setOpen(false)}
      >
        <div class="command-body">
          <input
            ref={field}
            id={`cmd-${id}`}
            class="command-field"
            type="text"
            role="combobox"
            aria-label="Buscar o registrar"
            aria-expanded={open()}
            aria-controls={`cmd-list-${id}`}
            aria-activedescendant={`cmd-${id}-${active()}`}
            aria-autocomplete="list"
            autocomplete="off"
            placeholder="Escribe «compra», «cartera» o lo que buscas"
            value={typed()}
            onInput={(event) => {
              setTyped(event.currentTarget.value);
              setActive(0);
            }}
            onKeyDown={onFieldKey}
          />
          <div class="command-list" id={`cmd-list-${id}`} role="listbox" aria-label="Órdenes">
            <For each={shown()}>
              {(command, at) => (
                // The field keeps the focus and the keyboard (an ARIA combobox): an option is reached
                // by the arrows through `aria-activedescendant`, and clicked with the mouse.
                // biome-ignore lint/a11y/useKeyWithClickEvents: the field handles the keys
                <div
                  id={`cmd-${id}-${at()}`}
                  role="option"
                  tabIndex={-1}
                  aria-selected={active() === at()}
                  class="command-option"
                  onClick={() => follow(command)}
                  onMouseMove={() => setActive(at())}
                >
                  <span>{command.label}</span>
                  <Show when={command.key}>{(key) => <kbd>{key().toUpperCase()}</kbd>}</Show>
                </div>
              )}
            </For>
          </div>
          <p class="command-hint">
            Flechas para elegir, Intro para ir, Esc para cerrar. Desde cualquier pantalla: C compra,
            V venta, P valoración.
          </p>
        </div>
      </dialog>
    </Show>
  );
};
