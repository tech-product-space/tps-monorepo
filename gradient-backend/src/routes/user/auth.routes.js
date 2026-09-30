import express from "express";
import { googleLoginController, loginController } from "../../controllers/auth/login.controller.js";
import { registerController } from "../../controllers/auth/register.controller.js";
import { forgotPasswordController, resetPasswordController } from "../../controllers/auth/password.controller.js";
import { logoutController } from "../../controllers/auth/logout.controller.js";

const router = express.Router();

//BASE URL -> /auth

router.post("/login", loginController);
router.post("/google-login", googleLoginController);
router.post("/register", registerController);
router.post("/forgot-password", forgotPasswordController);
router.post("/reset-password", resetPasswordController);
router.post("/logout", logoutController);

export default router;