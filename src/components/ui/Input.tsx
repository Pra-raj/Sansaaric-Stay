import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

function Input({ label, id, className = "", ...props }: InputProps) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-xs font-semibold uppercase tracking-wide text-ink-soft"
      >
        {label}
      </label>
      <input
        id={id}
        className={[
          "w-full min-w-0 rounded-lg border border-black/10 bg-surface px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand-500",
          className,
        ].join("")}
        {...props}
      />
    </div>
  );
}

export default Input;
