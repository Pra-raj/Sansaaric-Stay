"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import PasswordInput from "@/components/ui/PasswordInput";
import { Avatar } from "@/components/ui/Avatar";
import { AccountSidebar } from "./AccountSidebar";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import {
  getPasswordError,
  getPasswordLengthError,
  isValidEmail,
  MIN_PASSWORD_LEN,
} from "@/lib/validation";

const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2MB — keeps localStorage usage sane

/**
 * /account/settings. Profile edits (name/email/photo) now actually
 * persist via useAuth().updateProfile() — the header avatar and this
 * page's own sidebar update immediately since they read from the same
 * context. Password/notifications/delete are still local-only, since
 * there's no backend to send them to yet.
 */
export function SettingsView() {
  const { isLoggedIn, user, logOut, updateProfile } = useAuth();
  const { openLogin } = useAuthModal();
  const router = useRouter();

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [photoPreview, setPhotoPreview] = useState(user?.photoUrl);
  const [photoError, setPhotoError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);

  const [bookingUpdates, setBookingUpdates] = useState(true);
  const [dealsAndOffers, setDealsAndOffers] = useState(false);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const canDelete = deletePassword.trim().length >= MIN_PASSWORD_LEN;

  if (!isLoggedIn || !user) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-24 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-2xl">
          🔒
        </div>
        <h1 className="text-2xl font-bold">Log in to view settings</h1>
        <Button className="mt-6" onClick={openLogin}>
          Log in
        </Button>
      </div>
    );
  }

  function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("Choose an image file.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError("That image is too large — choose one under 2MB.");
      return;
    }
    setPhotoError("");
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      setProfileError("Enter your full name.");
      return;
    }
    if (!isValidEmail(email)) {
      setProfileError("Enter a valid email address.");
      return;
    }
    setProfileError("");
    updateProfile({
      name,
      email,
      initials: name.trim().charAt(0).toUpperCase() || "?",
      photoUrl: photoPreview,
    });
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2500);
  }

  function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    const currentPasswordError = getPasswordLengthError(currentPassword.trim());
    if (currentPasswordError) {
      setPasswordError(`Current password: ${currentPasswordError}`);
      return;
    }
    const newPasswordError = getPasswordError(newPassword);
    if (newPasswordError) {
      setPasswordError(`New password: ${newPasswordError}`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation don't match.");
      return;
    }
    setPasswordError("");
    setPasswordSaved(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setTimeout(() => setPasswordSaved(false), 2500);
  }

  function handleLogout() {
    logOut();
    router.push("/");
  }

  function handleDeleteAccount() {
    const deletePasswordError = getPasswordLengthError(deletePassword.trim());
    if (deletePasswordError) {
      setDeleteError(`Enter your password (min. ${MIN_PASSWORD_LEN} characters).`);
      return;
    }
    logOut();
    router.push("/");
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[220px_1fr]">
        <AccountSidebar user={user} />

        <div className="max-w-xl space-y-8">
          <h1 className="text-2xl font-bold">Settings</h1>

          {/* Profile */}
          <section className="rounded-card border border-border/10 bg-surface p-5">
            <h2 className="mb-4 font-semibold">Profile</h2>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar user={{ name, email, initials: name.trim().charAt(0).toUpperCase() || "?", photoUrl: photoPreview }} size={56} />
                <div>
                  <label className="block cursor-pointer text-sm font-semibold text-brand-600">
                    Change photo
                    <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                  </label>
                  <p className="text-xs text-ink-soft">JPG or PNG, up to 2MB.</p>
                </div>
              </div>
              {photoError && <p className="text-xs font-medium text-red-600">{photoError}</p>}
              <Input id="settings-name" label="Full name" value={name} onChange={(e) => setName(e.target.value)} error={!!profileError} />
              <Input id="settings-email" label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={!!profileError} />
              {profileError && <p className="text-xs font-medium text-red-600">{profileError}</p>}
              <div className="flex items-center gap-3">
                <Button type="submit">Save profile</Button>
                {profileSaved && <span className="text-sm font-medium text-emerald-600">Saved.</span>}
              </div>
            </form>
          </section>

          {/* Password */}
          <section className="rounded-card border border-border/10 bg-surface p-5">
            <h2 className="mb-4 font-semibold">Change password</h2>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <PasswordInput
                id="settings-current-password"
                label="Current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
              <PasswordInput
                id="settings-new-password"
                label={`New password (min. ${MIN_PASSWORD_LEN} characters)`}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <PasswordInput
                id="settings-confirm-password"
                label="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              {passwordError && <p className="text-xs font-medium text-red-600">{passwordError}</p>}
              <div className="flex items-center gap-3">
                <Button type="submit">Update password</Button>
                {passwordSaved && <span className="text-sm font-medium text-emerald-600">Password updated.</span>}
              </div>
            </form>
          </section>

          {/* Notifications */}
          <section className="rounded-card border border-border/10 bg-surface p-5">
            <h2 className="mb-4 font-semibold">Notifications</h2>
            <div className="space-y-3">
              <label className="flex items-center justify-between text-sm">
                <span>Booking updates &amp; confirmations</span>
                <input
                  type="checkbox"
                  checked={bookingUpdates}
                  onChange={(e) => setBookingUpdates(e.target.checked)}
                  className="h-4 w-4"
                />
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>Deals &amp; offers</span>
                <input
                  type="checkbox"
                  checked={dealsAndOffers}
                  onChange={(e) => setDealsAndOffers(e.target.checked)}
                  className="h-4 w-4"
                />
              </label>
            </div>
          </section>

          {/* Payment methods placeholder */}
          <section className="rounded-card border border-border/10 bg-surface p-5">
            <h2 className="mb-1 font-semibold">Payment methods</h2>
            <p className="text-sm text-ink-soft">
              No saved payment methods yet. You&apos;ll be able to save a card here once real
              payment is connected.
            </p>
          </section>

          {/* Session */}
          <section className="rounded-card border border-border/10 bg-surface p-5">
            <h2 className="mb-4 font-semibold">Session</h2>
            <Button variant="ghost" onClick={handleLogout}>
              Log out
            </Button>
          </section>

          {/* Danger zone */}
          <section className="rounded-card border border-red-200 bg-red-50 p-5">
            <h2 className="mb-1 font-semibold text-red-700">Delete account</h2>
            <p className="mb-4 text-sm text-red-700/80">
              This permanently deletes your account and booking history. This can&apos;t be undone.
            </p>
            {confirmingDelete ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleDeleteAccount();
                }}
                className="space-y-3"
              >
                <PasswordInput
                  id="delete-account-password"
                  label="Enter your password to confirm"
                  placeholder="••••••••"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  autoFocus
                />
                {deleteError && (
                  <p className="text-xs font-medium text-red-600">{deleteError}</p>
                )}
                <div className="flex items-center gap-3">
                  {canDelete ? (
                    <Button type="submit" className="!bg-red-600 hover:!bg-red-700">
                      Yes, delete my account
                    </Button>
                  ) : (
                    <p className="text-xs text-red-700/70">
                      Enter your password to reveal the confirm button.
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setConfirmingDelete(false);
                      setDeletePassword("");
                      setDeleteError("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <Button
                variant="ghost"
                className="!text-red-700"
                onClick={() => {
                  setDeletePassword("");
                  setDeleteError("");
                  setConfirmingDelete(true);
                }}
              >
                Delete my account
              </Button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}