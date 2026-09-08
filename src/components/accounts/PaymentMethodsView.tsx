"use client";

import { useState } from "react";
import { AccountSidebar } from "./AccountSidebar";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { Button } from "../ui/Button";

interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  expMonth: string;
  expYear: string;
}

const savedCards: SavedCard[] = [
  { id: "pm-1", brand: "Visa", last4: "4242", expMonth: "12", expYear: "2027" },
  { id: "pm-2", brand: "Mastercard", last4: "1881", expMonth: "08", expYear: "2026" },
];

export function PaymentMethodsView() {
  const { isLoggedIn, user } = useAuth();
  const { openLogin } = useAuthModal();
  const [cards, setCards] = useState<SavedCard[]>(savedCards);

  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [error, setError] = useState("");

  if (!isLoggedIn || !user) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-24 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-2xl">
          &#128179;
        </div>
        <h1 className="text-2xl font-bold">Log in to manage payment methods</h1>
        <Button className="mt-6" onClick={openLogin}>
          Log in
        </Button>
      </div>
    );
  }

  function handleAddCard(e: React.FormEvent) {
    e.preventDefault();
    const digits = cardNumber.replace(/\s/g, "").replace(/\D/g, "");
    if (digits.length < 12) {
      setError("Enter a valid card number.");
      return;
    }
    if (!/^\d{2}\/\d{2}$/.test(expiry)) {
      setError("Enter expiry as MM/YY.");
      return;
    }
    if (cvc.replace(/\D/g, "").length < 3) {
      setError("Enter a valid CVC.");
      return;
    }
    const brand = cardNumber.startsWith("4") ? "Visa" : "Mastercard";
    const [mm, yy] = expiry.split("/");
    const newCard: SavedCard = {
      id: `pm-${Date.now()}`,
      brand,
      last4: digits.slice(-4),
      expMonth: mm,
      expYear: `20${yy}`,
    };
    setCards((prev) => [...prev, newCard]);
    setCardNumber("");
    setExpiry("");
    setCvc("");
    setError("");
  }

  function removeCard(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[220px_1fr]">
        <AccountSidebar user={user} />
        <div>
          <h1 className="mb-4 text-2xl font-bold">Payment methods</h1>

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {(["eSewa", "Khalti", "Card"] as const).map((m) => (
              <div
                key={m}
                className="rounded-card border border-border/10 bg-surface p-4"
              >
                <p className="text-sm font-semibold">{m}</p>
                <p className="mt-1 text-xs text-ink-soft">
                  {m === "Card"
                    ? `${cards.length} card${cards.length === 1 ? "" : "s"} on file`
                    : "Available at checkout"}
                </p>
              </div>
            ))}
          </div>

          <section className="mb-6 rounded-card border border-border/10 bg-surface p-5">
            <h2 className="mb-4 font-semibold">Saved cards</h2>
            {cards.length === 0 ? (
              <p className="text-sm text-ink-soft">No cards saved yet.</p>
            ) : (
              <div className="space-y-3">
                {cards.map((card) => (
                  <div
                    key={card.id}
                    className="flex items-center justify-between rounded-lg border border-border/10 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-12 items-center justify-center rounded bg-black text-[10px] font-semibold text-white">
                        {card.brand}
                      </span>
                      <div>
                        <p className="text-sm font-semibold">
                          {card.brand} •••• {card.last4}
                        </p>
                        <p className="text-xs text-ink-soft">
                          Expires {card.expMonth}/{card.expYear.slice(2)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeCard(card.id)}
                      className="text-sm font-medium text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-card border border-border/10 bg-surface p-5">
            <h2 className="mb-4 font-semibold">Add a card</h2>
            <form onSubmit={handleAddCard} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Card number</label>
                <input
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  placeholder="1234 5678 9012 3456"
                  inputMode="numeric"
                  className="w-full rounded-lg border border-border/10 bg-bg px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">Expiry (MM/YY)</label>
                  <input
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                    placeholder="12/27"
                    className="w-full rounded-lg border border-border/10 bg-bg px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">CVC</label>
                  <input
                    value={cvc}
                    onChange={(e) => setCvc(e.target.value)}
                    placeholder="123"
                    inputMode="numeric"
                    className="w-full rounded-lg border border-border/10 bg-bg px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </div>
              </div>
              {error && <p className="text-xs font-medium text-red-600">{error}</p>}
              <Button type="submit">Add card</Button>
              <p className="text-xs text-ink-soft">
                Demo only — no real payments are processed.
              </p>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
