const router = require('express').Router();
const c = require('../controllers/dashboardController');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);
router.get('/stats', c.stats);
router.get('/directory', c.directory);
router.get('/subjects', c.subjects);
router.get('/classes', c.classes);
router.get('/lead-subjects', c.leadSubjects);

module.exports = router;
