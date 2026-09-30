const express = require("express");
const { companySignup, companyLogin, loginWithGoogle, refreshToken, inviteUser, setPassword, getAllUsers, updateUser, deleteUser, getUserByInviteToken } = require("../controllers/companyAuthController");

const router = express.Router();

router.post("/signup", companySignup);
router.post("/login", companyLogin);
router.post("/login-with-google", loginWithGoogle);
router.post("/refresh", refreshToken);
router.post("/invite-user", inviteUser);
router.post("/set-password", setPassword);
router.get("/users", getAllUsers);
router.post("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);
router.post("/get-invite-user", getUserByInviteToken);


module.exports = router;
