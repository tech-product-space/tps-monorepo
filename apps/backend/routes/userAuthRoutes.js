const express = require("express");
const { userSignup, userLogin, userResetPassword, signupWithGoogle, loginWithGoogle, isGoogleAuthenticated, getUserFromToken, forgotPassword, resetPassword } = require("../controllers/userAuthController");

const router = express.Router();

router.post("/login", userLogin);
router.post("/signup", userSignup);
router.post("/change-password", userResetPassword);
router.post("/login-with-google", loginWithGoogle);
router.post("/signup-with-google", signupWithGoogle);
router.post("/is-google-auth", isGoogleAuthenticated);
router.get("/me", getUserFromToken);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

module.exports = router;