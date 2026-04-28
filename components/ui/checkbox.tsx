"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({ className, checked, onChange, ...props }, ref) => {
  return (
    <label className={cn("relative inline-flex h-4 w-4 cursor-pointer items-center justify-center", className)}>
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="peer absolute inset-0 h-4 w-4 cursor-pointer appearance-none rounded-sm border border-primary shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 checked:bg-primary"
        {...props}
      />
      <Check className="pointer-events-none h-3 w-3 text-primary-foreground opacity-0 peer-checked:opacity-100" />
    </label>
  );
});
Checkbox.displayName = "Checkbox";

export { Checkbox };
