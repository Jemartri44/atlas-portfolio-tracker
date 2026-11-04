// @vitest-environment happy-dom
//
// The ledger is read again while the rebalance planner is still loading: the
// press belongs to the ledger it started on, so nothing is shown for it. The
// planner arrives only when the test lets it, which fixes the order.

import { expect, it, vi } from "vitest";
import Cartera from "../src/routes/cartera/index.jsx";
import { openLedger, press, show, text, withGoldenLedger } from "./helpers/render.jsx";

const arrival = vi.hoisted(() => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { gate, release: () => release() };
});

vi.mock("@atlas/domain/rebalance", async (importActual) => {
  await arrival.gate;
  return importActual();
});

withGoldenLedger();

it("shows no proposal for a press that started before the ledger was read again", async () => {
  const host = await show("/cartera?fecha=2029-01-10", Cartera);
  await press(host, "Calcular rebalanceo");
  expect(text(host.querySelector("button:disabled"))).toBe("Calculando…");
  await openLedger(undefined, true);

  arrival.release();
  await vi.waitFor(() => expect(host.querySelector("button:disabled")).toBeNull());
  expect(host.querySelector("[aria-label='Desviación de cada activo']")).toBeNull();
});
