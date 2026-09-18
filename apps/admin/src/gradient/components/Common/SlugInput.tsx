import React from "react";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import { Loader2, Check, X } from "lucide-react";
import { useSlugAvailability } from "@/gradient/hooks/useSlugAvailability";

interface SlugInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  initialSlug?: string;
  checkService: (slug: string) => Promise<any>;
  error?: string;
  onAvailabilityChange?: (available: boolean | null) => void;
}

export const SlugInput = React.forwardRef<HTMLInputElement, SlugInputProps>(
  (
    {
      label = "Slug",
      initialSlug,
      checkService,
      error,
      onAvailabilityChange,
      value,
      onChange,
      className,
      ...props
    },
    ref
  ) => {
    const slug = typeof value === "string" ? value : "";
    const { slugAvailable, checkingSlug } = useSlugAvailability(
      slug,
      checkService,
      initialSlug
    );

    // Sync availability state to parent if needed
    React.useEffect(() => {
      onAvailabilityChange?.(slugAvailable);
    }, [slugAvailable, onAvailabilityChange]);

    return (
      <div className="space-y-2">
        <Label htmlFor={props.id || "slug"}>{label}</Label>
        <div className="relative">
          <Input
            ref={ref}
            id={props.id || "slug"}
            value={value}
            onChange={onChange}
            className={`
              ${
                slugAvailable === false
                  ? "border-red-500 focus-visible:ring-red-500 pr-10"
                  : slugAvailable === true
                    ? "border-green-500 focus-visible:ring-green-500 pr-10"
                    : "pr-10"
              }
              ${className}
            `}
            {...props}
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            {checkingSlug ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : slugAvailable === true ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : slugAvailable === false ? (
              <X className="w-4 h-4 text-red-500" />
            ) : null}
          </div>
        </div>
        {slugAvailable === false && (
          <p className="text-sm text-red-500">This slug is already taken.</p>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }
);

SlugInput.displayName = "SlugInput";
