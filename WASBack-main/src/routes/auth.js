const router = require('express').Router();
const { login, getMe, createDemo } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/login', login);
router.post('/demo', createDemo);
router.get('/me', authenticate, getMe);

module.exports = router;
