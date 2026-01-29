const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

// Ensure upload directory exists
const uploadDir = process.env.UPLOAD_PATH || './uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Create user-specific folder
        const userFolder = path.join(uploadDir, req.user.id);
        if (!fs.existsSync(userFolder)) {
            fs.mkdirSync(userFolder, { recursive: true });
        }
        cb(null, userFolder);
    },
    filename: (req, file, cb) => {
        // Generate unique filename
        const uniqueId = uuidv4();
        const extension = path.extname(file.originalname);
        const filename = `${uniqueId}${extension}.encrypted`;
        cb(null, filename);
    }
});

// Allowed file types
const allowedMimeTypes = [
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/bmp',
    'image/tiff',
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    // Archives
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'application/gzip',
    // Videos
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/x-msvideo',
    'video/webm',
    // Audio
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/webm',
    // Others
    'application/json',
    'application/xml',
    'application/octet-stream'
];

// File filter
const fileFilter = (req, file, cb) => {
    // Check mime type
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        logger.warn(`Rejected file upload: ${file.originalname} (${file.mimetype})`);
        cb(new AppError(`File type not allowed: ${file.mimetype}`, 400), false);
    }
};

// Multer configuration
const upload = multer({
    storage: storage,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 157286400, // 150MB
        files: 10 // Maximum 10 files per upload
    },
    fileFilter: fileFilter
});

// Error handling wrapper
const uploadMiddleware = (fieldName, maxCount = 10) => {
    return (req, res, next) => {
        const uploadHandler = maxCount === 1 
            ? upload.single(fieldName) 
            : upload.array(fieldName, maxCount);

        uploadHandler(req, res, (err) => {
            if (err) {
                logger.error('Upload error:', err);

                if (err instanceof multer.MulterError) {
                    if (err.code === 'LIMIT_FILE_SIZE') {
                        return next(new AppError('File too large. Maximum size is 150MB.', 400));
                    }
                    if (err.code === 'LIMIT_FILE_COUNT') {
                        return next(new AppError(`Too many files. Maximum is ${maxCount} files.`, 400));
                    }
                    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
                        return next(new AppError('Unexpected file field.', 400));
                    }
                    return next(new AppError(err.message, 400));
                }

                return next(err);
            }

            // Validate that at least one file was uploaded
            if (!req.file && (!req.files || req.files.length === 0)) {
                return next(new AppError('Please upload at least one file.', 400));
            }

            next();
        });
    };
};

module.exports = {
    uploadSingle: (fieldName) => uploadMiddleware(fieldName, 1),
    uploadMultiple: (fieldName, maxCount) => uploadMiddleware(fieldName, maxCount),
    upload
};