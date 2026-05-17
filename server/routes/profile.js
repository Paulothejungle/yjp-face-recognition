const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/profileController');
const { authenticate } = require('../middleware/authMiddleware');

router.get('/me', authenticate, ctrl.getProfile);
router.put('/me', authenticate, ctrl.updateProfile);
router.put('/me/photo', authenticate, ctrl.uploadPhoto);
router.put('/me/password', authenticate, ctrl.changePassword);

module.exports = router;
