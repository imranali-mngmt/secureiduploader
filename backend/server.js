const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const path = require('path');

// Only load dotenv in development
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const rateLimiter = require('./middleware/rateLimiter');
const authRoutes = require('./routes/authRoutes');
const fileRoutes = require('./routes/fileRoutes');
const AppError = require('./utils/AppError');
const logger = require('./utils/logger');

// Initialize express app
const app = express();

// Connect to database (only once)
let isConnected = false;
const connectOnce = async () => {
    if (isConnected) return;
    try {
        await connectDB();
        isConnected = true;
    } catch (error) {
        logger.error('Database connection failed:', error.message);
    }
};
connectOnce();

// Security Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "https://*.vercel.app"]
        }
    }
}));

// CORS configuration
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? [process.env.FRONTEND_URL, /\.vercel\.app$/]
        : ['http://localhost:3000', 'http://127.0.0.1:5500', 'http://localhost:5500', 'http://localhost:5000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Data sanitization against NoSQL injection
app.use(mongoSanitize());

// Prevent HTTP Parameter Pollution
app.use(hpp());

// Compression
app.use(compression());

// Rate limiting
app.use('/api', rateLimiter.apiLimiter);
app.use('/api/auth/login', rateLimiter.authLimiter);
app.use('/api/auth/register', rateLimiter.authLimiter);
app.use('/api/files/upload', rateLimiter.uploadLimiter);

// Request logging
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.originalUrl} - ${req.ip}`);
    next();
});

// Static files for frontend - check both possible locations
const publicPath = path.join(__dirname, 'public');
const frontendPath = path.join(__dirname, '../frontend');

app.use(express.static(publicPath));
app.use(express.static(frontendPath));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Server is running',
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        dbConnected: isConnected
    });
});

// Serve frontend for non-API routes
app.get('*', (req, res, next) => {
    if (req.originalUrl.startsWith('/api')) {
        return next(new AppError('API endpoint not found', 404));
    }
    
    // Try public folder first, then frontend folder
    const indexPath = path.join(__dirname, 'public', 'index.html');
    const altIndexPath = path.join(__dirname, '../frontend/index.html');
    
    res.sendFile(indexPath, (err) => {
        if (err) {
            res.sendFile(altIndexPath, (err2) => {
                if (err2) {
                    res.status(404).send('Frontend not found');
                }
            });
        }
    });
});

// 404 Handler for API routes
app.use('/api/*', (req, res, next) => {
    next(new AppError(`Cannot find ${req.originalUrl} on this server`, 404));
});

// Global Error Handler
app.use(errorHandler);

// Handle uncaught exceptions (don't exit in serverless)
process.on('uncaughtException', (err) => {
    logger.error('UNCAUGHT EXCEPTION!');
    logger.error(err.name, err.message);
    logger.error(err.stack);
    // Don't exit in serverless environment
    if (process.env.NODE_ENV !== 'production') {
        process.exit(1);
    }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    logger.error('UNHANDLED REJECTION!');
    logger.error(err.name, err.message);
    logger.error(err.stack);
});

// Start server only in development (not on Vercel)
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    });
}

// Export for Vercel
module.exports = app;