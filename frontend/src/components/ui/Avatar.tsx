import type { AuthUser } from "../../lib/auth-context";

export function Avatar({ user, size = 36 }: { user: AuthUser; size?: number }) {
  const style = { width: size, height: size };

  if (user.photoUrl) {
    return (
      <img
        src={user.photoUrl}
        alt={user.name}
        className="rounded-full object-cover"
        style={style}
      />
    );
  }

  return (
    <span
      style={style}
      className="flex items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-600"
    >
      {user.initials}
    </span>
  );
}
