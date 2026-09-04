const router = require('express').Router();
const c = require('../controllers/tutorController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);
router.get('/', c.list);
router.post('/', c.create);
router.patch('/:id/registration', c.setRegistration);
router.patch('/:id/followups', c.setFollowUps);
router.get('/:id', c.getOne);
router.patch('/:id/plan', c.setPlan);
router.patch('/:id/jobfollowup', c.setJobFollowUp);
router.patch('/:id/assign', requireRole('admin'), c.assign);

module.exports = router;
