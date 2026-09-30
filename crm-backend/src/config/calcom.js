/**
 * Cal.com account registry.
 *
 * Each brand runs its own Cal.com instance: its own event types, its own
 * signing secret, and its own CRM product. The webhook is one controller
 * parameterised by the account key in the URL, rather than a controller per
 * brand — the payload shape and the lifecycle rules are identical, only the
 * destination product and the secret differ.
 *
 * `DEFAULT_ACCOUNT` is what the legacy secretless `/webhooks/cal` route resolves
 * to, so the Cal.com dashboard that has been pointing there since day one keeps
 * working untouched. New brands get `/webhooks/cal/<key>`.
 *
 * Unlike Meta (see meta_accounts), this is deliberately code, not a DB table
 * with a CRUD UI: Meta *polls* with per-form tokens that rotate and expire, so
 * it needs runtime management. Cal.com *pushes* — an account is one static
 * secret and one product id. Move it to the DB if a third or fourth brand
 * arrives; two env entries do not justify a table.
 */

const DEFAULT_ACCOUNT = "tps";

const CALCOM_ACCOUNTS = {
  tps: {
    key: "tps",
    productId: "Calcom",
    secretEnv: "CAL_WEBHOOK_SECRET",
  },
  gradient: {
    key: "gradient",
    productId: "GRADIENT_CALCOM",
    secretEnv: "CAL_WEBHOOK_SECRET_GRADIENT",
  },
};

/**
 * Resolve a URL path segment to an account, or null if it names no account.
 *
 * The secret is read from env *here*, at request time rather than at module
 * load, so a deploy that sets the var does not also need a restart ordering
 * dance. A blank secret yields `secret: null`, which the verifier treats as
 * "reject everything" — an unconfigured account must fail closed, never open.
 */
function resolveCalcomAccount(key) {
  const account = CALCOM_ACCOUNTS[key || DEFAULT_ACCOUNT];
  if (!account) return null;
  return { ...account, secret: process.env[account.secretEnv] || null };
}

/** Every product id that holds Cal.com bookings. */
const CALCOM_PRODUCT_IDS = Object.values(CALCOM_ACCOUNTS).map((a) => a.productId);

/**
 * Whether a product's leads are Cal.com bookings — i.e. whether their lifecycle
 * lives in `extra_fields.status` and their sort key in `extra_fields.startTime`
 * rather than in the normal pipeline columns.
 */
function isCalcomProduct(productId) {
  return CALCOM_PRODUCT_IDS.includes(productId);
}

module.exports = {
  DEFAULT_ACCOUNT,
  CALCOM_ACCOUNTS,
  CALCOM_PRODUCT_IDS,
  resolveCalcomAccount,
  isCalcomProduct,
};
