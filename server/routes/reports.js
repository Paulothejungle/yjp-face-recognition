const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reportController');
const { authenticate, adminOnly } = require('../middleware/authMiddleware');

router.get('/pdf', authenticate, adminOnly, ctrl.downloadPDF);
router.get('/excel', authenticate, adminOnly, ctrl.downloadExcel);
router.get('/data', authenticate, adminOnly, ctrl.getData);

module.exports = router;
