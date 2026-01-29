const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'File must belong to a user'],
        index: true
    },
    originalName: {
        type: String,
        required: [true, 'Original filename is required'],
        trim: true,
        maxlength: [255, 'Filename cannot exceed 255 characters']
    },
    encryptedName: {
        type: String,
        required: [true, 'Encrypted filename is required'],
        unique: true
    },
    mimeType: {
        type: String,
        required: [true, 'MIME type is required']
    },
    originalSize: {
        type: Number,
        required: [true, 'Original file size is required'],
        min: [0, 'File size cannot be negative']
    },
    encryptedSize: {
        type: Number,
        required: [true, 'Encrypted file size is required'],
        min: [0, 'File size cannot be negative']
    },
    checksum: {
        type: String,
        required: [true, 'File checksum is required']
    },
    encryptedChecksum: {
        type: String,
        required: [true, 'Encrypted file checksum is required']
    },
    storagePath: {
        type: String,
        required: [true, 'Storage path is required'],
        select: false
    },
    isPublic: {
        type: Boolean,
        default: false
    },
    shareToken: {
        type: String,
        unique: true,
        sparse: true
    },
    shareExpires: {
        type: Date
    },
    sharePassword: {
        type: String,
        select: false
    },
    downloadCount: {
        type: Number,
        default: 0
    },
    maxDownloads: {
        type: Number,
        default: null // null means unlimited
    },
    tags: [{
        type: String,
        trim: true,
        maxlength: [50, 'Tag cannot exceed 50 characters']
    }],
    description: {
        type: String,
        maxlength: [500, 'Description cannot exceed 500 characters']
    },
    folder: {
        type: String,
        default: '/',
        trim: true
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    deletedAt: {
        type: Date
    },
    metadata: {
        width: Number,
        height: Number,
        duration: Number,
        pages: Number,
        encoding: String
    },
    encryptionMetadata: {
        algorithm: {
            type: String,
            default: 'aes-256-gcm'
        },
        keyDerivation: {
            type: String,
            default: 'pbkdf2'
        },
        iterations: {
            type: Number,
            default: 100000
        }
    },
    accessLog: [{
        action: {
            type: String,
            enum: ['view', 'download', 'share', 'update', 'delete']
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        ip: String,
        userAgent: String
    }]
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes
fileSchema.index({ user: 1, createdAt: -1 });
fileSchema.index({ user: 1, folder: 1 });
fileSchema.index({ shareToken: 1 });
fileSchema.index({ originalName: 'text', tags: 'text', description: 'text' });
fileSchema.index({ isDeleted: 1, deletedAt: 1 });

// Virtual for formatted file size
fileSchema.virtual('formattedSize').get(function() {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (this.originalSize === 0) return '0 Bytes';
    const i = parseInt(Math.floor(Math.log(this.originalSize) / Math.log(1024)));
    return Math.round(this.originalSize / Math.pow(1024, i), 2) + ' ' + sizes[i];
});

// Virtual for file extension
fileSchema.virtual('extension').get(function() {
    const parts = this.originalName.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
});

// Virtual for file type category
fileSchema.virtual('category').get(function() {
    const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff'];
    const documentTypes = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'];
    const videoTypes = ['mp4', 'mpeg', 'mov', 'avi', 'webm'];
    const audioTypes = ['mp3', 'wav', 'ogg'];
    const archiveTypes = ['zip', 'rar', '7z', 'gz'];

    const ext = this.extension;

    if (imageTypes.includes(ext)) return 'image';
    if (documentTypes.includes(ext)) return 'document';
    if (videoTypes.includes(ext)) return 'video';
    if (audioTypes.includes(ext)) return 'audio';
    if (archiveTypes.includes(ext)) return 'archive';
    return 'other';
});

// Check if share is valid
fileSchema.methods.isShareValid = function() {
    if (!this.shareToken) return false;
    if (this.shareExpires && this.shareExpires < Date.now()) return false;
    if (this.maxDownloads && this.downloadCount >= this.maxDownloads) return false;
    return true;
};

// Generate share token
fileSchema.methods.generateShareToken = function(expiresIn = 7 * 24 * 60 * 60 * 1000) {
    const crypto = require('crypto');
    this.shareToken = crypto.randomBytes(32).toString('hex');
    this.shareExpires = new Date(Date.now() + expiresIn);
    return this.shareToken;
};

// Log access
fileSchema.methods.logAccess = function(action, ip, userAgent) {
    this.accessLog.push({
        action,
        timestamp: new Date(),
        ip,
        userAgent
    });

    // Keep only last 100 access logs
    if (this.accessLog.length > 100) {
        this.accessLog = this.accessLog.slice(-100);
    }
};

// Soft delete
fileSchema.methods.softDelete = function() {
    this.isDeleted = true;
    this.deletedAt = new Date();
};

// Restore from soft delete
fileSchema.methods.restore = function() {
    this.isDeleted = false;
    this.deletedAt = undefined;
};

// Pre-find middleware to exclude deleted files by default
fileSchema.pre(/^find/, function(next) {
    if (!this.getOptions().includeDeleted) {
        this.where({ isDeleted: { $ne: true } });
    }
    next();
});

const File = mongoose.model('File', fileSchema);

module.exports = File;