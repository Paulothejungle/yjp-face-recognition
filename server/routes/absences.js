const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/absenceController');
const { authenticate, adminOnly } = require('../middleware/authMiddleware');

router.get('/', authenticate, ctrl.getAll);
router.post('/', authenticate, ctrl.create);
router.post('/process-alpa', authenticate, adminOnly, ctrl.processAlpa);
router.put('/:id/confirm', authenticate, adminOnly, ctrl.confirm);
router.put('/:id', authenticate, adminOnly, ctrl.update);

module.exports = router;
