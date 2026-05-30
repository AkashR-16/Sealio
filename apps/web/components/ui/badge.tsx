import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-brand/30 bg-brand-muted text-brand",
        completed: "border-success/30 bg-success/10 text-success",
        pending: "border-warning/30 bg-warning/10 text-warning",
        draft: "border-foreground-subtle bg-border text-foreground-muted",
        declined: "border-error/30 bg-error/10 text-error",
        sent: "border-info/30 bg-info/10 text-info",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
