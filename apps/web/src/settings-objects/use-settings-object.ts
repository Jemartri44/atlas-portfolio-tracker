// An object the owner edits outside the ledger (`docs/api.md` §6.2), read from the cloud and written
// back with the etag it was read at. Nothing of it stays on the device. A screen that shows or edits
// one makes its own: each reads when it opens, so what it shows is what the cloud holds.
//
// - No object yet is an empty value, not an error.
// - An object that is there and does not validate is **no data** (`unreadable`): the screen says so,
//   and writing replaces it only with the etag that was read.
// - A write that meets another one (`412`) reads again and says so: the owner decides again over
//   what is there now.

import {
  ApiExposureStore,
  ApiProjectionStore,
  type SettingsRead,
} from "@atlas/adapters/settings-http";
import {
  type Exposures,
  exposureOrNone,
  type ProjectionEdits,
  parseProjectionText,
} from "@atlas/domain/portfolio";
import { RemoteError } from "@atlas/domain/sync";
import { createSignal, onMount } from "solid-js";
import { cloudFetch } from "../ledger/cloud.js";
import { toAppError } from "../ledger/errors.js";

export type SettingsLoad<T> =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; value: T; etag: string | undefined; unreadable: boolean };

interface SettingsObjectRules<T> {
  store: () => {
    read(): Promise<SettingsRead>;
    write(value: T, etag: string | undefined): Promise<{ etag: string }>;
  };
  /** The value of the stored text, or `undefined` when it does not validate. */
  parse: (text: string) => T | undefined;
  empty: T;
  /** What the owner reads when another device wrote first. */
  changed: string;
  /** What the owner reads when saving before the object was read. */
  notRead: string;
}

const createSettingsObject = <T>(rules: SettingsObjectRules<T>) => {
  const [state, setState] = createSignal<SettingsLoad<T>>({ kind: "loading" });
  const [busy, setBusy] = createSignal(false);

  const load = async (): Promise<void> => {
    try {
      const read = await rules.store().read();
      if (read.kind === "missing") {
        setState({ kind: "ready", value: rules.empty, etag: undefined, unreadable: false });
        return;
      }
      const value = rules.parse(read.text);
      setState({
        kind: "ready",
        value: value ?? rules.empty,
        etag: read.etag,
        unreadable: value === undefined,
      });
    } catch (failure) {
      setState({ kind: "failed", message: toAppError(failure).message });
    }
  };

  /** The sentence of what went wrong, or `undefined` when it is saved. */
  const save = async (next: T): Promise<string | undefined> => {
    const current = state();
    if (current.kind !== "ready") {
      return rules.notRead;
    }
    setBusy(true);
    try {
      const written = await rules.store().write(next, current.etag);
      setState({ kind: "ready", value: next, etag: written.etag, unreadable: false });
      return undefined;
    } catch (failure) {
      if (
        failure instanceof RemoteError &&
        (failure.code === "precondition_failed" || failure.code === "precondition_required")
      ) {
        await load();
        return rules.changed;
      }
      return toAppError(failure).message;
    } finally {
      setBusy(false);
    }
  };

  onMount(() => void load());
  return { state, busy, save, reload: load };
};

export const createExposure = () =>
  createSettingsObject<Exposures>({
    store: () => new ApiExposureStore({ origin: "", fetch: cloudFetch() }),
    parse: exposureOrNone,
    empty: {},
    changed:
      "La exposición ha cambiado desde otro dispositivo. Ya está leída otra vez: mira lo que hay y vuelve a hacerlo.",
    notRead: "La exposición todavía no se ha leído.",
  });

export const createProjectionEdits = () =>
  createSettingsObject<ProjectionEdits>({
    store: () => new ApiProjectionStore({ origin: "", fetch: cloudFetch() }),
    parse: (text) => {
      try {
        return parseProjectionText(text);
      } catch {
        return undefined;
      }
    },
    empty: {},
    changed:
      "Los supuestos han cambiado desde otro dispositivo. Ya están leídos otra vez: mira lo que hay y vuelve a hacerlo.",
    notRead: "Los supuestos todavía no se han leído.",
  });
