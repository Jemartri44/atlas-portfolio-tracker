// "¿Y si vendo?" — what a sale would bring before it is placed: the lots it
// takes by FIFO, the gain, the tax it adds to the year's estimated quota and,
// for a loss, until when buying it back would defer it. It runs on a copy of
// the ledger in memory: nothing is recorded, and the card says so every time.

import type { CivilDate, ExternalPrices, LedgerEvent, LedgerState, Settings } from "@atlas/domain";
import { physicalPositions, Quantity } from "@atlas/domain";
import { simulateSale } from "@atlas/domain/fiscal";
import { createMemo, createSignal, type JSX, Show } from "solid-js";
import {
  Amount,
  type DataColumn,
  DataTable,
  ErrorView,
  Field,
  Notice,
  PriceDetail,
  Section,
  SelectField,
  StatLine,
  Switch,
  Tag,
} from "../../components/index.js";
import { parseDecimalInput } from "../../format/input.js";
import { nameIndex } from "../../format/names.js";
import { attempt } from "../../ledger/query.js";
import { type SaleLotView, type SaleOrderView, saleView } from "../../view-models/fiscal/sale.js";
import { assetOptions } from "../../view-models/options.js";

const ORDERS: DataColumn<SaleOrderView>[] = [
  { key: "account", header: "Cuenta", card: "title", cell: (row) => row.account },
  {
    key: "quantity",
    header: "Cantidad",
    numeric: true,
    card: "sub",
    cell: (row) => <Amount quantity={row.quantity} />,
  },
  {
    key: "fee",
    header: "Comisión",
    numeric: true,
    card: "meta",
    cell: (row) => (
      <Show when={row.fee_eur} fallback="desconocida">
        {(fee) => <Amount value={fee()} />}
      </Show>
    ),
  },
  {
    key: "amount",
    header: "Importe",
    numeric: true,
    card: "figure",
    cell: (row) => <Amount value={row.amount_eur} />,
  },
];

const LOTS: DataColumn<SaleLotView>[] = [
  { key: "acquired", header: "Comprado el", card: "title", cell: (row) => row.acquired },
  {
    key: "quantity",
    header: "Cantidad",
    numeric: true,
    card: "sub",
    cell: (row) => <Amount quantity={row.quantity} />,
  },
  {
    key: "cost",
    header: "Coste",
    numeric: true,
    card: "meta",
    cell: (row) => <Amount value={row.cost_eur} />,
  },
  {
    key: "gain",
    header: "Resultado",
    numeric: true,
    card: "figure",
    cell: (row) => <Amount value={row.gain_eur} coloured />,
  },
];

export const SaleSimulatorCard = (props: {
  state: LedgerState;
  events: readonly LedgerEvent[];
  date: CivilDate;
  settings: Settings;
  external?: ExternalPrices | undefined;
}): JSX.Element => {
  const [asset, setAsset] = createSignal("");
  const [quantity, setQuantity] = createSignal("");
  const [all, setAll] = createSignal(true);

  /** Only what is held can be sold. */
  const options = () => {
    const held = new Set(
      physicalPositions(props.state)
        .filter((row) => row.quantity.isPositive())
        .map((row) => row.asset_id),
    );
    return assetOptions(props.state, { heldIn: true }).filter((option) => held.has(option.value));
  };

  const result = createMemo(() => {
    if (asset() === "" || (!all() && quantity().trim() === "")) {
      return undefined;
    }
    const typed = all() ? undefined : parseDecimalInput(quantity());
    if (typed !== undefined && !typed.ok) {
      return { ok: false as const, error: { code: "invalid_number", message: typed.message } };
    }
    return attempt(() =>
      saleView(
        simulateSale(props.state, props.events, {
          asset_id: asset(),
          ...(typed?.ok === true ? { quantity: Quantity.parse(typed.value) } : {}),
          date: props.date,
          settings: props.settings,
          ...(props.external === undefined ? {} : { external: props.external }),
        }),
        nameIndex(props.state),
      ),
    );
  });
  const view = () => {
    const outcome = result();
    return outcome?.ok === true ? outcome.value : undefined;
  };
  const failure = () => {
    const outcome = result();
    return outcome?.ok === false ? outcome.error : undefined;
  };

  return (
    <Section title="¿Y si vendo?" class="span-12" aside={<Tag>nada registrado</Tag>}>
      <p class="card-note">
        Elige qué venderías y Atlas te dice qué lotes salen (los más antiguos primero, en todas tus
        cuentas), cuánto ganarías o perderías y cuánto subiría tu cuota estimada del año, al último
        precio que conoce. Es una simulación: la orden se da a mano y se registra después.
      </p>
      <div class="fieldset">
        <SelectField
          id="sale-asset"
          label="Activo"
          value={asset()}
          placeholder="Elige lo que venderías"
          options={options()}
          onInput={setAsset}
        />
        <Show when={!all()}>
          <Field
            id="sale-qty"
            kind="decimal"
            label="Cantidad"
            value={quantity()}
            onInput={setQuantity}
          />
        </Show>
        <Switch id="sale-all" label="Vender toda la posición" checked={all()} onChange={setAll} />
      </div>

      <Show when={failure()}>
        {(error) => <ErrorView error={error()} title="No se puede simular esa venta" />}
      </Show>

      <Show when={view()}>
        {(sale) => (
          <>
            <p class="card-note">
              Venta de <Amount quantity={sale().quantity} /> de {sale().name}, valorada a{" "}
              <PriceDetail price={sale().price} withAge />.
            </p>
            <DataTable
              label="Órdenes de la venta, por cuenta"
              size="sm"
              rows={sale().orders}
              columns={ORDERS}
            />
            <DataTable
              label="Lotes que salen, del más antiguo al más reciente"
              size="sm"
              rows={sale().lots}
              columns={LOTS}
            />
            <StatLine label="Ganancia o pérdida de la venta">
              <Amount value={sale().gain_eur} coloured />
            </StatLine>
            <Show when={sale().deferred_eur}>
              {(deferred) => (
                <StatLine label="Pérdida que se aplaza por una compra reciente">
                  <Amount value={deferred()} />
                </StatLine>
              )}
            </Show>
            <Show when={sale().tax_eur}>
              {(tax) => (
                <StatLine label="Sube tu cuota estimada en">
                  <Amount value={tax()} />
                </StatLine>
              )}
            </Show>
            <Show when={sale().saving_eur}>
              {(saving) => (
                <StatLine label="Reduce tu cuota estimada en">
                  <Amount value={saving()} />
                </StatLine>
              )}
            </Show>
            <Show when={sale().tax_eur === undefined && sale().saving_eur === undefined}>
              <p class="card-note">No cambia tu cuota estimada del año.</p>
            </Show>
            <Show when={sale().repurchase_until}>
              {(until) => (
                <Notice
                  severity="caution"
                  title={`Ventana de recompra abierta hasta el ${until()}`}
                >
                  Esta venta computa una pérdida, suya o aplazada de antes. Si compras {sale().name}{" "}
                  hasta esa fecha (incluida), en cualquier cuenta, esa pérdida no cuenta este año:
                  se aplaza (no se pierde) hasta que vendas lo recomprado.
                </Notice>
              )}
            </Show>
            <Show when={sale().deferral_until}>
              {(until) => (
                <p class="card-note">
                  Una compra de los últimos meses ya aplaza parte de la pérdida; su ventana acaba el{" "}
                  {until()}.
                </p>
              )}
            </Show>
          </>
        )}
      </Show>
    </Section>
  );
};
