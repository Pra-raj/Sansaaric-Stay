"use client";

import { useState, type FormEvent } from "react";
import Input from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  LIMITS,
  validateHotelForm,
  type HotelFormErrors,
  type HotelFormValues,
} from "@/lib/admin-security";
import type { AdminHotel, AdminHotelInput } from "@/types";

interface HotelFormProps {
  initial?: AdminHotel;
  submitLabel: string;
  onSubmit: (value: AdminHotelInput) => Promise<void>;
}

const fieldClass =
  "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand-500";
const labelClass = "text-xs font-semibold uppercase tracking-wide text-ink-soft";

export function HotelForm({ initial, submitLabel, onSubmit }: HotelFormProps) {
  const [values, setValues] = useState<HotelFormValues>({
    name: initial?.name ?? "",
    location: initial?.location ?? "",
    propertyType: initial?.propertyType ?? "Homestay",
    startingPrice: initial ? String(initial.startingPrice) : "",
    description: initial?.description ?? "",
    amenities: initial?.amenities.join(", ") ?? "",
    status: initial?.status ?? "Active",
  });
  const [errors, setErrors] = useState<HotelFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");

  const set =
    (key: keyof HotelFormValues) =>
    (e: { target: { value: string } }) =>
      setValues((v) => ({ ...v, [key]: e.target.value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return; // blocks double submits
    const result = validateHotelForm(values);
    setErrors(result.errors);
    if (!result.value) return;
    setSaving(true);
    setServerError("");
    try {
      await onSubmit(result.value);
    } catch {
      setServerError("Couldn't save the hotel. Check the details and try again.");
      setSaving(false);
    }
  }

  const err = (key: keyof HotelFormValues) =>
    errors[key] ? (
      <p role="alert" className="text-xs text-red-600">
        {errors[key]}
      </p>
    ) : null;

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-2xl space-y-5">
      <div className="space-y-1">
        <Input
          id="hotel-name"
          label="Name"
          value={values.name}
          onChange={set("name")}
          maxLength={LIMITS.hotelName}
          error={!!errors.name}
          autoComplete="off"
        />
        {err("name")}
      </div>

      <div className="space-y-1">
        <Input
          id="hotel-location"
          label="Location"
          value={values.location}
          onChange={set("location")}
          maxLength={LIMITS.location}
          placeholder="Pokhara, Nepal"
          error={!!errors.location}
          autoComplete="off"
        />
        {err("location")}
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="hotel-type" className={labelClass}>
            Property type
          </label>
          <select
            id="hotel-type"
            value={values.propertyType}
            onChange={set("propertyType")}
            className={fieldClass}
          >
            <option>Homestay</option>
            <option>Hotel</option>
            <option>Resort</option>
          </select>
          {err("propertyType")}
        </div>
        <div className="space-y-1">
          <Input
            id="hotel-price"
            label="Price per night (NPR)"
            type="number"
            inputMode="numeric"
            min={1}
            max={LIMITS.maxPrice}
            step={1}
            value={values.startingPrice}
            onChange={set("startingPrice")}
            error={!!errors.startingPrice}
          />
          {err("startingPrice")}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="hotel-status" className={labelClass}>
            Status
          </label>
          <select
            id="hotel-status"
            value={values.status}
            onChange={set("status")}
            className={fieldClass}
          >
            <option>Active</option>
            <option>Inactive</option>
          </select>
          {err("status")}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="hotel-description" className={labelClass}>
          Description
        </label>
        <textarea
          id="hotel-description"
          rows={5}
          value={values.description}
          onChange={set("description")}
          maxLength={LIMITS.description}
          className={fieldClass}
        />
        {err("description")}
      </div>

      <div className="space-y-1">
        <Input
          id="hotel-amenities"
          label="Amenities (comma separated)"
          value={values.amenities}
          onChange={set("amenities")}
          placeholder="Wi-Fi, Breakfast, Parking"
          error={!!errors.amenities}
        />
        {err("amenities")}
      </div>

      {serverError && (
        <p role="alert" className="text-sm text-red-600">
          {serverError}
        </p>
      )}

      <Button type="submit" disabled={saving} className="disabled:opacity-50">
        {saving ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
