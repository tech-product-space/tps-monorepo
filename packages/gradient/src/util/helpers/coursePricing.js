import { GST_MODES } from "../../config/constants/course.js";

const RUPEE_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const MONTH_DAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** Dates that stand alone rather than following a word carry the year. */
const FULL_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const formatDate = (value, formatter) => {
  if (!value) return "";

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "" : formatter.format(date);
};

/**
 * Seat counts are whole positive numbers or nothing at all — a zero, a blank
 * or a stray string all mean "no seat line", never "0 seats left".
 */
const toSeatCount = (value) => {
  const seats = Number(value);

  return Number.isInteger(seats) && seats > 0 ? seats : null;
};

/**
 * Turns the numbers an admin types into the strings a course page renders.
 *
 * The site consumes these display fields rather than formatting the raw values
 * itself, so the API stays the single authority on how a price reads and the
 * discount badge can never disagree with the figure beside it.
 */
export const derivePricingDisplay = (pricing = {}) => {
  const price = Number(pricing.price) || 0;
  const rawDiscount = Number(pricing.discountPercent) || 0;

  // Clamped so a typo like 300 cannot produce a negative payable amount.
  const discountPercent = Math.min(Math.max(rawDiscount, 0), 100);
  const hasDiscount = discountPercent > 0 && price > 0;

  const finalPrice = hasDiscount
    ? Math.round(price * (1 - discountPercent / 100))
    : price;

  const cohortDay = formatDate(pricing.cohortDate, MONTH_DAY_FORMATTER);

  return {
    /** Payable amount, e.g. "₹41,300". */
    price: price > 0 ? RUPEE_FORMATTER.format(finalPrice) : "",
    /** Pre-discount amount, empty when there is no discount to show. */
    originalPrice: hasDiscount ? RUPEE_FORMATTER.format(price) : "",
    discountLabel: hasDiscount ? `${discountPercent}% Discount` : "",
    gstLabel:
      pricing.gstMode === GST_MODES.EXCLUSIVE
        ? "Exclusive of GST"
        : "Inclusive of GST",
    emiPlan: pricing.emiPlan || "",
    /** Reads after a word, e.g. "Next cohort: Starts Aug 22". */
    cohortLabel: cohortDay ? `Starts ${cohortDay}` : "",
    /** The same date standing on its own, e.g. "Aug 22, 2026". */
    cohortDateLabel: formatDate(pricing.cohortDate, FULL_DATE_FORMATTER),
    /** e.g. "Aug 19, 2026". Empty hides the offer line. */
    offerValidTillLabel: formatDate(pricing.offerValidTill, FULL_DATE_FORMATTER),
    /** e.g. "Early Bird Discount for 4 Seats Only!". Empty hides the line. */
    offerLabel: pricing.offerLabel || "",
    /** Seats in one cohort. Null hides the seat line and the hero badge. */
    cohortSeats: toSeatCount(pricing.cohortSeats),
    durationLabel: pricing.durationLabel || "",

    /** Numeric payable amount, for the CRM and analytics. */
    priceValue: price > 0 ? finalPrice : null,
  };
};

/** Treated as "cleared" wherever a number or a date is expected. */
const isBlank = (value) => value === undefined || value === null || value === "";

/**
 * Validates and normalises a pricing block coming off the admin panel.
 *
 * Seat counts are stored as real numbers rather than whatever the form sent:
 * the site prints them straight into "Only N learners per batch", so a "30 "
 * typed with a trailing space must never reach the page. A cleared field is
 * normalised to null, which is what hides the line it drives.
 *
 * Returns `{ error }` for a rejected block, `{ value }` for an accepted one.
 */
export const sanitisePricingInput = (pricing = {}) => {
  const value = { ...pricing };

  if (!isBlank(pricing.price)) {
    const price = Number(pricing.price);

    if (!Number.isFinite(price) || price < 0) {
      return { error: "Price must be a number of rupees, or left empty." };
    }

    value.price = price;
  } else if ("price" in pricing) {
    value.price = null;
  }

  if (!isBlank(pricing.discountPercent)) {
    const discount = Number(pricing.discountPercent);

    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      return { error: "Discount must be a number between 0 and 100." };
    }

    value.discountPercent = discount;
  } else if ("discountPercent" in pricing) {
    value.discountPercent = 0;
  }

  if ("cohortSeats" in pricing) {
    if (isBlank(pricing.cohortSeats)) {
      value.cohortSeats = null;
    } else {
      const seats = Number(pricing.cohortSeats);

      // Number("") is 0 and Number("30 seats") is NaN — both are rejected here
      // rather than silently stored, so the seat count is always a real count.
      if (!Number.isInteger(seats) || seats <= 0) {
        return {
          error: "Total cohort seats must be a whole number greater than 0.",
        };
      }

      value.cohortSeats = seats;
    }
  }

  for (const [key, label] of [
    ["cohortDate", "Cohort start date"],
    ["offerValidTill", "Offer valid till"],
  ]) {
    if (!(key in pricing)) continue;

    if (isBlank(pricing[key])) {
      value[key] = "";
      continue;
    }

    if (Number.isNaN(new Date(pricing[key]).getTime())) {
      return { error: `${label} must be a valid date.` };
    }
  }

  if ("offerLabel" in pricing) {
    if (isBlank(pricing.offerLabel)) {
      value.offerLabel = "";
    } else if (typeof pricing.offerLabel !== "string") {
      return { error: "Offer label must be text." };
    } else {
      value.offerLabel = pricing.offerLabel.trim();
    }
  }

  return { value };
};
