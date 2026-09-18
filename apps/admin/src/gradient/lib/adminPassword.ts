/** Mirrors ADMIN_PASSWORD_MIN_LENGTH in the backend's config/constants/admin.js. */
export const ADMIN_PASSWORD_MIN_LENGTH = 8;

// No 0/O/1/l/I — these get read aloud or copied by hand off a screen.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const SYMBOLS = "!@#$%&*";

/**
 * Generated in the browser, not the API, so a temporary password can be shown
 * in the dialog without the server ever returning a plaintext secret in a
 * response body. The server only receives it to hash it.
 */
export const generateTemporaryPassword = (length = 14) => {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);

  const chars = Array.from(values, (value, index) =>
    // One guaranteed symbol, so the result always clears a policy that wants
    // mixed character classes.
    index === length - 2
      ? SYMBOLS[value % SYMBOLS.length]
      : ALPHABET[value % ALPHABET.length],
  );

  return chars.join("");
};

/** "Never" / "2 hours ago" for the Last login column. */
export const formatLastLogin = (iso?: string | null) => {
  if (!iso) return null;

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return null;

  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);

  // Recent logins are best read as "how long ago"; older ones as a real date,
  // where "94 days ago" stops meaning anything.
  if (days >= 7) {
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  const hours = Math.floor((Date.now() - date.getTime()) / 3_600_000);

  if (hours < 1) return "just now";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  return `${days} day${days === 1 ? "" : "s"} ago`;
};
