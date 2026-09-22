"use client";

import { createContext, useContext, useMemo, useState } from "react";

interface SavedContextValue {
  savedIds: string[];
  isSaved: (hotelId: string) => boolean;
  toggleSaved: (hotelId: string) => void;
}

const SavedContext = createContext<SavedContextValue | undefined>(undefined);
const STORAGE_KEY = "sansaaric-saved_hotels";

export function SavedProvider({ children }: { children: React.ReactNode }) {
  const [savedIds, setSavedIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    } catch {
      return [];
    }
  });

  function toggleSaved(hotelId: string) {
    setSavedIds((prev) => {
      const next = prev.includes(hotelId)
        ? prev.filter((id) => id !== hotelId)
        : [...prev, hotelId];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  const value = useMemo<SavedContextValue>(
    () => ({
      savedIds,
      isSaved: (hotelId: string) => savedIds.includes(hotelId),
      toggleSaved,
    }),
    [savedIds],
  );
  return (
    <SavedContext.Provider value={value}>{children}</SavedContext.Provider>
  );
}

export function useSaved() {
  const ctx = useContext(SavedContext);
  if (!ctx) throw new Error("useSaved must be used within a SavedProvider");
  return ctx;
}
