import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // 32px to match the button height, and text-mini so a filled field
        // sits at the same optical weight as the label above it. 16px on
        // mobile prevents iOS from zooming on focus.
        "h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-base shadow-[var(--shadow-tiny)] transition-[color,box-shadow,border-color] duration-[var(--duration-quick)] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-mini file:font-medium file:text-foreground placeholder:text-text-quaternary disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-mini",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
