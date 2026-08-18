const router = require('express').Router();
const c = require('../controllers/userController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

router.get('/telecallers', c.telecallers);
router.get('/:id/stats', requireRole('admin'), c.telecallerStats);
router.get('/:id/leads', requireRole('admin'), c.telecallerLeads);
router.get('/:id/activities', requireRole('admin'), c.telecallerActivities);

router.get('/', requireRole('admin'), c.list);
router.post('/', requireRole('admin'), c.create);
router.patch('/:id', requireRole('admin'), c.update);

module.exports = router;
