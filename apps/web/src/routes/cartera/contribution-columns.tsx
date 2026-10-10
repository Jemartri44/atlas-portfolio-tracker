// The columns of «Ver el cálculo» on the contribution card: value today,
// shortfall, what goes in, weight after.

import { Amount, type DataColumn, Figure } from "../../components/index.js";
import type { ContributionRowView } from "../../view-models/core/index.js";

export const COLUMNS: readonly DataColumn<ContributionRowView>[] = [
  {
    key: "name",
    header: "Activo",
    card: "title",
    cell: (row) => row.name,
    hint: (row) => row.name,
  },
  {
    key: "value",
    header: "Valor hoy",
    numeric: true,
    cell: (row) => <Amount value={row.value} />,
  },
  {
    key: "gap",
    header: "Déficit",
    numeric: true,
    card: "sub",
    cell: (row) => <Amount value={row.gap} />,
    cardCell: (row) => (
      <span>
        déficit <Amount value={row.gap} /> · objetivo{" "}
        <Figure value={row.targetPct} unit="percent" decimals="auto" />
      </span>
    ),
  },
  {
    key: "allocation",
    header: "Aportar",
    numeric: true,
    card: "figure",
    cell: (row) => <Amount value={row.allocation} />,
  },
  {
    key: "after",
    header: "Peso tras",
    numeric: true,
    cell: (row) => <Figure value={row.weightAfterPct} unit="percent" />,
  },
];
