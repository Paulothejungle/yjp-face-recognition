const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/employeeController');
const { authenticate, adminOnly } = require('../middleware/authMiddleware');

router.get('/', authenticate, adminOnly, ctrl.getAll);
router.get('/with-descriptors', authenticate, ctrl.getAllWithDescriptors);
router.post('/', authenticate, adminOnly, ctrl.create);
router.put('/:id', authenticate, adminOnly, ctrl.update);
router.delete('/:id', authenticate, adminOnly, ctrl.remove);
router.delete('/:id/face', authenticate, adminOnly, ctrl.resetFace);
router.post('/:id/face', authenticate, adminOnly, ctrl.saveFaceDescriptor);

module.exports = router;
