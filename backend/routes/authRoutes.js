const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);

// Protected routes
router.use(protect);

router.get('/me', authController.getMe);
router.post('/logout', authController.logout);
router.patch('/update-profile', authController.updateProfile);
router.patch('/update-password', authController.updatePassword);
router.delete('/delete-account', authController.deleteAccount);
router.get('/storage', authController.getStorageInfo);

module.exports = router;