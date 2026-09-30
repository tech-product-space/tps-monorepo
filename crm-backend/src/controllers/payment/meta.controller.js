const {
  enrollmentCurrencies,
  providersForCurrency,
} = require("../../config/payment/providers");
const { getExponent, getSymbol } = require("../../config/constants/currency");
const { PAYMENT_SOURCE } = require("../../config/constants/payment");

/**
 * Currencies offered at enrollment — the union of every enabled gateway's
 * supported currencies, each with display metadata. Drives the enroll-modal
 * currency dropdown.
 */
exports.enrollCurrencies = async (_req, res) => {
  try {
    const codes = enrollmentCurrencies();
    const currencies = codes.map((code) => ({
      code,
      symbol: getSymbol(code),
      exponent: getExponent(code),
    }));
    res.json({ success: true, data: currencies });
  } catch (error) {
    console.error("List enroll currencies error:", error);
    res.status(500).json({ success: false, message: "Failed to load currencies" });
  }
};

/**
 * Payment providers that can collect in the given currency, plus the always-
 * available manual bank transfer. Drives the collect-payment source dropdown.
 */
exports.providers = async (req, res) => {
  try {
    const currency = req.query.currency || "INR";
    const gateways = providersForCurrency(currency).map((p) => ({
      key: p.key,
      label: p.label,
    }));
    res.json({
      success: true,
      data: [
        { key: PAYMENT_SOURCE.BANK_TRANSFER, label: "Bank Transfer" },
        ...gateways,
      ],
    });
  } catch (error) {
    console.error("List providers error:", error);
    res.status(500).json({ success: false, message: "Failed to load providers" });
  }
};
