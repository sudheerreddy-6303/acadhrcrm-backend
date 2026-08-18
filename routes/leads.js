const router = require('express').Router();
const c = require('../controllers/leadController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', c.list);
router.get('/:id', c.getOne);
router.post('/', c.create);
router.post('/import', c.importLeads);
router.post('/check-duplicates', c.checkDuplicates);
router.patch('/bulk-assign', requireRole('admin'), c.bulkAssign);
router.put('/:id', c.update);
router.post('/:id/activities', c.addActivity);

router.patch('/:id/assign', requireRole('admin'), c.assign);
router.delete('/:id', requireRole('admin'), c.remove);

module.exports = router;
