const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
    try {
        // Debug: Log connection attempt
        logger.info('Attempting to connect to MongoDB...');

        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 30000,   // Increased from 5000 to 30 seconds
            socketTimeoutMS: 45000,
            connectTimeoutMS: 30000,           // Added: 30 seconds
            heartbeatFrequencyMS: 10000,       // Added: Check connection every 10 seconds
            retryWrites: true,
            family: 4,                          // Added: Force IPv4 to avoid DNS issues
        });

        logger.info(`MongoDB Connected: ${conn.connection.host}`);

        // Handle connection events
        mongoose.connection.on('error', (err) => {
            logger.error(`MongoDB connection error: ${err}`);
        });

        mongoose.connection.on('disconnected', () => {
            logger.warn('MongoDB disconnected. Attempting to reconnect...');
        });

        mongoose.connection.on('reconnected', () => {
            logger.info('MongoDB reconnected');
        });

    } catch (error) {
        logger.error(`Error connecting to MongoDB: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;