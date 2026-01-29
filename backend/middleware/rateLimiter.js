const rateLimit = require('express-rate-limit');
const AppError = require('../utils/AppError');

// General API rate limiter
const apiLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        next(new AppError(options.message.message, 429));
    }
});

// Stricter rate limiter for auth routes
const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 attempts per hour
    message: {
        success: false,
        message: 'Too many authentication attempts, please try again after an hour.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        next(new AppError(options.message.message, 429));
    }
});

// Rate limiter for file uploads
const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // 50 uploads per hour
    message: {
        success: false,
        message: 'Too many file uploads, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        next(new AppError(options.message.message, 429));
    }
});

// Rate limiter for downloads
const downloadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100, // 100 downloads per hour
    message: {
        success: false,
        message: 'Too many download requests, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        next(new AppError(options.message.message, 429));
    }
});

module.exports = {
    apiLimiter,
    authLimiter,
    uploadLimiter,
    downloadLimiter
};