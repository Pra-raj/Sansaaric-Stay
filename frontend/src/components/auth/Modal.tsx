"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function Modal({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) { 
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);
useEffect(() => {
  triggerRef.current = document.activeElement;

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key !== "Tab" || !containerRef.current) return;
     const focusable = containerRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if(e.shiftKey && document.activeElement === first) {
       e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  document.addEventListener("keydown", onKeyDown);
  containerRef.current?.querySelector<HTMLElement>("input, button")?.focus();
  return () => {
    document.removeEventListener("keydown", onKeyDown);
    if(triggerRef.current instanceof HTMLElement)  triggerRef.current.focus();
  }
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
        role = "dialog"
        aria-modal = "true"
        className="relative w-full max-w-[420px]"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute -top-3 -right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white text-ink shadow-md transition-transform hover:scale-105"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
