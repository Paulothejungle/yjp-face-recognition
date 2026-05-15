const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/attendanceController');
const { authenticate, adminOnly } = require('../middleware/authMiddleware');

router.post('/checkin', authenticate, ctrl.checkIn);
router.post('/checkout', authenticate, ctrl.checkOut);
router.get('/me', authenticate, ctrl.getMyAttendance);
router.get('/today-summary', authenticate, adminOnly, ctrl.todaySummary);
router.get('/', authenticate, adminOnly, ctrl.getAll);

module.exports = router;
