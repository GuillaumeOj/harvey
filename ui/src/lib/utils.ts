import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import { font, radius, shadow, text } from "../../../brand/tokens.json";

// Theme names come from brand/tokens.json, so a new token merges correctly without touching this file.
const twMerge = extendTailwindMerge<"text-style">({
  extend: {
    theme: {
      radius: Object.keys(radius),
      shadow: Object.keys(shadow),
      font: Object.keys(font),
    },
    classGroups: {
      // Text-style utilities (globals.css) set font, size, line height, weight and tracking at once.
      "text-style": Object.keys(text),
    },
    conflictingClassGroups: {
      "text-style": ["font-family", "font-size", "leading", "font-weight", "tracking", "text-transform"],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
