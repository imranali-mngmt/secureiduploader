const express = require('express');
const router = express.Router();
const fileController = require('../controllers/fileController');
const { protect } = require('../middleware/auth');
const { uploadMultiple } = require('../middleware/upload');
const { downloadLimiter } = require('../middleware/rateLimiter');

// Public routes (shared files)
router.get('/shared/:token', downloadLimiter, fileController.downloadSharedFile);

// Protected routes
router.use(protect);

// File operations
router.post('/upload', uploadMultiple('files', 10), fileController.uploadFiles);
router.get('/', fileController.getFiles);
router.get('/stats', fileController.getStats);
router.get('/folders', fileController.getFolders);
router.get('/trash', fileController.getTrash);
router.delete('/trash', fileController.emptyTrash);
router.post('/bulk-delete', fileController.bulkDelete);
router.post('/move', fileController.moveFiles);

// Single file operations
router.get('/:id', fileController.getFile);
router.patch('/:id', fileController.updateFile);
router.delete('/:id', fileController.deleteFile);
router.get('/:id/download', downloadLimiter, fileController.downloadFile);
router.get('/:id/preview', fileController.previewFile);
router.post('/:id/share', fileController.shareFile);
router.delete('/:id/share', fileController.revokeShare);
router.post('/:id/restore', fileController.restoreFile);

module.exports = router;