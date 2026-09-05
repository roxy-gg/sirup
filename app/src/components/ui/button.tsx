import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  // Linear's buttons are slightly tighter and lighter than shadcn's defaults:
  // text-mini rather than text-sm, medium weight (510) rather than 500, and a
  // fast transition so the hover state feels immediate rather than laggy.
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md text-mini font-medium whitespace-nowrap outline-none transition-[background-color,border-color,color,box-shadow,opacity] duration-[var(--duration-quick)] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // The inverted chip: dark on light, light on dark.
        default:
          "bg-primary text-primary-foreground shadow-[inset_0_var(--border-hairline)_0_#ffffff26] hover:opacity-90",
        destructive:
          "bg-destructive text-destructive-foreground hover:opacity-90 focus-visible:ring-ring/40",
        outline:
          "surface-flat bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost:
          "text-text-secondary hover:bg-accent hover:text-accent-foreground",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        // 32px is Linear's standard control height -- noticeably tighter than
        // the 36px shadcn default, which is what makes their UI feel dense.
        default: "h-8 px-3 has-[>svg]:px-2.5",
        xs: "h-6 gap-1 rounded-sm px-2 text-tiny has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1.5 rounded-sm px-2.5 has-[>svg]:px-2",
        lg: "h-9 rounded-lg px-4 text-small has-[>svg]:px-3.5",
        icon: "size-8",
        "icon-xs": "size-6 rounded-sm [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
