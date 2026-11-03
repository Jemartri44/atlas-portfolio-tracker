// What fixes each refusal of the contribution plan, and where: the card of the Cartera and the
// month of the summary say the same remedy.

/**
 * What fixes each refusal, and where. The button used to be written by hand as
 * "Registrar una valoración", so it also appeared when what was missing were
 * the target weights, and sent the user to a form that could not help.
 */
export const REMEDIES: Record<string, { label: string; to: string }> = {
  missing_manual_prices: { label: "Registrar una valoración", to: "/registrar/valuation" },
  missing_target_weights: { label: "Fijar los pesos objetivo", to: "/ajustes/configuracion" },
  no_target_weight_in_table: { label: "Revisar los pesos objetivo", to: "/ajustes/configuracion" },
  missing_bucket_pct: { label: "Revisar la configuración", to: "/ajustes/configuracion" },
  missing_amount: { label: "Fijar la aportación mensual", to: "/ajustes/configuracion" },
};
