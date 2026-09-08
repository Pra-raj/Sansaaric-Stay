export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const inDate = new Date(checkIn);
  const outDate = new Date(checkOut);
  const ms = outDate.getTime() - inDate.getTime();
  const nights = Math.round(ms / (1000 * 60 * 60 * 24));
  return nights > 0 ? nights : 0;
}

export function isDateRangeValid(checkIn: string, checkOut: string): boolean {
  if (!checkIn || !checkOut) return false;
  if (checkIn < todayISO()) return false;
  return checkOut > checkIn;
}