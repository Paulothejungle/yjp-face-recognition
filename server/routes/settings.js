const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/settingsController');
const { authenticate, adminOnly } = require('../middleware/authMiddleware');

router.get('/', authenticate, ctrl.getSettings);
router.put('/', authenticate, adminOnly, ctrl.updateSettings);

module.exports = router;
