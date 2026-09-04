const router = require('express').Router();
const c = require('../controllers/acadhrSyncController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);
router.use(requireRole('admin')); // fetching from the AcadHr schema is admin-only

router.get('/status', c.status);
router.get('/tutors/preview', c.previewTutors);
router.post('/tutors/fetch', c.fetchTutors);

module.exports = router;
