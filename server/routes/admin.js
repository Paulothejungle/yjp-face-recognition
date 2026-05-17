const express = require('express');
const router = express.Router();
const { cleanupMetadata } = require('../controllers/adminController');
const { authenticate, adminOnly } = require('../middleware/authMiddleware');

// Endpoint untuk membersihkan photo_url dari user_metadata
router.post('/cleanup-metadata', authenticate, adminOnly, cleanupMetadata);

module.exports = router;
