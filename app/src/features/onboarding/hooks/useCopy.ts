import { useCallback, useState } from "react";

/**
 * HOOKS -- copy-to-clipboard with a self-resetting "Copied" state.
 *
 * Shared by onboarding and the manage screen, both of which surface the
 * gateway endpoint and token.
 */
export function useCopy(resetAfterMs = 1800) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(
    async (value: string) => {
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        // Clipboard API needs a secure context; fall back to a temp textarea.
        const area = document.createElement("textarea");
        area.value = value;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }

      setCopied(true);
      window.setTimeout(() => setCopied(false), resetAfterMs);
    },
    [resetAfterMs],
  );

  return { copied, copy };
}
