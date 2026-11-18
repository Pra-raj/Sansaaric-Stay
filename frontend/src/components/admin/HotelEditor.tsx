"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { createAdminHotel, getAdminHotel, updateAdminHotel } from "@/lib/api-client";
import { isSafeId } from "@/lib/admin-security";
import type { AdminHotel, AdminHotelInput } from "@/types";
import { HotelForm } from "./HotelForm";
import { HotelMediaPanel } from "./HotelMediaPanel";

/** Add form when no hotelId is given, edit form otherwise. */
export function HotelEditor({ hotelId }: { hotelId?: string }) {
  const router = useRouter();
  const editing = hotelId !== undefined;
  const [hotel, setHotel] = useState<AdminHotel | null>(null);
  const invalidId = editing && !isSafeId(hotelId);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">(
    editing ? "loading" : "ready",
  );

  useEffect(() => {
    if (!editing || invalidId) return;
    let cancelled = false;
    getAdminHotel(hotelId)
      .then((h) => {
        if (cancelled) return;
        setHotel(h);
        setState(h ? "ready" : "missing");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [editing, invalidId, hotelId]);

  async function handleSubmit(value: AdminHotelInput) {
    if (editing) await updateAdminHotel(hotelId, value);
    else await createAdminHotel(value);
    router.push("/admin/hotels");
  }

  return (
    <div>
      <Link
        href="/admin/hotels"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-ink-soft hover:text-link"
      >
        <ArrowLeft aria-hidden className="size-4" /> Hotels
      </Link>
      <h1 className="mb-6 text-2xl font-bold">
        {editing ? "Edit hotel" : "Add a hotel"}
      </h1>

      {!invalidId && state === "loading" && <Skeleton className="h-64 max-w-2xl rounded-card" />}
      {(invalidId || state === "missing") && (
        <p className="text-sm text-ink-soft">That hotel doesn&apos;t exist.</p>
      )}
      {state === "error" && (
        <p role="alert" className="text-sm text-red-600">
          Couldn&apos;t load the hotel. Try again.
        </p>
      )}
      {!invalidId && state === "ready" && (
        <>
          <HotelForm
            initial={hotel ?? undefined}
            submitLabel={editing ? "Save changes" : "Add hotel"}
            onSubmit={handleSubmit}
          />
          {editing && hotelId && (
            <div className="mt-10 max-w-2xl">
              <HotelMediaPanel hotelId={hotelId} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
