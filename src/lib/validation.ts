export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

export const MIN_PASSWORD_LEN = 8;

const COMMON_WEAK_PASSWORDS = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "password",
  "password1",
  "qwertyui",
  "qwerty123",
  "letmein1",
  "abc12345",
  "iloveyou1",
]);

export function getPasswordLengthError(password: string): string | null {
  if (password.length < MIN_PASSWORD_LEN) {
    return `Password must be at least ${MIN_PASSWORD_LEN} characters.`;
  }
  return null;
}

/** Real password-strength check, not just a length check — rejects 123456789-style passwords. */
export function getPasswordError(password: string): string | null {
  const lengthError = getPasswordLengthError(password);
  if (lengthError) return lengthError;
  if (!/[a-zA-Z]/.test(password)) {
    return "Password must include at least one letter.";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must include at least one number.";
  }
  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase())) {
    return "That password is too common — choose something less guessable.";
  }
  return null;
}
