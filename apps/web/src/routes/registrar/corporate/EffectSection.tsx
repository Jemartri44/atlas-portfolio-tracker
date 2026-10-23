import type { EventPreview } from "@atlas/domain";
import type { ClosedYearImpact } from "@atlas/domain/fiscal";
import type { JSX } from "solid-js";
import { ClosedYearNotice, Notice } from "../../../components/index.js";
import type { NameIndex } from "../../../format/names.js";
import { FormActions } from "../FormActions.jsx";
import { Preview } from "../Preview.jsx";

/** What a corporate action does, said before «Registrar», with its way back and its way on. */
export const EffectSection = (props: {
  preview: EventPreview;
  names: NameIndex;
  closed: readonly ClosedYearImpact[];
  problem: string | undefined;
  writing: boolean;
  onBack: () => void;
  onConfirm: () => void;
}): JSX.Element => (
  <section class="effect" aria-label="El efecto">
    <Preview preview={props.preview} names={props.names} />
    <ClosedYearNotice impacts={props.closed} />
    <Notice severity="info" title="Guarda el documento">
      Copia la nota del emisor a tu carpeta de documentos: tus datos guardan la referencia, no el
      archivo.
    </Notice>
    <FormActions problem={props.problem}>
      <button type="button" class="secondary" onClick={props.onBack}>
        Volver a los datos
      </button>
      <button type="button" disabled={props.writing} onClick={props.onConfirm}>
        Registrar
      </button>
    </FormActions>
  </section>
);
