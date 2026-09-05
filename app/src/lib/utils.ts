import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge, taught about our custom type scale.
 *
 * Our theme adds font sizes named after Linear's scale -- tiny, micro, mini,
 * small, regular, large. tailwind-merge does not know those are sizes, so it
 * filed `text-small` under the same group as `text-primary-foreground` and
 * dropped the colour when both appeared. That is what rendered the hero CTA as
 * white text on a white button.
 *
 * Declaring them as font-size explicitly puts each in the right conflict
 * group, so a size and a colour can coexist on one element.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["tiny", "micro", "mini", "small", "regular", "large"] },
      ],
    },
  },
});

/** Merges conditional class names, with later Tailwind utilities winning. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
