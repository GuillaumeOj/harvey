import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** Text-style utilities from globals.css; each sets font, size, line height, weight and tracking. */
export const TEXT_STYLES = [
  "titre-page",
  "titre-section",
  "titre-carte",
  "corps",
  "corps-fort",
  "legende",
  "note-titre",
  "note-corps",
  "mono",
  "mono-petit",
] as const;

const twMerge = extendTailwindMerge<"text-style">({
  extend: {
    theme: {
      radius: ["petit", "moyen", "grand"],
      shadow: ["flottant"],
      font: ["ui", "lecture", "mono"],
    },
    classGroups: {
      "text-style": [...TEXT_STYLES],
    },
    conflictingClassGroups: {
      "text-style": ["font-family", "font-size", "leading", "font-weight", "tracking", "text-transform"],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
