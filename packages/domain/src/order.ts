// Ids, codes and ISO dates are ASCII and ordered by code unit: `localeCompare` would make the order,
// and with it who takes a cent of a residue, depend on the ICU of the runtime (Lambda or browser).

export const byCode = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
