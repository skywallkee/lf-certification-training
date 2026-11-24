import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full min-h-11 rounded-md border border-input bg-card px-3 text-[15px] text-foreground placeholder:text-muted-foreground disabled:opacity-50";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(control, "pr-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 py-2", className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium", className)} {...props} />;
}

export function FieldHint({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function FieldError({ className, ...props }: ComponentProps<"p">) {
  return <p role="alert" className={cn("text-sm font-medium text-destructive", className)} {...props} />;
}
