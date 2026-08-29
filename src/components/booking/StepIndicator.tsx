const steps = ["Trip details", "Guest Info", "Payment", "confirmation"];

export default function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2 text-xs font-semibold">
      {steps.map((step, i) => {
        const stepNumber = i + 1;
        const state =
          stepNumber < current
            ? "done"
            : stepNumber === current
              ? "now"
              : "upcomming";
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={[
                " flex h-6 w-6 items-center justify-center rounded-full",
                state === "done" && "bg-emerald-500 text-white",
                state === "now" && "bg-brand-500 text-white",
                state === "upcomming" && "bg-black/10 text-ink-soft",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {state === "done" ? "✓" : stepNumber}
            </span>

            <span
              className={state === "upcomming" ? "text-ink-soft" : "text-ink"}
            >
              {step}
            </span>
            {stepNumber < steps.length && (
              <span className="mx-1 h-px w-6 bg-black/10" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
