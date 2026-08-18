const router = require('express').Router();
const c = require('../controllers/teacherController');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);
router.get('/', c.list);
router.post('/', c.create);
router.patch('/:id/registration', c.setRegistration);

module.exports = router;
