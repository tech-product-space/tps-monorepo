const COUNTRY_CODES = [
  "1","7","20","27","30","31","32","33","34","36",
  "39","40","41","43","44","45","46","47","48","49",
  "52","54","55","56","57","60","61","62","63","64",
  "65","66","81","82","84","86","90","91","92","93",
  "94","95","98","212","213","216","218","220","221",
  "222","223","224","225","226","227","228","229","230",
  "231","232","233","234","235","236","237","238","239",
  "240","241","242","243","244","245","248","249","250",
  "251","252","253","254","255","256","257","258","260",
  "261","262","263","264","265","266","267","268","269",
  "350","351","352","353","354","355","356","357","358",
  "359","370","371","372","373","374","375","376","377",
  "378","380","381","382","383","385","386","387","389",
  "420","421","423","500","501","502","503","504","505",
  "506","507","508","509","590","591","592","593","594",
  "595","596","597","598","599"
];

// Sort once for longest match
const SORTED_CODES = [...COUNTRY_CODES].sort((a, b) => b.length - a.length);

function extractPhoneDetails(phone) {
  if (!phone) {
    return {
      countryCode: null,
      phoneNumber: null,
      fullNumber: null,
    };
  }

  let cleaned = phone.replace(/[^\d+]/g, "");

  // convert 0091 format to +91
  if (cleaned.startsWith("00")) {
    cleaned = "+" + cleaned.slice(2);
  }

  // If not international format
  if (!cleaned.startsWith("+")) {
    return {
      countryCode: null,
      phoneNumber: cleaned,
      fullNumber: cleaned,
    };
  }

  const digits = cleaned.slice(1);

  let countryCode = null;

  for (const code of SORTED_CODES) {
    if (digits.startsWith(code)) {
      countryCode = code;
      break;
    }
  }

  if (!countryCode) {
    return {
      countryCode: null,
      phoneNumber: digits,
      fullNumber: cleaned,
    };
  }

  const phoneNumber = digits.slice(countryCode.length);

  return {
    countryCode,
    phoneNumber,
    fullNumber: `+${countryCode}${phoneNumber}`,
  };
}

module.exports = { extractPhoneDetails };