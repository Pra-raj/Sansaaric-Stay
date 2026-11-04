"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuthModal } from "@/lib/auth-modal-context";
import { Modal } from "./Modal";
import AuthCardContent from "./AuthCardContent";

export default function AuthModalHost() {
  const { isOpen, close } = useAuthModal();
  const pathname = usePathname();
  const lastPathname = useRef(pathname);

  // Safety net: if the page changes for any reason while the modal is open
  // (a link inside it, browser back/forward...), close it. Otherwise the new
  // page loads behind a modal that never goes away.
  useEffect(() => {
    if (lastPathname.current !== pathname) {
      lastPathname.current = pathname;
      close();
    }
  }, [pathname, close]);

  if (!isOpen) return null;
  return (
    <Modal onClose={close}>
      {/* Any real link inside the card (e.g. the DEBUG-only password-reset
          link) closes the modal as soon as it is clicked, then the page opens
          normally. In-card panel switches are buttons, so they are unaffected. */}
      <div
        onClickCapture={(e) => {
          const link = (e.target as HTMLElement).closest("a[href]");
          const href = link?.getAttribute("href") ?? "";
          if (link && href && !href.startsWith("#")) close();
        }}
      >
        <AuthCardContent />
      </div>
    </Modal>
  );
}
