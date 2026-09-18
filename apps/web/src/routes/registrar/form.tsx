// "¿Queda bien antes de escribirlo?" — the form of one event type.

import { A, useParams } from "@solidjs/router";
import { type JSX, Show } from "solid-js";
import { EmptyState } from "../../components/index.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { formSpec } from "../../view-models/forms/index.js";
import { RequireLedger } from "../guard.jsx";
import { EventForm } from "./EventForm.jsx";

export default function RegistrarFormRoute(): JSX.Element {
  const params = useParams<{ tipo: string }>();
  return (
    <RequireLedger writes skeleton={8}>
      {(snapshot) => {
        const spec = () => formSpec(params.tipo);
        return (
          <Show
            when={spec() !== undefined}
            fallback={
              <>
                <PageHeader title="Registrar" />
                <EmptyState what={`No hay ningún formulario para "${params.tipo}".`}>
                  <A href="/registrar">Ver qué se puede registrar</A>
                </EmptyState>
              </>
            }
          >
            <PageHeader
              title={(spec() as NonNullable<ReturnType<typeof spec>>).title}
              lead={(spec() as NonNullable<ReturnType<typeof spec>>).when}
            />
            <EventForm
              spec={spec() as NonNullable<ReturnType<typeof spec>>}
              state={snapshot.state}
            />
          </Show>
        );
      }}
    </RequireLedger>
  );
}
