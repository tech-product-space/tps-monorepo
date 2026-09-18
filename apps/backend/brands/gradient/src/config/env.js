import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Loaded via the monorepo's unified server.js, whose cwd is apps/backend
// rather than brands/gradient, so the cwd-relative default would load the
// wrong .env. Resolve gradient's own .env explicitly instead.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export default {
  APP_ENVIRONMENT: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT,

  postgres: {
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    database: process.env.POSTGRES_DB,
    username: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
  },

  jwt: {
    auth: {
      secret: process.env.JWT_SECRET || "gradient-supersecret"
    }
  },

  crm: {
    /**
     * Base URL of the shared Product Space CRM.
     *
     * Only the one-off lead backfill script uses it — the live site posts to the
     * CRM from the browser via NEXT_PUBLIC_CRM_URL, and this API has no CRM
     * client of its own. No default on purpose: an unset value must stop the
     * script, not send thousands of historical leads somewhere unintended.
     */
    baseUrl: process.env.CRM_URL || null,
  },

  assets: {
    /** CDN domain in front of the S3 bucket, matching the websites' storage helper. */
    baseUrl: process.env.AWS_FILE_BASE_URL || "https://assets.thegradient.co.in",
  },

  s3: {
    bucket: process.env.AWS_BUCKET_NAME,

    /**
     * Bucket for objects that must NOT be publicly readable — certificates.
     *
     * The main bucket is fronted by the `assets.` CDN, which serves everything
     * in it regardless of object ACL: an object uploaded with `ACL: private` is
     * still fetchable at `<baseUrl>/<key>`. That makes presigned URLs
     * decorative and revocation meaningless, since the file stays reachable
     * forever at a guessable path.
     *
     * Set AWS_PRIVATE_BUCKET_NAME to a bucket with no CDN in front of it. Until
     * that exists this falls back to the main bucket and warns at boot — the
     * feature works, but a revoked certificate is still downloadable.
     */
    privateBucket: process.env.AWS_PRIVATE_BUCKET_NAME || null,
  },

  /**
   * Public site origin. Certificate emails link to a page here rather than to
   * S3 — the object is private and any direct URL expires, so a link to the
   * file would be dead within the hour.
   */
  publicSiteUrl: process.env.PUBLIC_SITE_URL || "https://gradientlearnings.org",

  google: {
    auth: {
      clientId: process.env.GOOGLE_AUTH_CLIENT_ID,
      clientSecret: process.env.GOOGLE_AUTH_CLIENT_SECRET
    }
  },

  agendaEnabled: process.env.AGENDA_JOBS_ENABLED === "true" || false,

  /**
   * AES-256-GCM key for secrets stored encrypted — currently Facebook page
   * access tokens. 64 hex chars (`openssl rand -hex 32`).
   *
   * Deliberately not defaulted. `util/tokenCrypto.js` throws when it is missing
   * rather than falling back to a weak key, and it must be in the deploy secrets
   * before the meta migrations run. Rotating it invalidates every stored token —
   * there is no re-wrap path, so every account has to be re-entered by hand.
   */
  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY || null,

  /**
   * Admin panel origin. Operational alert emails link back into the panel, and
   * a link to the public site would be no use to whoever has to fix the thing.
   */
  adminSiteUrl: process.env.ADMIN_SITE_URL || "https://admin.gradientlearnings.org",


  /**
   * Preview links — free courses and recordings both. See
   * `../FREE_COURSE_PREVIEW_PLAN.md` and `../RECORDINGS_PLAN.md`.
   *
   * No secret here: preview tokens derive their signing key from `JWT_SECRET`
   * exactly as unsubscribe links do, so there is no new variable to forget in an
   * environment. See `util/previewToken.util.js` for why the derivation is not
   * optional.
   */
  preview: {
    /** In the URL, so short. Long enough to survive a slow save-then-open. */
    launchTtl: process.env.PREVIEW_LAUNCH_TTL || "15m",

    /** In an httpOnly cookie, never in a URL — one editing session's worth. */
    sessionTtl: process.env.PREVIEW_SESSION_TTL || "60m",
  },

  /** Facebook Lead Ads. See `../FACEBOOK_LEADS_PLAN.md`. */
  meta: {
    /**
     * Master switch, read at boot. With it off the Agenda jobs are defined but
     * never scheduled, so no Graph traffic happens at all.
     *
     * The switch operators actually use day to day is
     * `meta_settings.pollEnabled`, togglable from the panel with no restart.
     * This one is the deploy-level kill switch.
     */
    enabled: process.env.META_INTEGRATION_ENABLED === "true" || false,

    /** A Graph version bump should be a config change, not a code edit. */
    graphVersion: process.env.META_GRAPH_VERSION || "v22.0",

    /** Where the token-expiry alert goes. Null disables the alert. */
    alertEmail: process.env.META_ALERT_EMAIL || null,
  },

  /**
   * Workflow automation — Redis and the queue.
   *
   * Separate from Agenda, which keeps running campaigns, reminders,
   * certificates and retention on Postgres. The two coexist; this is a second
   * mechanism, not a replacement.
   */
  workflows: {
    /**
     * Master switch. With it off the API stops enqueuing and the worker stops
     * consuming, so a bad deploy can be stopped without pausing every workflow
     * by hand. Off by default: a deploy that has not been given a Redis should
     * not start writing jobs into one.
     */
    enabled: process.env.WORKFLOWS_ENABLED === "true" || false,

    redis: {
      /** One URL, or the parts below. `REDIS_URL` wins when both are set. */
      url: process.env.REDIS_URL || null,
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      /** Managed Redis usually requires it; a local one usually refuses it. */
      tls: process.env.REDIS_TLS === "true" || false,
    },

    /**
     * Namespace for every queue key.
     *
     * **Not premature.** Two environments sharing one Redis with the same
     * prefix means staging's worker consumes production's advance jobs and
     * mails real people from test data. Defaults to the environment name so
     * that mistake needs someone to actively override it.
     */
    queuePrefix:
      process.env.WORKFLOW_QUEUE_PREFIX ||
      `gradient:${process.env.NODE_ENV || "development"}`,

    /** Per-queue worker concurrency. Kept low against the SES send rate. */
    concurrency: Number(process.env.WORKFLOW_CONCURRENCY) || 5,
  },
};
