"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center">
      <p className="text-lg font-bold text-brand-600">Sansaaric Stay</p>
      <h1 className="mt-4 text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-soft">
        That&apos;s on us, not you. Try again, or head back to the homepage.
      </p>
      <div className="mt-6 flex gap-3">
        <button
          onClick={reset}
          className="rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full border border-border/10 px-5 py-2.5 text-sm font-semibold text-ink hover:bg-surface"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}