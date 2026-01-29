const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');
const validator = require('validator');

/**
 * Register a new user
 * @route POST /api/auth/register
 */
exports.register = asyncHandler(async (req, res, next) => {
    const { username, email, password, confirmPassword } = req.body;

    // Validation
    if (!username || !email || !password || !confirmPassword) {
        return next(new AppError('Please provide all required fields', 400));
    }

    if (password !== confirmPassword) {
        return next(new AppError('Passwords do not match', 400));
    }

    if (!validator.isEmail(email)) {
        return next(new AppError('Please provide a valid email', 400));
    }

    if (password.length < 8) {
        return next(new AppError('Password must be at least 8 characters long', 400));
    }

    // Check password strength
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
    if (!passwordRegex.test(password)) {
        return next(new AppError('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character', 400));
    }

    // Check if user already exists
    const existingUser = await User.findOne({
        $or: [{ email: email.toLowerCase() }, { username }]
    });

    if (existingUser) {
        if (existingUser.email === email.toLowerCase()) {
            return next(new AppError('Email already registered', 400));
        }
        return next(new AppError('Username already taken', 400));
    }

    // Create user
    const user = await User.create({
        username,
        email: email.toLowerCase(),
        password
    });

    // Generate token
    const token = user.generateAuthToken();

    logger.info(`New user registered: ${user.email}`);

    res.status(201).json({
        success: true,
        message: 'Registration successful',
        data: {
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                storageUsed: user.storageUsed,
                storageLimit: user.storageLimit
            },
            token
        }
    });
});

/**
 * Login user
 * @route POST /api/auth/login
 */
exports.login = asyncHandler(async (req, res, next) => {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
        return next(new AppError('Please provide email and password', 400));
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() })
        .select('+password +encryptionKey');

    if (!user) {
        return next(new AppError('Invalid email or password', 401));
    }

    // Check if account is locked
    if (user.isLocked) {
        const lockTime = Math.ceil((user.lockUntil - Date.now()) / 1000 / 60);
        return next(new AppError(`Account is locked. Try again in ${lockTime} minutes`, 423));
    }

    // Check if account is active
    if (!user.isActive) {
        return next(new AppError('Your account has been deactivated', 401));
    }

    // Verify password
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
        await user.incrementLoginAttempts();
        return next(new AppError('Invalid email or password', 401));
    }

    // Reset login attempts
    await user.resetLoginAttempts();

    // Generate token
    const token = user.generateAuthToken();

    logger.info(`User logged in: ${user.email}`);

    res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                storageUsed: user.storageUsed,
                storageLimit: user.storageLimit,
                lastLogin: user.lastLogin
            },
            token
        }
    });
});

/**
 * Get current user profile
 * @route GET /api/auth/me
 */
exports.getMe = asyncHandler(async (req, res, next) => {
    const user = await User.findById(req.user.id);

    if (!user) {
        return next(new AppError('User not found', 404));
    }

    res.status(200).json({
        success: true,
        data: {
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                storageUsed: user.storageUsed,
                storageLimit: user.storageLimit,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin
            }
        }
    });
});

/**
 * Update user profile
 * @route PATCH /api/auth/update-profile
 */
exports.updateProfile = asyncHandler(async (req, res, next) => {
    const { username, email } = req.body;

    // Don't allow password update through this route
    if (req.body.password) {
        return next(new AppError('This route is not for password updates. Please use /update-password', 400));
    }

    const updateData = {};

    if (username) {
        // Validate username
        if (username.length < 3 || username.length > 30) {
            return next(new AppError('Username must be between 3 and 30 characters', 400));
        }
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return next(new AppError('Username can only contain letters, numbers, and underscores', 400));
        }

        // Check if username is taken
        const existingUser = await User.findOne({ username, _id: { $ne: req.user.id } });
        if (existingUser) {
            return next(new AppError('Username already taken', 400));
        }

        updateData.username = username;
    }

    if (email) {
        if (!validator.isEmail(email)) {
            return next(new AppError('Please provide a valid email', 400));
        }

        // Check if email is taken
        const existingUser = await User.findOne({ 
            email: email.toLowerCase(), 
            _id: { $ne: req.user.id } 
        });
        if (existingUser) {
            return next(new AppError('Email already registered', 400));
        }

        updateData.email = email.toLowerCase();
    }

    if (Object.keys(updateData).length === 0) {
        return next(new AppError('Please provide data to update', 400));
    }

    const user = await User.findByIdAndUpdate(
        req.user.id,
        updateData,
        { new: true, runValidators: true }
    );

    logger.info(`User profile updated: ${user.email}`);

    res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: {
            user: {
                id: user._id,
                username: user.username,
                email: user.email
            }
        }
    });
});

/**
 * Update password
 * @route PATCH /api/auth/update-password
 */
exports.updatePassword = asyncHandler(async (req, res, next) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
        return next(new AppError('Please provide all required fields', 400));
    }

    if (newPassword !== confirmPassword) {
        return next(new AppError('New passwords do not match', 400));
    }

    if (newPassword.length < 8) {
        return next(new AppError('Password must be at least 8 characters long', 400));
    }

    // Check password strength
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
    if (!passwordRegex.test(newPassword)) {
        return next(new AppError('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character', 400));
    }

    // Get user with password
    const user = await User.findById(req.user.id).select('+password');

    if (!user) {
        return next(new AppError('User not found', 404));
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);

    if (!isMatch) {
        return next(new AppError('Current password is incorrect', 401));
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Generate new token
    const token = user.generateAuthToken();

    logger.info(`Password updated for user: ${user.email}`);

    res.status(200).json({
        success: true,
        message: 'Password updated successfully',
        data: { token }
    });
});

/**
 * Logout user (client-side token removal)
 * @route POST /api/auth/logout
 */
exports.logout = asyncHandler(async (req, res, next) => {
    logger.info(`User logged out: ${req.user.email}`);

    res.status(200).json({
        success: true,
        message: 'Logged out successfully'
    });
});

/**
 * Delete user account
 * @route DELETE /api/auth/delete-account
 */
exports.deleteAccount = asyncHandler(async (req, res, next) => {
    const { password } = req.body;

    if (!password) {
        return next(new AppError('Please provide your password to delete account', 400));
    }

    const user = await User.findById(req.user.id).select('+password');

    if (!user) {
        return next(new AppError('User not found', 404));
    }

    // Verify password
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
        return next(new AppError('Incorrect password', 401));
    }

    // Soft delete - deactivate account
    user.isActive = false;
    await user.save({ validateBeforeSave: false });

    logger.info(`Account deactivated: ${user.email}`);

    res.status(200).json({
        success: true,
        message: 'Account deleted successfully'
    });
});

/**
 * Get storage info
 * @route GET /api/auth/storage
 */
exports.getStorageInfo = asyncHandler(async (req, res, next) => {
    const user = await User.findById(req.user.id);

    if (!user) {
        return next(new AppError('User not found', 404));
    }

    const usedPercentage = (user.storageUsed / user.storageLimit) * 100;

    res.status(200).json({
        success: true,
        data: {
            storageUsed: user.storageUsed,
            storageLimit: user.storageLimit,
            storageAvailable: user.storageLimit - user.storageUsed,
            usedPercentage: Math.round(usedPercentage * 100) / 100
        }
    });
});