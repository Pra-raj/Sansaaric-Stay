"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  /** Stagger delay in milliseconds. */
  delay?: number;
  className?: string;
  /** Element to render. Div by default. */
  as?: ElementType;
}

/**
 * Fades and lifts its children into view the first time they reach the
 * viewport. The observer is created once and disconnected after the reveal.
 *
 * Without IntersectionObserver the content is simply visible, and the
 * `@media (scripting: none)` rule in globals.css keeps it visible when
 * JavaScript is turned off.
 */
export function Reveal({ children, delay = 0, className = "", as: Tag = "div" }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (typeof IntersectionObserver === "undefined" || !node) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      style={visible && delay > 0 ? { transitionDelay: `${delay}ms` } : undefined}
      className={[
        "reveal transition-[opacity,transform,translate] duration-700 ease-out",
        "motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0",
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        className,
      ]
        .join(" ")
        .trim()}
    >
      {children}
    </Tag>
  );
}

export default Reveal;
