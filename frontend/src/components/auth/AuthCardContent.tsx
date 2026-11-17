"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import PasswordInput from "@/components/ui/PasswordInput";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { AuthError, requestPasswordReset } from "@/lib/auth";
import {
  getPasswordError,
  isValidEmail,
  MIN_PASSWORD_LEN,
} from "@/lib/validation";
import { GoogleIcon } from "../icons/icons";

const PANEL_INDEX = { login: 0, signup: 1, verify: 2, forgot: 3 } as const;
const CODE_RE = /^\d{6}$/;
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * The card itself — four sliding panels (login / signup / confirm email / forgot
 * password), each stacked vertically as [ some info ] on top of [ form ] below. Fully
 * driven by useAuthModal(): which panel is showing, and closing on a
 * successful submit, both come from that shared context rather than
 * local state or the URL — there's only ever one of these on screen,
 * rendered by AuthModalHost.
 *
 * Client-side validation (email format, 8-char password minimum) runs
 * before calling useAuth().login()/signup(), which are real async
 * calls now (lib/auth.ts) — a fake delay today, a real Django request
 * later. Both are awaited with a "Logging in…" pending state and a
 * catch block, so once real auth exists and can actually reject (wrong
 * password, taken email), that error already has somewhere to show up.
 */
export function AuthCardContent() {
  const { panel, switchPanel, close } = useAuthModal();
  const { login, signup, verifySignup, resendSignupCode } = useAuth();
  const cardRef = useRef<HTMLDivElement>(null);
  const loginRef = useRef<HTMLDivElement>(null);
  const signupRef = useRef<HTMLDivElement>(null);
  const verifyRef = useRef<HTMLDivElement>(null);
  const forgotRef = useRef<HTMLDivElement>(null);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginPending, setLoginPending] = useState(false);

  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [signupError, setSignupError] = useState("");
  const [signupPending, setSignupPending] = useState(false);

  const [verifyEmail, setVerifyEmail] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [verifyNotice, setVerifyNotice] = useState("");
  const [verifyPending, setVerifyPending] = useState(false);
  const [verifyResending, setVerifyResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotSent, setForgotSent] = useState("");
  const [forgotDevLink, setForgotDevLink] = useState("");
  const [forgotPending, setForgotPending] = useState(false);

  // The card is a 4-wide track; each panel is one quarter of it. Moving by one
  // panel means shifting the track by a quarter of its own width.
  const panelIndex = PANEL_INDEX[panel];

  const activePanel = useCallback(() => {
    if (panel === "signup") return signupRef.current;
    if (panel === "verify") return verifyRef.current;
    if (panel === "forgot") return forgotRef.current;
    return loginRef.current;
  }, [panel]);

  // Counts down after a resend so the button cannot spam the mail server.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(
      () => setResendCooldown((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  // Keep the card exactly as tall as the visible panel. A ResizeObserver also
  // catches text wrapping on small screens, errors appearing, and window resizes.
  useEffect(() => {
    const target = activePanel();
    const card = cardRef.current;
    if (!target || !card) return;
    const sync = () => {
      card.style.height = `${target.offsetHeight}px`;
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(target);
    return () => observer.disconnect();
  }, [activePanel]);

  // After switching panels, move focus into the new panel. The button that was
  // clicked is now inside the hidden panel, so without this focus would be lost.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    activePanel()?.querySelector<HTMLElement>("input")?.focus({ preventScroll: true });
  }, [activePanel]);

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidEmail(loginEmail)) {
      setLoginError("Enter a valid email address.");
      return;
    }
    setLoginError("");
    setLoginPending(true);
    try {
      await login(loginEmail, loginPassword);
      close();
    } catch (err) {
      // Correct password but the signup code was never confirmed: take the
      // user straight to the code panel instead of a dead end.
      if (err instanceof AuthError && err.code === "email_not_verified") {
        setVerifyEmail(loginEmail.trim());
        setVerifyCode("");
        setVerifyError("");
        setVerifyNotice(err.message);
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
        switchPanel("verify");
        return;
      }
      setLoginError(
        err instanceof Error ? err.message : "Couldn't log in. Try again.",
      );
    } finally {
      setLoginPending(false);
    }
  }

  async function handleSignupSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (signupName.trim().length < 2) {
      setSignupError("Enter your full name.");
      return;
    }
    if (!isValidEmail(signupEmail)) {
      setSignupError("Enter a valid email address.");
      return;
    }
    const passwordError = getPasswordError(signupPassword);
    if (passwordError) {
      setSignupError(passwordError);
      return;
    }
    if (!agreedToTerms) {
      setSignupError(
        "You need to agree to the terms & privacy policy to continue.",
      );
      return;
    }
    setSignupError("");
    setSignupPending(true);
    try {
      const result = await signup(signupName, signupEmail, signupPassword);
      if (result.requiresVerification) {
        setVerifyEmail(result.email);
        setVerifyCode("");
        setVerifyError("");
        setVerifyNotice(result.message);
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
        switchPanel("verify");
        return;
      }
      close();
    } catch (err) {
      setSignupError(
        err instanceof Error
          ? err.message
          : "Couldn't create your account. Try again.",
      );
    } finally {
      setSignupPending(false);
    }
  }

  async function handleVerifySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidEmail(verifyEmail)) {
      setVerifyError("Enter a valid email address.");
      return;
    }
    if (!CODE_RE.test(verifyCode.trim())) {
      setVerifyError("Enter the 6-digit code from the email.");
      return;
    }
    setVerifyError("");
    setVerifyPending(true);
    try {
      await verifySignup(verifyEmail.trim(), verifyCode.trim());
      close();
    } catch (err) {
      setVerifyError(
        err instanceof Error
          ? err.message
          : "Couldn't confirm that code. Try again.",
      );
    } finally {
      setVerifyPending(false);
    }
  }

  async function handleResendCode() {
    if (!isValidEmail(verifyEmail)) {
      setVerifyError("Enter the email you signed up with.");
      return;
    }
    setVerifyError("");
    setVerifyResending(true);
    try {
      const detail = await resendSignupCode(verifyEmail.trim());
      setVerifyNotice(detail);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setVerifyError(
        err instanceof Error ? err.message : "Couldn't resend the code. Try again.",
      );
    } finally {
      setVerifyResending(false);
    }
  }

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidEmail(forgotEmail)) {
      setForgotError("Enter a valid email address.");
      return;
    }
    setForgotError("");
    setForgotSent("");
    setForgotDevLink("");
    setForgotPending(true);
    try {
      const result = await requestPasswordReset(forgotEmail);
      setForgotSent(result.detail);
      // Only returned by the backend in DEBUG, so resetting can be tried
      // without an SMTP server; it is never present in production.
      setForgotDevLink(result.resetUrl ?? "");
    } catch (err) {
      setForgotError(
        err instanceof Error
          ? err.message
          : "Couldn't send the reset link. Try again.",
      );
    } finally {
      setForgotPending(false);
    }
  }

  return (
    <div
      ref={cardRef}
      className="relative w-full overflow-hidden rounded-card border border-border/10 bg-surface shadow-xl transition-[height] duration-[400ms] ease-in-out motion-reduce:transition-none"
    >
      <div
        className="flex w-[400%] items-start transition-transform duration-[400ms] ease-in-out will-change-transform motion-reduce:transition-none"
        style={{
          transform: `translateX(-${panelIndex * 25}%)`,
        }}
      >
        {/* LOGIN PANEL — info block on top, form below */}
        <div
          ref={loginRef}
          inert={panel !== "login"}
          aria-hidden={panel !== "login"}
          className="box-border w-1/4 shrink-0 p-6 sm:p-8"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
            Welcome back
          </p>
          <h1 className="mt-1 text-2xl font-bold">Log in to Sansaaric Stay</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Pick up where you left off — your saved stays and bookings are
            waiting.
          </p>

          <div className="mt-5 space-y-2.5">
            <SocialButton
              icon={<GoogleIcon className="h-4 w-4" />}
              label="Continue with Google"
            />
          </div>
          <Divider />

          <form onSubmit={handleLoginSubmit} className="space-y-4" noValidate>
            <Input
              id="login-email"
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              required
            />
            <PasswordInput
              id="login-password"
              label="Password"
              placeholder="••••••••"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              required
            />
            {loginError && (
              <p className="text-xs font-medium text-red-600">{loginError}</p>
            )}
            <div className="flex items-center justify-between text-xs text-ink-soft">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" className="h-3.5 w-3.5" /> Keep me signed
                in
              </label>
              <button
                type="button"
                onClick={() => {
                  setForgotEmail(loginEmail);
                  setForgotError("");
                  setForgotSent("");
                  setForgotDevLink("");
                  switchPanel("forgot");
                }}
                className="font-semibold text-brand-600"
              >
                Forgot password?
              </button>
            </div>
            <Button type="submit" fullWidth disabled={loginPending}>
              {loginPending ? "Logging in…" : "Log in"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-ink-soft">
            New to Sansaaric Stay?{" "}
            <button
              onClick={() => switchPanel("signup")}
              className="font-semibold text-brand-600"
            >
              Create an account
            </button>
          </p>
        </div>

        {/* SIGNUP PANEL — info block on top, form below */}
        <div
          ref={signupRef}
          inert={panel !== "signup"}
          aria-hidden={panel !== "signup"}
          className="box-border w-1/4 shrink-0 p-6 sm:p-8"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
            Get started
          </p>
          <h1 className="mt-1 text-2xl font-bold">Create your account</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Book, save favorites, and leave reviews after your stay.
          </p>

          <div className="mt-5 space-y-2.5">
            <SocialButton
              icon={<GoogleIcon className="h-4 w-4" />}
              label="Continue with Google"
            />
          </div>
          <Divider />

          <form onSubmit={handleSignupSubmit} className="space-y-4" noValidate>
            <Input
              id="signup-name"
              label="Full name"
              placeholder="Anita Sharma"
              value={signupName}
              onChange={(e) => setSignupName(e.target.value)}
              required
            />
            <Input
              id="signup-email"
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={signupEmail}
              onChange={(e) => setSignupEmail(e.target.value)}
              required
            />
            <PasswordInput
              id="signup-password"
              label={`Password (min. ${MIN_PASSWORD_LEN} chars, letters + numbers)`}
              placeholder="••••••••"
              value={signupPassword}
              onChange={(e) => setSignupPassword(e.target.value)}
              required
            />
            {signupError && (
              <p className="text-xs font-medium text-red-600">{signupError}</p>
            )}
            <label className="flex items-start gap-1.5 text-xs text-ink-soft">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5"
              />
              I agree to the terms &amp; privacy policy
            </label>
            <Button type="submit" fullWidth disabled={signupPending}>
              {signupPending ? "Creating account…" : "Create account"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-ink-soft">
            Already have an account?{" "}
            <button
              onClick={() => switchPanel("login")}
              className="font-semibold text-brand-600"
            >
              Log in
            </button>
          </p>
        </div>

        {/* EMAIL CONFIRMATION PANEL */}
        <div
          ref={verifyRef}
          inert={panel !== "verify"}
          aria-hidden={panel !== "verify"}
          className="box-border w-1/4 shrink-0 p-6 sm:p-8"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
            One last step
          </p>
          <h1 className="mt-1 text-2xl font-bold">Confirm your email</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Enter the 6-digit code we emailed you to activate your account.
            Check your spam folder if it hasn&apos;t arrived within a minute.
          </p>

          <form onSubmit={handleVerifySubmit} className="mt-6 space-y-4" noValidate>
            <Input
              id="verify-email"
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={verifyEmail}
              onChange={(e) => setVerifyEmail(e.target.value)}
              required
            />
            <Input
              id="verify-code"
              label="Confirmation code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              className="tracking-[0.4em]"
              value={verifyCode}
              onChange={(e) =>
                setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              required
            />
            {verifyError && (
              <p className="text-xs font-medium text-red-600">{verifyError}</p>
            )}
            {verifyNotice && !verifyError && (
              <p className="text-xs font-medium text-emerald-600">{verifyNotice}</p>
            )}
            <Button type="submit" fullWidth disabled={verifyPending}>
              {verifyPending ? "Confirming…" : "Confirm email"}
            </Button>
          </form>

          <div className="mt-4 flex flex-col items-center gap-1 text-xs text-ink-soft">
            <button
              type="button"
              onClick={handleResendCode}
              disabled={verifyResending || resendCooldown > 0}
              className="font-semibold text-brand-600 disabled:cursor-default disabled:text-ink-soft"
            >
              {verifyResending
                ? "Sending…"
                : resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : "Resend code"}
            </button>
            <button
              type="button"
              onClick={() => switchPanel("login")}
              className="font-semibold text-ink-soft"
            >
              Back to log in
            </button>
          </div>
        </div>

        {/* FORGOT PASSWORD PANEL */}
        <div
          ref={forgotRef}
          inert={panel !== "forgot"}
          aria-hidden={panel !== "forgot"}
          className="box-border w-1/4 shrink-0 p-6 sm:p-8"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
            Password help
          </p>
          <h1 className="mt-1 text-2xl font-bold">Reset your password</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Enter the email on your account and we&apos;ll send you a link to
            choose a new password.
          </p>

          <form onSubmit={handleForgotSubmit} className="mt-6 space-y-4" noValidate>
            <Input
              id="forgot-email"
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              required
            />
            {forgotError && (
              <p className="text-xs font-medium text-red-600">{forgotError}</p>
            )}
            {forgotSent && (
              <p className="text-xs font-medium text-emerald-600">{forgotSent}</p>
            )}
            {forgotDevLink && (
              <p className="text-xs text-ink-soft">
                Dev mode:{" "}
                <a
                  href={forgotDevLink}
                  className="font-semibold break-all text-brand-600"
                >
                  open the reset link
                </a>
              </p>
            )}
            <Button type="submit" fullWidth disabled={forgotPending}>
              {forgotPending ? "Sending…" : "Send reset link"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-ink-soft">
            Remembered it?{" "}
            <button
              onClick={() => switchPanel("login")}
              className="font-semibold text-brand-600"
            >
              Back to log in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default AuthCardContent;

function SocialButton({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-surface py-2.5 text-sm font-semibold text-ink shadow-sm transition-colors hover:border-brand-500/40 hover:bg-bg"
    >
      {icon}
      {label}
    </button>
  );
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-ink-soft">
      <span className="h-px flex-1 bg-ink/10" />
      or
      <span className="h-px flex-1 bg-ink/10" />
    </div>
  );
}
