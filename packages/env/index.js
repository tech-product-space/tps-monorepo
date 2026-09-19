/**
 * All three backends run in one process now, so they share one process.env — but
 * they need different values for the same name (JWT_SECRET, AWS_BUCKET_NAME,
 * FRONTEND_URL, ...). Each brand reads config through a view of process.env that
 * looks for `<BRAND>_<NAME>` first and falls back to plain `<NAME>`:
 *
 *   TPS_JWT_SECRET=a  GRADIENT_JWT_SECRET=b  PORT=3000
 *   tpsEnv.JWT_SECRET      -> "a"
 *   gradientEnv.JWT_SECRET -> "b"
 *   tpsEnv.PORT            -> "3000"   (shared, no prefixed override)
 *
 * Because of the fallback, a package still runs standalone from its old .env.
 * Writes go to the prefixed key so one brand can't clobber another's value.
 */
function brandEnv(prefix, base = process.env) {
  const scoped = (key) => `${prefix}_${key}`;
  return new Proxy(base, {
    get(target, key) {
      if (typeof key === "string") {
        const v = target[scoped(key)];
        if (v !== undefined) return v;
      }
      return target[key];
    },
    has(target, key) {
      return typeof key === "string" && scoped(key) in target ? true : key in target;
    },
    set(target, key, value) {
      target[typeof key === "string" ? scoped(key) : key] = value;
      return true;
    },
    deleteProperty(target, key) {
      if (typeof key === "string") delete target[scoped(key)];
      return delete target[key];
    },
  });
}

module.exports = { brandEnv };
