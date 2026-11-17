"use client";

import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Modal({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);
  // Keep the latest onClose without re-running the effect below. Without this,
  // every panel switch (login <-> signup) re-created `onClose`, which re-ran
  // the effect and yanked focus back to the page behind the modal.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    triggerRef.current = document.activeElement;

    // Only elements the user can actually reach (skips the off-screen panel).
    function visibleFocusable(): HTMLElement[] {
      if (!containerRef.current) return [];
      return Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => !el.closest("[inert]") && !el.hasAttribute("disabled"));
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = visibleFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    // Focus the first form field (not the close button) once the modal is up.
    const firstField = visibleFocusable().find((el) => el.tagName === "INPUT");
    (firstField ?? visibleFocusable()[0])?.focus({ preventScroll: true });

    // Stop the page behind the modal from scrolling while it is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus();
    };
  }, []);

  return (
    <div
      className="anim-fade-in fixed inset-0 z-50 flex overflow-y-auto bg-ink/50 px-4 py-8 backdrop-blur-sm"
      onClick={() => onCloseRef.current()}
      role="presentation"
    >
      <div
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="anim-pop-in relative m-auto w-full max-w-[420px]"
      >
        <button
          onClick={() => onCloseRef.current()}
          aria-label="Close"
          className="absolute -top-3 -right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white text-ink shadow-md transition-transform hover:scale-105 motion-reduce:transition-none"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
