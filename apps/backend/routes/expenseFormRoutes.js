const express = require("express");
const router = express.Router();

const upload = require("../middlewares/multer");
const {
  listForms,
  getForm,
  createForm,
  updateForm,
  toggleForm,
  regenerateLink,
  deleteForm,
} = require("../controllers/expense/formController");
const {
  getPublicForm,
  submitPublicForm,
  uploadPublicReceipt,
} = require("../controllers/expense/publicFormController");

/* --------------------------- public rate limiter -------------------------- */
// Lightweight, dependency-free per-IP throttle for the unauthenticated public
// endpoints. Caps submissions/uploads from a single IP within a short window.
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 15;
const hits = new Map(); // ip -> { count, resetAt }

function rateLimitPublic(req, res, next) {
  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
  const now = Date.now();
  const entry = hits.get(ip);

  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return next();
  }
  if (entry.count >= RATE_MAX) {
    return res.status(429).json({ error: "Too many requests, please try again shortly" });
  }
  entry.count += 1;
  next();
}

// Opportunistically drop expired buckets so the map can't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of hits) if (now > entry.resetAt) hits.delete(ip);
}, RATE_WINDOW_MS).unref();

/* --------------------------------- public --------------------------------- */
router.get("/public/:slug", getPublicForm);
router.post("/public/:slug/submit", rateLimitPublic, submitPublicForm);
router.post(
  "/public/:slug/upload-receipt",
  rateLimitPublic,
  upload.single("receipt"),
  uploadPublicReceipt
);

/* ---------------------------------- admin --------------------------------- */
router.get("/", listForms);
router.post("/", createForm);
router.get("/:id", getForm);
router.put("/:id", updateForm);
router.patch("/:id/toggle", toggleForm);
router.post("/:id/regenerate-link", regenerateLink);
router.delete("/:id", deleteForm);

module.exports = router;
