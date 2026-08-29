"use client";

import { useAuthModal } from "@/lib/auth-modal-context";
import { Modal } from "./Modal";
import AuthCardContent from "./AuthCardContent";

export default function AuthModalHost() {
  const { isOpen, close } = useAuthModal();
  if (!isOpen) return null;
  return (
    <Modal onClose={close}>
      <AuthCardContent />
    </Modal>
  );
}
