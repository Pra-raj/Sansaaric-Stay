import type { InputHTMLAttributes, ReactNode } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: boolean;
  /** Rendered inside the field on the right (e.g. a show/hide password button). */
  trailing?: ReactNode;
}

function Input({
  label,
  id,
  className = "",
  error,
  trailing,
  ...props
}: InputProps) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-xs font-semibold uppercase tracking-wide text-ink-soft"
      >
        {label}
      </label>
      <div className="relative min-w-0">
        <input
          id={id}
          className={[
            "w-full min-w-0 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-ink outline-none",
            trailing ? "pr-11" : "",
            error
              ? "border-red-500 focus:border-red-500"
              : "focus:border-brand-500",
            className,
          ].join(" ")}
          {...props}
        />
        {trailing && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-1.5">
            {trailing}
          </div>
        )}
      </div>
    </div>
  );
}

export default Input;
