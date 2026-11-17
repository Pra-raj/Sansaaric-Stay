import type { Metadata } from "next";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
};

/** Target of the password-reset email link. */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ uid?: string | string[]; token?: string | string[] }>;
}) {
  const params = await searchParams;
  const uid = typeof params.uid === "string" ? params.uid : "";
  const token = typeof params.token === "string" ? params.token : "";

  return (
    <div className="mx-auto w-full max-w-md px-4 py-14 sm:py-20">
      <ResetPasswordForm uid={uid} token={token} />
    </div>
  );
}
