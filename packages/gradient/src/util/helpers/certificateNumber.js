import crypto from "crypto";

/**
 * Crockford base32 minus I, L, O and U — the characters people misread or
 * mistype when copying a code off a printed certificate.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const RANDOM_LENGTH = 8;

/**
 * `GRD-2026-7K4M9QX2`
 *
 * Short enough to read aloud, and the year gives a human something to sanity
 * check against. Not derived from ids: TPS built `PSCERT-E<eventId>G<guestId>`,
 * which with ULID primary keys here would be a ~60-character string, and which
 * leaks how many events and guests exist.
 *
 * 8 characters of a 32-symbol alphabet is ~40 bits — far too sparse to
 * enumerate, but the verify endpoint is rate-limited anyway and the numbers are
 * meant to be shared, so unguessability is a nice-to-have rather than the
 * control. Uniqueness is enforced by the column, not by this function.
 */
export const generateCertificateNumber = (date = new Date()) => {
  const bytes = crypto.randomBytes(RANDOM_LENGTH);

  let random = "";
  for (let i = 0; i < RANDOM_LENGTH; i += 1) {
    random += ALPHABET[bytes[i] % ALPHABET.length];
  }

  return `GRD-${date.getFullYear()}-${random}`;
};
