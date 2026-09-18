const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth.middleware');

router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authenticate, authController.logout);

router.get('/me', authenticate, (req, res) => {
  res.status(200).json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      managerId: req.user.manager_id,
      // decoded from the JWT by auth.middleware, not re-queried here
      workspaces: req.tokenPayload?.workspaces || []
    }
  });
});

module.exports = router;
