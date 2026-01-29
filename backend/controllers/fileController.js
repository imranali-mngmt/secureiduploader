const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const File = require('../models/File');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const encryptionService = require('../services/encryptionService');
const logger = require('../utils/logger');

/**
 * Upload files
 * @route POST /api/files/upload
 */
exports.uploadFiles = asyncHandler(async (req, res, next) => {
    const files = req.files || (req.file ? [req.file] : []);

    if (files.length === 0) {
        return next(new AppError('No files uploaded', 400));
    }

    // Get user with encryption key
    const user = await User.findById(req.user.id).select('+encryptionKey');

    if (!user) {
        // Clean up uploaded files
        files.forEach(file => {
            if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }
        });
        return next(new AppError('User not found', 404));
    }

    // Check storage limit
    const totalSize = files.reduce((acc, file) => acc + file.size, 0);
    if (user.storageUsed + totalSize > user.storageLimit) {
        // Clean up uploaded files
        files.forEach(file => {
            if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }
        });
        return next(new AppError('Storage limit exceeded', 400));
    }

    const uploadedFiles = [];
    const errors = [];

    for (const file of files) {
        try {
            // Generate checksums
            const originalChecksum = await encryptionService.generateFileChecksum(file.path);

            // Read original file
            const originalData = fs.readFileSync(file.path);

            // Encrypt the file
            const encrypted = encryptionService.encrypt(originalData, user.encryptionKey);

            // Write encrypted data back
            fs.writeFileSync(file.path, encrypted.data);

            // Generate encrypted file checksum
            const encryptedChecksum = await encryptionService.generateFileChecksum(file.path);

            // Create file record
            const fileRecord = await File.create({
                user: user._id,
                originalName: file.originalname,
                encryptedName: file.filename,
                mimeType: file.mimetype,
                originalSize: file.size,
                encryptedSize: encrypted.data.length,
                checksum: originalChecksum,
                encryptedChecksum: encryptedChecksum,
                storagePath: file.path,
                folder: req.body.folder || '/',
                tags: req.body.tags ? req.body.tags.split(',').map(t => t.trim()) : [],
                description: req.body.description || '',
                encryptionMetadata: encrypted.metadata
            });

            uploadedFiles.push({
                id: fileRecord._id,
                name: fileRecord.originalName,
                size: fileRecord.originalSize,
                formattedSize: fileRecord.formattedSize,
                mimeType: fileRecord.mimeType,
                category: fileRecord.category,
                uploadedAt: fileRecord.createdAt
            });

            logger.info(`File uploaded: ${fileRecord.originalName} by user ${user.email}`);

        } catch (error) {
            logger.error(`Failed to upload file ${file.originalname}:`, error);

            // Clean up the file
            if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }

            errors.push({
                filename: file.originalname,
                error: error.message
            });
        }
    }

    // Update user storage
    const successfulSize = uploadedFiles.reduce((acc, file) => acc + file.size, 0);
    if (successfulSize > 0) {
        await user.updateStorageUsed(successfulSize);
    }

    res.status(201).json({
        success: true,
        message: `Successfully uploaded ${uploadedFiles.length} file(s)`,
        data: {
            files: uploadedFiles,
            errors: errors.length > 0 ? errors : undefined
        }
    });
});

/**
 * Get all files for current user
 * @route GET /api/files
 */
exports.getFiles = asyncHandler(async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Build query
    const query = { user: req.user.id };

    // Filter by folder
    if (req.query.folder) {
        query.folder = req.query.folder;
    }

    // Filter by category
    if (req.query.category) {
        const categoryMimeTypes = {
            image: /^image\//,
            document: /^application\/(pdf|msword|vnd\.)/,
            video: /^video\//,
            audio: /^audio\//,
            archive: /^application\/(zip|x-rar|x-7z|gzip)/
        };

        if (categoryMimeTypes[req.query.category]) {
            query.mimeType = categoryMimeTypes[req.query.category];
        }
    }

    // Search
    if (req.query.search) {
        query.$text = { $search: req.query.search };
    }

    // Sort
    let sort = { createdAt: -1 };
    if (req.query.sort) {
        const sortField = req.query.sort.startsWith('-')
            ? req.query.sort.substring(1)
            : req.query.sort;
        const sortOrder = req.query.sort.startsWith('-') ? -1 : 1;
        sort = { [sortField]: sortOrder };
    }

    const [files, total] = await Promise.all([
        File.find(query)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .select('-storagePath -accessLog'),
        File.countDocuments(query)
    ]);

    res.status(200).json({
        success: true,
        data: {
            files: files.map(file => ({
                id: file._id,
                name: file.originalName,
                size: file.originalSize,
                formattedSize: file.formattedSize,
                mimeType: file.mimeType,
                category: file.category,
                extension: file.extension,
                folder: file.folder,
                tags: file.tags,
                description: file.description,
                isPublic: file.isPublic,
                hasShare: !!file.shareToken,
                downloadCount: file.downloadCount,
                createdAt: file.createdAt,
                updatedAt: file.updatedAt
            })),
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        }
    });
});

/**
 * Get single file details
 * @route GET /api/files/:id
 */
exports.getFile = asyncHandler(async (req, res, next) => {
    const file = await File.findOne({
        _id: req.params.id,
        user: req.user.id
    }).select('-storagePath');

    if (!file) {
        return next(new AppError('File not found', 404));
    }

    res.status(200).json({
        success: true,
        data: {
            file: {
                id: file._id,
                name: file.originalName,
                size: file.originalSize,
                formattedSize: file.formattedSize,
                mimeType: file.mimeType,
                category: file.category,
                extension: file.extension,
                folder: file.folder,
                tags: file.tags,
                description: file.description,
                isPublic: file.isPublic,
                shareToken: file.shareToken,
                shareExpires: file.shareExpires,
                downloadCount: file.downloadCount,
                maxDownloads: file.maxDownloads,
                checksum: file.checksum,
                createdAt: file.createdAt,
                updatedAt: file.updatedAt
            }
        }
    });
});

/**
 * Download file
 * @route GET /api/files/:id/download
 */
exports.downloadFile = asyncHandler(async (req, res, next) => {
    // Get user with encryption key
    const user = await User.findById(req.user.id).select('+encryptionKey');

    if (!user) {
        return next(new AppError('User not found', 404));
    }

    const file = await File.findOne({
        _id: req.params.id,
        user: req.user.id
    }).select('+storagePath');

    if (!file) {
        return next(new AppError('File not found', 404));
    }

    // Check if file exists on disk
    if (!fs.existsSync(file.storagePath)) {
        logger.error(`File not found on disk: ${file.storagePath}`);
        return next(new AppError('File not found on server', 404));
    }

    try {
        // Read encrypted file
        const encryptedData = fs.readFileSync(file.storagePath);

        // Decrypt the file
        const decrypted = encryptionService.decrypt(encryptedData, user.encryptionKey);

        // Verify checksum
        const checksum = encryptionService.hash(decrypted.data);
        if (checksum !== file.checksum) {
            logger.error(`Checksum mismatch for file: ${file._id}`);
            return next(new AppError('File integrity check failed', 500));
        }

        // Update download count
        file.downloadCount += 1;
        file.logAccess('download', req.ip, req.get('User-Agent'));
        await file.save();

        // Set response headers
        res.setHeader('Content-Type', file.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
        res.setHeader('Content-Length', decrypted.data.length);
        res.setHeader('X-Content-Type-Options', 'nosniff');

        // Send decrypted file
        res.send(decrypted.data);

        logger.info(`File downloaded: ${file.originalName} by user ${user.email}`);

    } catch (error) {
        logger.error('Download error:', error);
        return next(new AppError('Failed to download file: ' + error.message, 500));
    }
});

/**
 * Generate share link
 * @route POST /api/files/:id/share
 */
exports.shareFile = asyncHandler(async (req, res, next) => {
    const { expiresIn, maxDownloads, password } = req.body;

    const file = await File.findOne({
        _id: req.params.id,
        user: req.user.id
    });

    if (!file) {
        return next(new AppError('File not found', 404));
    }

    // Generate share token
    const expireTime = expiresIn
        ? parseInt(expiresIn) * 24 * 60 * 60 * 1000
        : 7 * 24 * 60 * 60 * 1000; // Default 7 days

    file.generateShareToken(expireTime);

    if (maxDownloads) {
        file.maxDownloads = parseInt(maxDownloads);
    }

    if (password) {
        const bcrypt = require('bcryptjs');
        file.sharePassword = await bcrypt.hash(password, 10);
    }

    file.logAccess('share', req.ip, req.get('User-Agent'));
    await file.save();

    const shareUrl = `${req.protocol}://${req.get('host')}/api/files/shared/${file.shareToken}`;

    logger.info(`Share link created for file: ${file.originalName}`);

    res.status(200).json({
        success: true,
        message: 'Share link created successfully',
        data: {
            shareUrl,
            shareToken: file.shareToken,
            expiresAt: file.shareExpires,
            maxDownloads: file.maxDownloads,
            hasPassword: !!password
        }
    });
});

/**
 * Download shared file
 * @route GET /api/files/shared/:token
 */
exports.downloadSharedFile = asyncHandler(async (req, res, next) => {
    const { token } = req.params;
    const { password } = req.query;

    const file = await File.findOne({ shareToken: token })
        .select('+storagePath +sharePassword');

    if (!file) {
        return next(new AppError('Shared file not found or link expired', 404));
    }

    // Check if share is valid
    if (!file.isShareValid()) {
        return next(new AppError('Share link has expired or download limit reached', 410));
    }

    // Check password if required
    if (file.sharePassword) {
        if (!password) {
            return res.status(401).json({
                success: false,
                requiresPassword: true,
                message: 'This file requires a password'
            });
        }

        const bcrypt = require('bcryptjs');
        const isValidPassword = await bcrypt.compare(password, file.sharePassword);

        if (!isValidPassword) {
            return next(new AppError('Invalid password', 401));
        }
    }

    // Get file owner for encryption key
    const owner = await User.findById(file.user).select('+encryptionKey');

    if (!owner) {
        return next(new AppError('File owner not found', 404));
    }

    // Check if file exists on disk
    if (!fs.existsSync(file.storagePath)) {
        logger.error(`Shared file not found on disk: ${file.storagePath}`);
        return next(new AppError('File not found on server', 404));
    }

    try {
        // Read encrypted file
        const encryptedData = fs.readFileSync(file.storagePath);

        // Decrypt the file
        const decrypted = encryptionService.decrypt(encryptedData, owner.encryptionKey);

        // Verify checksum
        const checksum = encryptionService.hash(decrypted.data);
        if (checksum !== file.checksum) {
            logger.error(`Checksum mismatch for shared file: ${file._id}`);
            return next(new AppError('File integrity check failed', 500));
        }

        // Update download count
        file.downloadCount += 1;
        file.logAccess('download', req.ip, req.get('User-Agent'));
        await file.save();

        // Set response headers
        res.setHeader('Content-Type', file.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
        res.setHeader('Content-Length', decrypted.data.length);
        res.setHeader('X-Content-Type-Options', 'nosniff');

        // Send decrypted file
        res.send(decrypted.data);

        logger.info(`Shared file downloaded: ${file.originalName}`);

    } catch (error) {
        logger.error('Shared download error:', error);
        return next(new AppError('Failed to download file: ' + error.message, 500));
    }
});

/**
 * Revoke share link
 * @route DELETE /api/files/:id/share
 */
exports.revokeShare = asyncHandler(async (req, res, next) => {
    const file = await File.findOne({
        _id: req.params.id,
        user: req.user.id
    });

    if (!file) {
        return next(new AppError('File not found', 404));
    }

    file.shareToken = undefined;
    file.shareExpires = undefined;
    file.sharePassword = undefined;
    file.maxDownloads = undefined;
    await file.save();

    logger.info(`Share link revoked for file: ${file.originalName}`);

    res.status(200).json({
        success: true,
        message: 'Share link revoked successfully'
    });
});

/**
 * Update file details
 * @route PATCH /api/files/:id
 */
exports.updateFile = asyncHandler(async (req, res, next) => {
    const { originalName, folder, tags, description } = req.body;

    const file = await File.findOne({
        _id: req.params.id,
        user: req.user.id
    });

    if (!file) {
        return next(new AppError('File not found', 404));
    }

    // Update allowed fields
    if (originalName) {
        // Validate filename
        if (originalName.length > 255) {
            return next(new AppError('Filename cannot exceed 255 characters', 400));
        }
        // Sanitize filename
        const sanitizedName = originalName.replace(/[<>:"/\\|?*]/g, '_');
        file.originalName = sanitizedName;
    }

    if (folder !== undefined) {
        // Validate folder path
        if (folder.length > 500) {
            return next(new AppError('Folder path too long', 400));
        }
        file.folder = folder.startsWith('/') ? folder : '/' + folder;
    }

    if (tags !== undefined) {
        if (Array.isArray(tags)) {
            file.tags = tags.slice(0, 20).map(t => t.trim().substring(0, 50));
        } else if (typeof tags === 'string') {
            file.tags = tags.split(',').slice(0, 20).map(t => t.trim().substring(0, 50));
        }
    }

    if (description !== undefined) {
        file.description = description.substring(0, 500);
    }

    file.logAccess('update', req.ip, req.get('User-Agent'));
    await file.save();

    logger.info(`File updated: ${file.originalName}`);

    res.status(200).json({
        success: true,
        message: 'File updated successfully',
        data: {
            file: {
                id: file._id,
                name: file.originalName,
                folder: file.folder,
                tags: file.tags,
                description: file.description,
                updatedAt: file.updatedAt
            }
        }
    });
});

/**
 * Delete file
 * @route DELETE /api/files/:id
 */
exports.deleteFile = asyncHandler(async (req, res, next) => {
    const { permanent } = req.query;

    const file = await File.findOne({
        _id: req.params.id,
        user: req.user.id
    }).select('+storagePath').setOptions({ includeDeleted: true });

    if (!file) {
        return next(new AppError('File not found', 404));
    }

    if (permanent === 'true') {
        // Permanent delete
        try {
            // Delete file from disk
            if (fs.existsSync(file.storagePath)) {
                fs.unlinkSync(file.storagePath);
            }

            // Update user storage
            const user = await User.findById(req.user.id);
            if (user) {
                user.storageUsed = Math.max(0, user.storageUsed - file.originalSize);
                await user.save({ validateBeforeSave: false });
            }

            // Delete from database
            await file.deleteOne();

            logger.info(`File permanently deleted: ${file.originalName}`);

            res.status(200).json({
                success: true,
                message: 'File permanently deleted'
            });

        } catch (error) {
            logger.error('Delete error:', error);
            return next(new AppError('Failed to delete file: ' + error.message, 500));
        }
    } else {
        // Soft delete
        file.softDelete();
        file.logAccess('delete', req.ip, req.get('User-Agent'));
        await file.save();

        logger.info(`File soft deleted: ${file.originalName}`);

        res.status(200).json({
            success: true,
            message: 'File moved to trash'
        });
    }
});

/**
 * Restore deleted file
 * @route POST /api/files/:id/restore
 */
exports.restoreFile = asyncHandler(async (req, res, next) => {
    const file = await File.findOne({
        _id: req.params.id,
        user: req.user.id,
        isDeleted: true
    }).setOptions({ includeDeleted: true });

    if (!file) {
        return next(new AppError('File not found in trash', 404));
    }

    file.restore();
    await file.save();

    logger.info(`File restored: ${file.originalName}`);

    res.status(200).json({
        success: true,
        message: 'File restored successfully',
        data: {
            file: {
                id: file._id,
                name: file.originalName
            }
        }
    });
});

/**
 * Get deleted files (trash)
 * @route GET /api/files/trash
 */
exports.getTrash = asyncHandler(async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [files, total] = await Promise.all([
        File.find({ user: req.user.id, isDeleted: true })
            .setOptions({ includeDeleted: true })
            .sort({ deletedAt: -1 })
            .skip(skip)
            .limit(limit)
            .select('-storagePath -accessLog'),
        File.countDocuments({ user: req.user.id, isDeleted: true })
            .setOptions({ includeDeleted: true })
    ]);

    res.status(200).json({
        success: true,
        data: {
            files: files.map(file => ({
                id: file._id,
                name: file.originalName,
                size: file.originalSize,
                formattedSize: file.formattedSize,
                mimeType: file.mimeType,
                category: file.category,
                deletedAt: file.deletedAt
            })),
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        }
    });
});

/**
 * Empty trash
 * @route DELETE /api/files/trash
 */
exports.emptyTrash = asyncHandler(async (req, res, next) => {
    const files = await File.find({ user: req.user.id, isDeleted: true })
        .setOptions({ includeDeleted: true })
        .select('+storagePath');

    let deletedCount = 0;
    let freedSpace = 0;

    for (const file of files) {
        try {
            // Delete from disk
            if (fs.existsSync(file.storagePath)) {
                fs.unlinkSync(file.storagePath);
            }

            freedSpace += file.originalSize;
            await file.deleteOne();
            deletedCount++;

        } catch (error) {
            logger.error(`Failed to delete file ${file._id}:`, error);
        }
    }

    // Update user storage
    if (freedSpace > 0) {
        const user = await User.findById(req.user.id);
        if (user) {
            user.storageUsed = Math.max(0, user.storageUsed - freedSpace);
            await user.save({ validateBeforeSave: false });
        }
    }

    logger.info(`Trash emptied: ${deletedCount} files deleted`);

    res.status(200).json({
        success: true,
        message: `${deletedCount} file(s) permanently deleted`,
        data: {
            deletedCount,
            freedSpace
        }
    });
});

/**
 * Get file statistics
 * @route GET /api/files/stats
 */
exports.getStats = asyncHandler(async (req, res, next) => {
    const userId = req.user.id;

    const [
        totalFiles,
        totalSize,
        categoryStats,
        recentUploads,
        topDownloaded
    ] = await Promise.all([
        // Total files count
        File.countDocuments({ user: userId }),

        // Total size
        File.aggregate([
            { $match: { user: req.user._id, isDeleted: { $ne: true } } },
            { $group: { _id: null, total: { $sum: '$originalSize' } } }
        ]),

        // Category statistics
        File.aggregate([
            { $match: { user: req.user._id, isDeleted: { $ne: true } } },
            {
                $group: {
                    _id: {
                        $switch: {
                            branches: [
                                { case: { $regexMatch: { input: '$mimeType', regex: /^image\// } }, then: 'image' },
                                { case: { $regexMatch: { input: '$mimeType', regex: /^video\// } }, then: 'video' },
                                { case: { $regexMatch: { input: '$mimeType', regex: /^audio\// } }, then: 'audio' },
                                { case: { $regexMatch: { input: '$mimeType', regex: /^application\/(pdf|msword|vnd\.)/ } }, then: 'document' },
                                { case: { $regexMatch: { input: '$mimeType', regex: /^application\/(zip|x-rar|x-7z|gzip)/ } }, then: 'archive' }
                            ],
                            default: 'other'
                        }
                    },
                    count: { $sum: 1 },
                    size: { $sum: '$originalSize' }
                }
            }
        ]),

        // Recent uploads
        File.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('originalName mimeType originalSize createdAt'),

        // Top downloaded
        File.find({ user: userId, downloadCount: { $gt: 0 } })
            .sort({ downloadCount: -1 })
            .limit(5)
            .select('originalName downloadCount')
    ]);

    res.status(200).json({
        success: true,
        data: {
            totalFiles,
            totalSize: totalSize[0]?.total || 0,
            categoryStats: categoryStats.reduce((acc, cat) => {
                acc[cat._id] = { count: cat.count, size: cat.size };
                return acc;
            }, {}),
            recentUploads: recentUploads.map(f => ({
                name: f.originalName,
                mimeType: f.mimeType,
                size: f.originalSize,
                uploadedAt: f.createdAt
            })),
            topDownloaded: topDownloaded.map(f => ({
                name: f.originalName,
                downloads: f.downloadCount
            }))
        }
    });
});

/**
 * Bulk delete files
 * @route POST /api/files/bulk-delete
 */
exports.bulkDelete = asyncHandler(async (req, res, next) => {
    const { fileIds, permanent } = req.body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
        return next(new AppError('Please provide file IDs to delete', 400));
    }

    if (fileIds.length > 100) {
        return next(new AppError('Cannot delete more than 100 files at once', 400));
    }

    const files = await File.find({
        _id: { $in: fileIds },
        user: req.user.id
    }).select('+storagePath').setOptions({ includeDeleted: true });

    if (files.length === 0) {
        return next(new AppError('No files found', 404));
    }

    let deletedCount = 0;
    let freedSpace = 0;
    const errors = [];

    for (const file of files) {
        try {
            if (permanent === true) {
                // Delete from disk
                if (fs.existsSync(file.storagePath)) {
                    fs.unlinkSync(file.storagePath);
                }
                freedSpace += file.originalSize;
                await file.deleteOne();
            } else {
                file.softDelete();
                await file.save();
            }
            deletedCount++;
        } catch (error) {
            logger.error(`Failed to delete file ${file._id}:`, error);
            errors.push({ id: file._id, error: error.message });
        }
    }

    // Update user storage for permanent deletes
    if (permanent && freedSpace > 0) {
        const user = await User.findById(req.user.id);
        if (user) {
            user.storageUsed = Math.max(0, user.storageUsed - freedSpace);
            await user.save({ validateBeforeSave: false });
        }
    }

    logger.info(`Bulk delete: ${deletedCount} files deleted`);

    res.status(200).json({
        success: true,
        message: `${deletedCount} file(s) ${permanent ? 'permanently deleted' : 'moved to trash'}`,
        data: {
            deletedCount,
            freedSpace: permanent ? freedSpace : 0,
            errors: errors.length > 0 ? errors : undefined
        }
    });
});

/**
 * Get folders
 * @route GET /api/files/folders
 */
exports.getFolders = asyncHandler(async (req, res, next) => {
    const folders = await File.distinct('folder', { user: req.user.id });

    // Build folder tree
    const folderTree = {};
    folders.forEach(folder => {
        const parts = folder.split('/').filter(Boolean);
        let current = folderTree;
        parts.forEach((part, index) => {
            if (!current[part]) {
                current[part] = { _files: 0, _subfolders: {} };
            }
            if (index === parts.length - 1) {
                current[part]._path = folder;
            }
            current = current[part]._subfolders;
        });
    });

    // Get file counts per folder
    const folderCounts = await File.aggregate([
        { $match: { user: req.user._id, isDeleted: { $ne: true } } },
        { $group: { _id: '$folder', count: { $sum: 1 } } }
    ]);

    const countsMap = folderCounts.reduce((acc, f) => {
        acc[f._id] = f.count;
        return acc;
    }, {});

    res.status(200).json({
        success: true,
        data: {
            folders: folders.sort(),
            folderCounts: countsMap
        }
    });
});

/**
 * Move files to folder
 * @route POST /api/files/move
 */
exports.moveFiles = asyncHandler(async (req, res, next) => {
    const { fileIds, targetFolder } = req.body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
        return next(new AppError('Please provide file IDs to move', 400));
    }

    if (targetFolder === undefined) {
        return next(new AppError('Please provide target folder', 400));
    }

    const folder = targetFolder.startsWith('/') ? targetFolder : '/' + targetFolder;

    const result = await File.updateMany(
        { _id: { $in: fileIds }, user: req.user.id },
        { $set: { folder } }
    );

    logger.info(`${result.modifiedCount} files moved to ${folder}`);

    res.status(200).json({
        success: true,
        message: `${result.modifiedCount} file(s) moved to ${folder}`,
        data: {
            movedCount: result.modifiedCount
        }
    });
});

/**
 * Preview file (for images)
 * @route GET /api/files/:id/preview
 */
exports.previewFile = asyncHandler(async (req, res, next) => {
    const user = await User.findById(req.user.id).select('+encryptionKey');

    if (!user) {
        return next(new AppError('User not found', 404));
    }

    const file = await File.findOne({
        _id: req.params.id,
        user: req.user.id
    }).select('+storagePath');

    if (!file) {
        return next(new AppError('File not found', 404));
    }

    // Only allow preview for images
    if (!file.mimeType.startsWith('image/')) {
        return next(new AppError('Preview only available for images', 400));
    }

    if (!fs.existsSync(file.storagePath)) {
        return next(new AppError('File not found on server', 404));
    }

    try {
        const encryptedData = fs.readFileSync(file.storagePath);
        const decrypted = encryptionService.decrypt(encryptedData, user.encryptionKey);

        file.logAccess('view', req.ip, req.get('User-Agent'));
        await file.save();

        res.setHeader('Content-Type', file.mimeType);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.send(decrypted.data);

    } catch (error) {
        logger.error('Preview error:', error);
        return next(new AppError('Failed to preview file', 500));
    }
});