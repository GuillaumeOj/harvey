import type { AppError } from "@/bindings";

/** Minimal French copy per `AppError` kind. Moves into the i18n catalog with #40. */
export const errorMessages: Record<`error.${AppError["kind"]}`, string> = {
  "error.not_found": "Élément introuvable.",
  "error.validation": "Certaines informations ne sont pas valides.",
  "error.conflict": "Cet élément a été modifié entre-temps.",
  "error.permission_denied": "Accès refusé.",
  "error.calendar_unavailable": "Le calendrier n’est pas accessible.",
  "error.maintenance": "Harvey est en maintenance. Réessayez dans un instant.",
  "error.schema_mismatch": "Ouvrez Harvey pour mettre à jour.",
  "error.storage": "L’enregistrement a échoué. Réessayez.",
  "error.internal": "Une erreur inattendue est survenue.",
};

/** True when `value` is a well-formed `AppError` (an object whose `kind` is a known variant). */
export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    typeof value.kind === "string" &&
    Object.hasOwn(errorMessages, `error.${value.kind}`)
  );
}

export function messageFor(error: AppError): string {
  return errorMessages[`error.${error.kind}`];
}
