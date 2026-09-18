// The corporate-action forms, described as **parameters**, not as effects.
//
// `corporate_action` is the only event of the schema whose body is not flat: it
// carries `effects[]`, and composing that array — including working out the
// fractional shares a reverse split leaves in each account — is a business rule
// with a fiscal consequence. It lives in the domain (`corporateActionDraft`,
// Q4 of prompt 007), and this file only says **which fields to ask for** for
// each kind, exactly like `specs.ts` does for the flat events.
//
// The eight forms mirror the eight wizards of `atlas ca`. The ninth escape
// hatch (`raw`, effects written by hand as JSON) stays CLI-only on purpose:
// typing a JSON array of effects on a phone is not an interface, it is a trap.

import type { CorporateActionKind } from "@atlas/domain";
import type { FieldSpec } from "./specs.js";

export interface CorporateForm {
  /** Segment of the URL: /registrar/evento-corporativo/<slug>. */
  slug: string;
  kind: CorporateActionKind;
  title: string;
  when: string;
  /** Fields beyond the ones every corporate action has. */
  fields: FieldSpec[];
  /** One line about what the domain will do with these numbers. */
  effect: string;
}

const ratio = (hint: string): FieldSpec => ({
  name: "ratio",
  label: "Ratio",
  kind: "text",
  required: true,
  hint,
});

const destination = (): FieldSpec => ({
  name: "to_asset_id",
  label: "Activo de destino",
  kind: "select",
  required: true,
  options: "assets",
  hint: "Tiene que estar dado de alta antes.",
});

/**
 * The cash settlement of the leftovers. Optional as a block: filling the price
 * is what tells the domain to generate the forced sale of the fractions, and
 * leaving it empty means the issuer settled nothing.
 */
const cash = (label: string, hint: string): FieldSpec[] => [
  { name: "cash_unit_price", label, kind: "decimal", hint },
  {
    /*
     * The broker's charge on the forced sale. **It is not decoration**: it is
     * subtracted from the proceeds in `applyForcedSale`, so it lowers the
     * capital gain. Leaving it out of the form left a reverse split recorded
     * from the phone with the gain **overstated**, and the user paying tax on
     * money they never received — and since the ledger is append-only, fixing
     * that afterwards means a `reversal` plus a corrected event.
     */
    name: "cash_fees",
    label: "Comisión del bróker, por cuenta",
    kind: "textarea",
    hint: "Una por línea: nombre de la cuenta = importe, por ejemplo «Cubo especulativo = 1,50». Se resta de los ingresos de la venta, así que baja la ganancia. Déjalo vacío si no cobró nada.",
    full: true,
    visibleWhen: { field: "cash_unit_price", notEquals: "" },
  },
  {
    name: "cash_currency",
    label: "Divisa de la liquidación",
    kind: "select",
    options: "currencies",
    initial: "EUR",
    visibleWhen: { field: "cash_unit_price", notEquals: "" },
  },
  {
    name: "cash_fx_rate",
    label: "Tipo del BCE",
    kind: "decimal",
    initial: "1",
    hint: "Unidades de la divisa por euro, tal como lo publica el BCE.",
    visibleWhen: { field: "cash_unit_price", notEquals: "" },
  },
  {
    name: "cash_fx_rate_date",
    label: "Fecha del tipo",
    kind: "date",
    visibleWhen: { field: "cash_unit_price", notEquals: "" },
  },
];

export const CORPORATE_FORMS: readonly CorporateForm[] = [
  {
    slug: "split",
    kind: "split",
    title: "Split",
    when: "El emisor ha multiplicado el número de títulos sin cambiar tu dinero.",
    fields: [ratio("Títulos nuevos por antiguo: 2 para un 2x1, o 3/2.")],
    effect: "Multiplica la cantidad de cada lote y divide su coste unitario. No hay ganancia.",
  },
  {
    slug: "contrasplit",
    kind: "reverse_split",
    title: "Contrasplit",
    when: "El emisor ha agrupado títulos. Suele dejar picos que se liquidan en efectivo.",
    fields: [
      ratio("Títulos nuevos por antiguo: 1/3 para un 1x3."),
      ...cash(
        "Precio del pico por título",
        "Si el emisor liquidó los picos en efectivo. Déjalo vacío si no los hubo.",
      ),
    ],
    effect:
      "Agrupa los lotes y, si hay liquidación, vende los picos que quedan en cada cuenta. Esa venta sí genera ganancia.",
  },
  {
    slug: "fusion",
    kind: "merger",
    title: "Fusión",
    when: "Tu activo se ha canjeado por el de otra sociedad.",
    fields: [
      destination(),
      ratio("Títulos nuevos por antiguo."),
      ...cash("Precio del pico por título", "Si el canje liquidó picos en efectivo."),
    ],
    effect:
      "Convierte los lotes al activo nuevo conservando fecha y coste. Un canje homogéneo no tributa (business-rules.md §6).",
  },
  {
    slug: "escision",
    kind: "spin_off",
    title: "Escisión",
    when: "Una parte del negocio se ha separado y te han dado títulos de la nueva.",
    fields: [
      destination(),
      ratio("Títulos de la nueva por cada uno de la antigua."),
      {
        name: "cost_share",
        label: "Parte del coste que se lleva",
        kind: "decimal",
        required: true,
        hint: "Entre 0 y 1. Lo dice la nota del emisor; no te lo inventes.",
      },
      ...cash("Precio del pico por título", "Si la escisión liquidó picos en efectivo."),
    ],
    effect: "Reparte el coste de cada lote entre el activo antiguo y el nuevo. No hay ganancia.",
  },
  {
    slug: "fusion-fondos",
    kind: "fund_merger",
    title: "Fusión de fondos",
    when: "Tu fondo se ha fusionado con otro.",
    fields: [destination(), ratio("Participaciones nuevas por antigua.")],
    effect: "Conserva fecha de adquisición y coste, como un traspaso. No tributa.",
  },
  {
    slug: "cambio-clase",
    kind: "share_class_change",
    title: "Cambio de clase",
    when: "El fondo ha pasado tus participaciones a otra clase.",
    fields: [destination(), ratio("Participaciones nuevas por antigua.")],
    effect: "Conserva fecha de adquisición y coste. No tributa.",
  },
  {
    slug: "liquidacion-fondo",
    kind: "fund_liquidation",
    title: "Liquidación de un fondo",
    when: "El fondo se ha liquidado y te han pagado en efectivo.",
    fields: cash("Precio de liquidación por participación", "Lo que pagaron por participación."),
    effect: "Vende toda la posición en todas las cuentas que la tenían. Genera ganancia.",
  },
  {
    slug: "exclusion",
    kind: "delisting",
    title: "Exclusión de cotización",
    when: "El valor ha dejado de cotizar y no han pagado nada.",
    fields: [],
    effect:
      "No cambia ningún lote: deja constancia del hecho. Márcalo después como activo inactivo.",
  },
];

export const corporateForm = (slug: string): CorporateForm | undefined =>
  CORPORATE_FORMS.find((form) => form.slug === slug);

/** Fields every corporate action asks for, whatever its kind. */
export const CORPORATE_COMMON: readonly FieldSpec[] = [
  {
    name: "asset_id",
    label: "Activo afectado",
    kind: "select",
    required: true,
    options: "assets",
  },
  { name: "effective_date", label: "Fecha de efecto", kind: "date", required: true },
  {
    name: "source_document",
    label: "Fuente documental",
    kind: "text",
    required: true,
    full: true,
    hint: "URL de la nota del emisor o clave del PDF. No es opcional: sin ella no hay evento.",
  },
  { name: "notes", label: "Notas", kind: "textarea", full: true },
];
