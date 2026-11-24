import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** shadcn/ui Button, themed with the spec's tokens. Primary actions are 44px tall for touch. */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors duration-150 no-underline disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground",
        outline: "border border-input bg-card text-foreground hover:bg-muted hover:text-foreground",
        ghost: "text-foreground hover:bg-muted hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline px-0",
        destructive: "bg-destructive text-white hover:opacity-90 hover:text-white dark:text-background",
      },
      size: {
        default: "min-h-11 px-5 text-[15px]",
        sm: "min-h-9 px-3 text-sm",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
