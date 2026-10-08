const express = require("express");
const { companySignup, companyLogin, loginWithGoogle, refreshToken, inviteUser, setPassword, getAllUsers, updateUser, deleteUser, getUserByInviteToken } = require("../controllers/companyAuthController");
const requireSuperadmin = require("../middlewares/requireSuperadmin");

const router = express.Router();

// Public: signing in, and accepting an invite.
router.post("/login", companyLogin);
router.post("/login-with-google", loginWithGoogle);
router.post("/refresh", refreshToken);
router.post("/set-password", setPassword);
router.post("/get-invite-user", getUserByInviteToken);

// Account management is for signed-in superadmins only. These were open to
// anyone, which let a stranger create a superadmin or rewrite any admin's
// email and role.
router.post("/signup", requireSuperadmin, companySignup);
router.post("/invite-user", requireSuperadmin, inviteUser);
router.get("/users", requireSuperadmin, getAllUsers);
router.post("/users/:id", requireSuperadmin, updateUser);
router.delete("/users/:id", requireSuperadmin, deleteUser);


module.exports = router;
