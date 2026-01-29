const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

// Handle CastError (Invalid MongoDB ObjectId)
const handleCastErrorDB = (err) => {
    const message = `Invalid ${err.path}: ${err.value}`;
    return new AppError(message, 400);
};

// Handle Duplicate Fields Error
const handleDuplicateFieldsDB = (err) => {
    const value = err.errmsg.match(/(["'])(\\?.)*?\1/)[0];
    const message = `Duplicate field value: ${value}. Please use another value.`;
    return new AppError(message, 400);
};

// Handle Validation Error
const handleValidationErrorDB = (err) => {
    const errors = Object.values(err.errors).map(el => el.message);
    const message = `Invalid input data: ${errors.join('. ')}`;
    return new AppError(message, 400);
};

// Handle JWT Error
const handleJWTError = () => {
    return new AppError('Invalid token. Please log in again.', 401);
};

// Handle JWT Expired Error
const handleJWTExpiredError = () => {
    return new AppError('Your token has expired. Please log in again.', 401);
};

// Handle Multer Errors
const handleMulterError = (err) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        return new AppError('File too large. Maximum size is 150MB.', 400);
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
        return new AppError('Too many files. Maximum is 10 files per upload.', 400);
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return new AppError('Unexpected file field.', 400);
    }
    return new AppError(err.message, 400);
};

// Send error in development
const sendErrorDev = (err, req, res) => {
    logger.error('ERROR 💥', {
        status: err.status,
        error: err,
        message: err.message,
        stack: err.stack
    });

    return res.status(err.statusCode).json({
        success: false,
        status: err.status,
        message: err.message,
        error: err,
        stack: err.stack
    });
};

// Send error in production
const sendErrorProd = (err, req, res) => {
    // Operational, trusted error: send message to client
    if (err.isOperational) {
        return res.status(err.statusCode).json({
            success: false,
            status: err.status,
            message: err.message
        });
    }

    // Programming or other unknown error: don't leak error details
    logger.error('ERROR 💥', err);

    return res.status(500).json({
        success: false,
        status: 'error',
        message: 'Something went wrong. Please try again later.'
    });
};

module.exports = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    if (process.env.NODE_ENV === 'development') {
        sendErrorDev(err, req, res);
    } else {
        let error = { ...err };
        error.message = err.message;

        // Handle specific error types
        if (err.name === 'CastError') error = handleCastErrorDB(error);
        if (err.code === 11000) error = handleDuplicateFieldsDB(error);
        if (err.name === 'ValidationError') error = handleValidationErrorDB(error);
        if (err.name === 'JsonWebTokenError') error = handleJWTError();
        if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();
        if (err.name === 'MulterError') error = handleMulterError(error);

        sendErrorProd(error, req, res);
    }
};