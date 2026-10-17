const express = require("express");
const router = express.Router();

const requireStaff = require("../middlewares/requireStaff");

const {
  createReview,
  deleteReview,
  getReviewById,
  listPublicReviews,
  listReviews,
  updateReview,
  updateReviewStatus,
} = require("../controllers/reviewController");

// Base URL: /reviews

/* ── admin ──────────────────────────────────────────────────────────────── */
router.get("/admin/reviews", requireStaff, listReviews);
router.post("/admin/reviews", requireStaff, createReview);
router.get("/admin/reviews/:id", requireStaff, getReviewById);
router.put("/admin/reviews/:id", requireStaff, updateReview);
router.patch("/admin/reviews/:id/status", requireStaff, updateReviewStatus);
router.delete("/admin/reviews/:id", requireStaff, deleteReview);

/* ── public ─────────────────────────────────────────────────────────────── */
router.get("/public/list", listPublicReviews);

module.exports = router;
