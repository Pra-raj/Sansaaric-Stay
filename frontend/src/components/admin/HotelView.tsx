"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  deleteAdminHotel,
  getAdminHotels,
  updateAdminHotel,
} from "@/lib/api-client";
import { formatCurrency, hotelStatusTone } from "@/lib/admin-utils";
import type { AdminHotel } from "@/types";

export function HotelsView() {
  const [hotels, setHotels] = useState<AdminHotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAdminHotels()
      .then((r) => {
        if (!cancelled) setHotels(r);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load hotels. Try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? hotels.filter((h) => `${h.name} ${h.location}`.toLowerCase().includes(q))
      : hotels;
  }, [hotels, query]);

  async function toggleStatus(hotel: AdminHotel) {
    setBusyId(hotel.id);
    setError("");
    try {
      const updated = await updateAdminHotel(hotel.id, {
        status: hotel.status === "Active" ? "Inactive" : "Active",
      });
      setHotels((prev) => prev.map((h) => (h.id === hotel.id ? updated : h)));
    } catch {
      setError("Couldn't update the hotel. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setConfirmId(null);
    setBusyId(id);
    setError("");
    try {
      await deleteAdminHotel(id);
      setHotels((prev) => prev.filter((h) => h.id !== id));
    } catch {
      setError("Couldn't delete the hotel. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold">Hotels</h1>
          <p className="text-sm text-ink-soft">Add and manage properties.</p>
        </div>
        <Link href="/admin/hotels/new">
          <Button>
            <Plus aria-hidden className="size-4" /> Add hotel
          </Button>
        </Link>
      </div>

      <input
        type="search"
        aria-label="Search hotels"
        placeholder="Search by name or location"
        maxLength={100}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-4 w-full max-w-sm rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand-500"
      />

      {error && (
        <p role="alert" className="mb-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-14" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-card border border-dashed border-border/20 py-12 text-center text-sm text-ink-soft">
          No hotels found.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border/20 bg-surface shadow-sm">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border/20 text-xs text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-semibold">Hotel</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">From</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/10">
              {visible.map((h) => (
                <tr key={h.id}>
                  <td className="max-w-[260px] px-4 py-3">
                    <p className="truncate font-medium">{h.name}</p>
                    <p className="truncate text-xs text-ink-soft">{h.location}</p>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{h.propertyType}</td>
                  <td className="px-4 py-3 text-ink-soft">
                    {formatCurrency(h.startingPrice)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={hotelStatusTone(h.status)}>{h.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {confirmId === h.id ? (
                      <span className="inline-flex items-center gap-3">
                        <span className="text-xs text-ink-soft">Delete this hotel?</span>
                        <button
                          onClick={() => void remove(h.id)}
                          className="text-sm font-semibold text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmId(null)}
                          className="text-sm font-semibold text-ink-soft hover:underline"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <button
                          onClick={() => void toggleStatus(h)}
                          disabled={busyId === h.id}
                          className="rounded-full px-3 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-50"
                        >
                          {h.status === "Active" ? "Deactivate" : "Activate"}
                        </button>
                        <Link
                          href={`/admin/hotels/${encodeURIComponent(h.id)}`}
                          aria-label={`Edit ${h.name}`}
                          className="rounded-full p-2 text-ink-soft hover:bg-bg"
                        >
                          <Pencil aria-hidden className="size-4" />
                        </Link>
                        <button
                          onClick={() => setConfirmId(h.id)}
                          disabled={busyId === h.id}
                          aria-label={`Delete ${h.name}`}
                          className="rounded-full p-2 text-ink-soft hover:bg-bg hover:text-red-600 disabled:opacity-50"
                        >
                          <Trash2 aria-hidden className="size-4" />
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
