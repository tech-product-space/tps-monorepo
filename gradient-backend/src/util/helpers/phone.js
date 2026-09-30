/**
 * Splits an international phone string into a country code and a number.
 *
 * Facebook returns one field — `+919876543210` — and `meta_leads` stores the
 * two separately so the panel can display and search them the way every other
 * phone in the system is stored.
 *
 * Longest-match against a static prefix list, because country codes are a
 * prefix code with no fixed length: `1`, `91` and `912` are all real, so a
 * naive two-character slice mis-parses a meaningful share of numbers.
 */

const COUNTRY_CODES = [
  "1", "7", "20", "27", "30", "31", "32", "33", "34", "36",
  "39", "40", "41", "43", "44", "45", "46", "47", "48", "49",
  "51", "52", "53", "54", "55", "56", "57", "58", "60", "61",
  "62", "63", "64", "65", "66", "81", "82", "84", "86", "90",
  "91", "92", "93", "94", "95", "98", "211", "212", "213", "216",
  "218", "220", "221", "222", "223", "224", "225", "226", "227", "228",
  "229", "230", "231", "232", "233", "234", "235", "236", "237", "238",
  "239", "240", "241", "242", "243", "244", "245", "246", "248", "249",
  "250", "251", "252", "253", "254", "255", "256", "257", "258", "260",
  "261", "262", "263", "264", "265", "266", "267", "268", "269", "290",
  "291", "297", "298", "299", "350", "351", "352", "353", "354", "355",
  "356", "357", "358", "359", "370", "371", "372", "373", "374", "375",
  "376", "377", "378", "380", "381", "382", "383", "385", "386", "387",
  "389", "420", "421", "423", "500", "501", "502", "503", "504", "505",
  "506", "507", "508", "509", "590", "591", "592", "593", "594", "595",
  "596", "597", "598", "599", "670", "672", "673", "674", "675", "676",
  "677", "678", "679", "680", "681", "682", "683", "685", "686", "687",
  "688", "689", "690", "691", "692", "850", "852", "853", "855", "856",
  "870", "880", "886", "960", "961", "962", "963", "964", "965", "966",
  "967", "968", "970", "971", "972", "973", "974", "975", "976", "977",
  "992", "993", "994", "995", "996", "998",
];

/** Sorted once at module load so the loop below can stop at the first hit. */
const SORTED_CODES = [...COUNTRY_CODES].sort((a, b) => b.length - a.length);

const EMPTY = Object.freeze({
  countryCode: null,
  phoneNumber: null,
  fullNumber: null,
});

/**
 * @param   {string|null|undefined} phone
 * @returns {{ countryCode: string|null, phoneNumber: string|null, fullNumber: string|null }}
 *
 * `countryCode` comes back without a `+` — the caller decides how to render it.
 * An unrecognised or local-format number keeps its digits in `phoneNumber` with
 * a null country code rather than being discarded: a number we cannot classify
 * is still a number somebody can call.
 */
export const extractPhoneDetails = (phone) => {
  if (!phone) return { ...EMPTY };

  let cleaned = String(phone).replace(/[^\d+]/g, "");

  if (!cleaned) return { ...EMPTY };

  // 00 is the other international prefix — 0091 and +91 mean the same thing.
  if (cleaned.startsWith("00")) cleaned = `+${cleaned.slice(2)}`;

  if (!cleaned.startsWith("+")) {
    return { countryCode: null, phoneNumber: cleaned, fullNumber: cleaned };
  }

  const digits = cleaned.slice(1);

  const countryCode = SORTED_CODES.find((code) => digits.startsWith(code));

  if (!countryCode) {
    return { countryCode: null, phoneNumber: digits, fullNumber: cleaned };
  }

  const phoneNumber = digits.slice(countryCode.length);

  // A prefix that consumed the whole string is a match in name only — keep the
  // digits together rather than reporting a country code and an empty number.
  if (!phoneNumber) {
    return { countryCode: null, phoneNumber: digits, fullNumber: cleaned };
  }

  return { countryCode, phoneNumber, fullNumber: cleaned };
};

export default extractPhoneDetails;
