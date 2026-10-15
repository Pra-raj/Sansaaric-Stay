"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import {
  getPasswordError,
  isValidEmail,
  MIN_PASSWORD_LEN,
} from "@/lib/validation";
import { FacebookIcon, GoogleIcon } from "../icons/icons";

/**
 * The card itself — sliding login/signup panels, each stacked
 * vertically as [ some info ] on top of [ form ] below. Fully driven
 * by useAuthModal(): which panel is showing, and closing on a
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
  const { login, signup } = useAuth();
  const cardRef = useRef<HTMLDivElement>(null);
  const loginRef = useRef<HTMLDivElement>(null);
  const signupRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const target = panel === "login" ? loginRef.current : signupRef.current;
    if (target && cardRef.current) {
      cardRef.current.style.height = `${target.scrollHeight}px`;
    }
  }, [panel, loginError, signupError]);

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
      await signup(signupName, signupEmail, signupPassword);
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

  return (
    <div
      ref={cardRef}
      className="relative w-full overflow-hidden rounded-card border border-border/10 bg-surface shadow-xl transition-[height] duration-[400ms] ease-in-out"
    >
      <div
        className="flex w-[200%] transition-transform duration-[400ms] ease-in-out"
        style={{
          transform: panel === "signup" ? "translateX(-50%)" : "translateX(0)",
        }}
      >
        {/* LOGIN PANEL — info block on top, form below */}
        <div ref={loginRef} className="box-border w-1/2 shrink-0 p-8">
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
            <SocialButton
              icon={<FacebookIcon className="h-4 w-4" />}
              label="Continue with Facebook"
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
            <Input
              id="login-password"
              label="Password"
              type="password"
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
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="font-semibold text-brand-600"
              >
                Forgot password?
              </a>
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
        <div ref={signupRef} className="box-border w-1/2 shrink-0 p-8">
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
            <SocialButton
              icon={<FacebookIcon className="h-4 w-4" />}
              label="Continue with Facebook"
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
            <Input
              id="signup-password"
              label={`Password (min. ${MIN_PASSWORD_LEN} chars, letters + numbers)`}
              type="password"
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
