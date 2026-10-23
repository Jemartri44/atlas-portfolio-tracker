import type { JSX } from "solid-js";
import { ErrorView, Section } from "../../components/index.js";
import type { AppError } from "../../ledger/state.js";

/** A part of the screen that could not be calculated: its reason, in its place and in Spanish. */
export const PartFailed = (props: {
  title: string;
  error: AppError;
  half?: boolean;
}): JSX.Element => (
  <Section title={props.title} class={props.half === true ? "span-6" : "span-12"}>
    <ErrorView error={props.error} title="No se ha podido calcular esta parte" />
  </Section>
);
