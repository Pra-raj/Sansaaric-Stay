"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import PasswordInput from "@/components/ui/PasswordInput";
import { confirmPasswordReset } from "@/lib/auth";
import { useAuthModal } from "@/lib/auth-modal-context";
import { getPasswordError, MIN_PASSWORD_LEN } from "@/lib/validation";

/**
 * Landing spot for the link in the reset email: /reset-password?uid=…&token=…
 * The uid/token are checked by Django on submit, so the page only needs to
 * validate the new password twice before sending it.
 */
export default function ResetPasswordForm({
  uid,
  token,
}: {
  uid: string;
  token: string;
}) {
  const { openLogin, openForgot } = useAuthModal();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const hasLink = Boolean(uid && token);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const passwordError = getPasswordError(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setError("The two passwords don't match.");
      return;
    }
    setError("");
    setPending(true);
    try {
      await confirmPasswordReset(uid, token, password);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't reset the password. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full rounded-card border border-border/10 bg-surface p-6 shadow-xl sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
        Password help
      </p>

      {!hasLink ? (
        <>
          <h1 className="mt-1 text-2xl font-bold">This link is incomplete</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            The reset link is missing its token. Request a new email and use the
            latest link — they expire after a short while.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button fullWidth onClick={openForgot}>
              Request a new link
            </Button>
            <Link
              href="/"
              className="text-center text-sm font-semibold text-ink-soft"
            >
              Back to home
            </Link>
          </div>
        </>
      ) : done ? (
        <>
          <h1 className="mt-1 text-2xl font-bold">Password updated</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            You can now log in with your new password.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button fullWidth onClick={openLogin}>
              Log in
            </Button>
            <Link
              href="/"
              className="text-center text-sm font-semibold text-ink-soft"
            >
              Back to home
            </Link>
          </div>
        </>
      ) : (
        <>
          <h1 className="mt-1 text-2xl font-bold">Choose a new password</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Use at least {MIN_PASSWORD_LEN} characters, including a letter and a
            number.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <PasswordInput
              id="reset-password"
              label="New password"
              placeholder="••••••••"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <PasswordInput
              id="reset-password-confirm"
              label="Confirm new password"
              placeholder="••••••••"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            {error && (
              <p className="text-xs font-medium text-red-600">{error}</p>
            )}
            <Button type="submit" fullWidth disabled={pending}>
              {pending ? "Updating…" : "Update password"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-ink-soft">
            <Link href="/" className="font-semibold text-brand-600">
              Back to home
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
