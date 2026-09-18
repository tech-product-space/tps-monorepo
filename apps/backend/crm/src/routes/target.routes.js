const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth.middleware');
const controller = require('../controllers/target.controller');

router.use(authenticate);

router.get('/pacing', controller.listPacing);
router.get('/', controller.listAll);
router.post('/', controller.create);
router.patch('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
