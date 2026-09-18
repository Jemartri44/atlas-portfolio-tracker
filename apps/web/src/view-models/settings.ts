// The arithmetic and the bookkeeping of the configuration screen, out of the
// screen.
//
// The target weights are a **business decimal**, so they are added with the
// decimal of the domain and never with `Number.parseFloat`, which is precisely
// the door ADR-0005 closes (trap 3 of `CLAUDE.md`). And the rule "do they add
// up to 100?" lives here, where a test reaches it, instead of inside a `.tsx`
// where nothing could (decision (c)).
//
// The rest of the file is the draft that screen edits: which fields exist, what
// each one shows, and what the patch looks like after a keystroke. It used to
// live inside `routes/ajustes/configuracion.tsx`, where 517 lines hid four
// closures no test could reach (review of 2026-09-18). Everything here is a
// pure function over plain objects: no signal, no DOM.
//
// LINE BUDGET: same reason as `forms/specs.ts`. Most of this file is the two
// tables that describe the configuration fields — which are numbers, which are
// texts, what each one means — and the rest is the draft logic that reads them.
// The tables are the documentation of `Settings` as the screen sees it, and
// they are worth reading in one piece.

import {
  type AssetType,
  Decimal,
  isDecimalString,
  mergeSettings,
  type Settings,
} from "@atlas/domain";

/** What the weights of the core have to add up to (rule 3 of the plan). */
const HUNDRED = Decimal.parse("100");

export interface WeightTotal {
  /** The exact sum of what is written, as a decimal string; the screen rounds it. */
  total: string;
  /** Whether it adds up to 100 to the cent, which is what the screen states. */
  addsUp: boolean;
}

/**
 * Adds the weights as they are being typed, accepting the comma of a Spanish
 * keyboard.
 *
 * An empty field is **not** a zero: it is a weight that has not been declared
 * yet, so it stays out of the sum. Anything that is not a decimal — a
 * half-typed number — stays out too **and** makes the total not add up: a sum
 * that ignores what it cannot read must never claim to be 100.
 */
export const targetWeightTotal = (weights: Record<string, string>): WeightTotal => {
  let total = Decimal.ZERO;
  let readable = true;
  for (const raw of Object.values(weights)) {
    const text = raw.trim().replace(",", ".");
    if (text === "") {
      continue;
    }
    if (!isDecimalString(text)) {
      readable = false;
      continue;
    }
    total = total.add(Decimal.parse(text));
  }
  // Compared on the rounded value, so the verdict and the printed figure never
  // contradict each other.
  return { total: total.toString(), addsUp: readable && total.round(2).eq(HUNDRED) };
};

// --- The draft the screen edits ------------------------------------------

/**
 * What has been touched, keyed by setting. `undefined` as a value is a field
 * the user emptied, which is **not** the same as a field nobody touched: the
 * first clears the setting, the second leaves it alone.
 */
export type SettingsPatch = Readonly<Record<string, unknown>>;

/** The weights being typed, by `asset_id`; `undefined` means "not touched yet". */
export type WeightDraft = Readonly<Record<string, string>> | undefined;

export interface NumberSetting {
  key: keyof Settings;
  label: string;
  hint?: string;
  /** Written as an integer; anything else is a business decimal. */
  integer?: boolean;
}

export interface TextSetting {
  key: keyof Settings;
  label: string;
  hint?: string;
}

/** The numeric thresholds, in the order the screen shows them. */
export const SETTINGS_NUMBERS: readonly NumberSetting[] = [
  {
    key: "deviation_threshold_pp",
    label: "Umbral de desviación (pp)",
    hint: "Avisa cuando un activo del núcleo se separa tanto de su objetivo (regla 3).",
  },
  {
    key: "satellite_min_weight_pct",
    label: "Mínimo de un satélite (%)",
    hint: "Por debajo de esto, oro o cripto dejan de ser significativos (regla 6b).",
  },
  { key: "monthly_contribution_eur", label: "Aportación mensual (EUR)" },
  {
    key: "bucket_pct_of_contribution",
    label: "Porcentaje al cubo (%)",
    hint: "El cubo es un presupuesto sobre la aportación, nunca una asignación.",
  },
  { key: "bucket_max_cumulative_contribution", label: "Tope de aporte al cubo (EUR)" },
  { key: "bucket_stop_loss_pct", label: "Regla de parada del cubo (%)" },
  { key: "bucket_max_weight_pct", label: "Peso máximo del cubo (%)" },
  { key: "model_720_alert_threshold_eur", label: "Umbral del Modelo 720 (EUR)" },
  { key: "model_721_alert_threshold_eur", label: "Umbral del Modelo 721 (EUR)" },
  {
    key: "stale_price_days",
    label: "Días para que un precio caduque",
    integer: true,
    hint: "Pasados estos días, un precio se marca caducado (nunca se oculta).",
  },
  {
    key: "transfer_max_days",
    label: "Días máximos de un traspaso",
    integer: true,
    hint: "Referencia del plan; hoy no dispara ningún aviso.",
  },
];

/** The free-text settings. */
export const SETTINGS_TEXTS: readonly TextSetting[] = [
  { key: "tax_residence", label: "Residencia fiscal", hint: "Dos letras (ISO 3166-1)." },
  { key: "notification_email", label: "Correo de avisos", hint: "Lo usará la Fase 4." },
];

/** The two settings that hold one value **per asset type** (ADR-0013, ADR-0018). */
export type PerAssetTypeKey = "fiscal_date_rule" | "wash_sale_window";

const asRecord = (value: unknown): Record<string, string> =>
  typeof value === "object" && value !== null ? (value as Record<string, string>) : {};

/** What a field shows: what was typed if it was, otherwise what is in force. */
export const settingValue = (
  current: Settings,
  patch: SettingsPatch,
  key: keyof Settings,
): string => {
  const override = patch[key as string];
  if (override !== undefined) {
    return String(override);
  }
  const existing = current[key];
  return existing === undefined ? "" : String(existing);
};

/**
 * The patch after typing in a numeric field. An empty field clears the setting;
 * the comma of a Spanish keyboard becomes the point the ledger stores, and the
 * value stays a **string** all the way to `mergeSettings` unless the field is
 * declared an integer (trap 3: no float ever touches a business decimal).
 */
export const withNumber = (
  patch: SettingsPatch,
  key: keyof Settings,
  raw: string,
  integer = false,
): SettingsPatch => {
  const text = raw.trim();
  return {
    ...patch,
    [key]: text === "" ? undefined : integer ? Number.parseInt(text, 10) : text.replace(",", "."),
  };
};

/** The patch after typing in a text field; blank clears it. */
export const withText = (
  patch: SettingsPatch,
  key: keyof Settings,
  raw: string,
): SettingsPatch => ({
  ...patch,
  [key]: raw.trim() === "" ? undefined : raw.trim(),
});

/** The patch after choosing in a select; the empty option clears the setting. */
export const withOption = (
  patch: SettingsPatch,
  key: keyof Settings,
  raw: string,
): SettingsPatch => ({ ...patch, [key]: raw === "" ? undefined : raw });

/**
 * What the field shows: the draft when there is one, otherwise what is in force.
 *
 * Once a draft map exists it is the **whole** map — `withPerAssetType` rebuilds
 * it from what is in force plus what has been typed — so a key missing from it
 * means "removed", not "not touched". Falling back to the value in force here
 * would put the old value back on screen the moment the field was emptied,
 * which is the same lie the control used to tell (Q10).
 */
export const perAssetTypeValue = (
  current: Settings,
  patch: SettingsPatch,
  key: PerAssetTypeKey,
  type: AssetType,
): string => {
  const draft = patch[key];
  return draft === undefined
    ? String(current[key][type] ?? "")
    : String(asRecord(draft)[type] ?? "");
};

/**
 * Sets — or **removes** — the rule of one asset type.
 *
 * The map is rebuilt from what is in force plus what was already typed, so
 * touching `fund` never drops `crypto`.
 *
 * Emptying the field takes the key out of the map, which is what the control
 * ("Valor por defecto") has always promised and never did: the old version
 * spread an empty object, so a value already set could not be removed from the
 * screen and the user was told something had changed when nothing had. A
 * control that lies about what it did is worse than no control (Q10).
 *
 * Removing is legitimate and its meaning is written down: ADR-0018 makes these
 * maps **partial**, and an absent type takes the default documented in ADR-0013
 * and ADR-0014. The dangerous case — a change that reinterprets events already
 * recorded — is caught where it belongs, when the `settings_changed` is
 * registered (ADR-0015 lists what it invalidates and asks for confirmation).
 */
export const withPerAssetType = (
  current: Settings,
  patch: SettingsPatch,
  key: PerAssetTypeKey,
  type: AssetType,
  raw: string,
): SettingsPatch => {
  const text = raw.trim();
  const merged: Record<string, unknown> = {
    ...current[key],
    ...asRecord(patch[key]),
  };
  if (text === "") {
    delete merged[type];
  } else {
    merged[type] = text;
  }
  return { ...patch, [key]: merged };
};

/** The weights shown: what is being typed, or what is in force for each asset. */
export const weightValues = (
  current: Settings,
  coreAssetIds: readonly string[],
  declared: WeightDraft,
): Record<string, string> => {
  if (declared !== undefined) {
    return { ...declared };
  }
  const from = current.target_weights ?? {};
  const result: Record<string, string> = {};
  for (const assetId of coreAssetIds) {
    result[assetId] = from[assetId] ?? "";
  }
  return result;
};

/**
 * The candidate configuration: what is in force plus everything touched.
 *
 * It throws what `mergeSettings` throws — an invalid value is a domain error
 * with its own Spanish message, not something this layer re-invents.
 */
export const candidateSettings = (
  current: Settings,
  patch: SettingsPatch,
  declared: WeightDraft,
): Settings => {
  const changes: Record<string, unknown> = { ...patch };
  if (declared !== undefined) {
    const target: Record<string, string> = {};
    for (const [asset, raw] of Object.entries(declared)) {
      if (raw.trim() !== "") {
        target[asset] = raw.replace(",", ".");
      }
    }
    changes.target_weights = target;
  }
  return mergeSettings(current, changes as Partial<Settings>);
};

/** Whether there is anything to save, which is what enables the two buttons. */
export const settingsTouched = (patch: SettingsPatch, declared: WeightDraft): boolean =>
  Object.keys(patch).length > 0 || declared !== undefined;
