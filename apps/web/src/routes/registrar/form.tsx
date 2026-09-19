// "¿Queda bien antes de escribirlo?" — the form of one event type.

import { useParams } from "@solidjs/router";
import { type JSX, Show } from "solid-js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { formSpec } from "../../view-models/forms/index.js";
import { RequireLedger } from "../guard.jsx";
import { EventForm } from "./EventForm.jsx";
import { NoForm } from "./FormNotices.jsx";

export default function RegistrarFormRoute(): JSX.Element {
  const params = useParams<{ tipo: string }>();
  return (
    <RequireLedger writes skeleton={8}>
      {(snapshot) => {
        const spec = () => formSpec(params.tipo);
        return (
          <Show
            when={spec()}
            fallback={
              <NoForm title="Registrar" what={`No hay ningún formulario para "${params.tipo}".`} />
            }
          >
            {(found) => (
              <>
                <PageHeader title={found().title} lead={found().when} />
                <EventForm spec={found()} state={snapshot.state} />
              </>
            )}
          </Show>
        );
      }}
    </RequireLedger>
  );
}
