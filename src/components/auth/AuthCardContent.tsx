"use client";

import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { useEffect, useRef } from "react";
import { FacebookIcon, GoogleIcon } from "../icons/icons";
import Input from "../ui/Input";
import { Button } from "../ui/Button";

export default function AuthCardContent() {
  const { panel, switchPanel, close } = useAuthModal();
  const { logIn } = useAuth();
  const cardRef = useRef<HTMLDivElement>(null);
  const loginRef = useRef<HTMLDivElement>(null);
  const signupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = panel === "login" ? loginRef.current : signupRef.current;
    if (target && cardRef.current) {
      cardRef.current.style.height = `${target.scrollHeight}px`;
    }
  }, [panel]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    logIn();
    close();
  }

  return (
    <div
      ref={cardRef}
      className="relative w-full overflow-hidden rounded-card border border-black/5 bg-surface shadow-xl transition-[height] duration-[400ms] ease-in-out"
    >
      <div
        className="flex w-[200%] transition-transform duration-[400ms] ease-in-out"
        style={{
          transform: panel === "signup" ? "translateX(-50%)" : "translateX(0)",
        }}
      >
        <div ref={loginRef} className="box-border w-1/2 shrink-0 p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
            Welcome back
          </p>
          <h1 className="mt-1 text-2xl font-bold">Log in to Sansaaric Stay</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Pick up Where you left off
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

            <Divider />
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                id="login-email"
                label="Email or Phone"
                type="text"
                placeholder="you@example.com"
                required
              />
              <Input
                id="login-password"
                label="Password"
                type="password"
                placeholder=".........."
                required
              />
              <div className="flex items-center justify-between text-xs text-ink-soft">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" className="h-3.5 w-3.5" /> Keep me
                  signed in
                </label>
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="font-semibold text-brand-600"
                >
                  Forget Password?
                </a>
              </div>
              <Button type="submit" fullWidth>
                Log in
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
        </div>

        <div ref={signupRef} className="box-border w-1/2 shrink-0 p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
            {" "}
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
            <Divider />

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                id="signup-name"
                label="Full name"
                placeholder="Prayag karki"
                required
              />
              <Input
                id="signup-email"
                label="Email or Phone"
                type="text"
                placeholder="you@example.com"
                required
              />
              <Input
                id="signup-password"
                label="password"
                type="password"
                placeholder="......."
                required
              />
              <label className="flex items-start gap-1.5 text-xs text-ink-soft">
                <input
                  type="checkbox"
                  required
                  className="mt-0.5 h-3.5 w-3.5"
                />
                I agree to the terms &amp; privacy policy
              </label>
              <Button type="submit" fullWidth>
                {" "}
                Create account
              </Button>
            </form>

            <p className="mt-5 text-center text-sm text-ink-soft">
              Already have an account?{" "}
              <button
                onClick={() => switchPanel("login")}
                className="font-semibold text-brand-600"
              >
                log in
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

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
      className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-black/10 bg-surface py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-bg"
    >
      {icon}
      {label}
    </button>
  );
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-ink-soft">
      <span className="h-px flex-1 bg-black/10" />
      or
      <span className="h-px flex-1 bg-black/10" />
    </div>
  );
}
