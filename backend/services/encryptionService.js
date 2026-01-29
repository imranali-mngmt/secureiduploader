const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class EncryptionService {
    constructor() {
        this.algorithm = 'aes-256-gcm';
        this.keyLength = 32; // 256 bits
        this.ivLength = 16; // 128 bits
        this.saltLength = 64;
        this.tagLength = 16;
        this.pbkdf2Iterations = 100000;
    }

    /**
     * Generate a random encryption key
     * @returns {string} Hex-encoded encryption key
     */
    generateKey() {
        return crypto.randomBytes(this.keyLength).toString('hex');
    }

    /**
     * Generate a random initialization vector
     * @returns {Buffer} Random IV
     */
    generateIV() {
        return crypto.randomBytes(this.ivLength);
    }

    /**
     * Generate a random salt
     * @returns {Buffer} Random salt
     */
    generateSalt() {
        return crypto.randomBytes(this.saltLength);
    }

    /**
     * Derive a key from password and salt using PBKDF2
     * @param {string} password - User password or key
     * @param {Buffer} salt - Salt for key derivation
     * @returns {Buffer} Derived key
     */
    deriveKey(password, salt) {
        return crypto.pbkdf2Sync(
            password,
            salt,
            this.pbkdf2Iterations,
            this.keyLength,
            'sha512'
        );
    }

    /**
     * Encrypt data
     * @param {Buffer} data - Data to encrypt
     * @param {string} userKey - User's encryption key
     * @returns {Object} Encrypted data with metadata
     */
    encrypt(data, userKey) {
        try {
            const salt = this.generateSalt();
            const iv = this.generateIV();
            const key = this.deriveKey(userKey, salt);

            const cipher = crypto.createCipheriv(this.algorithm, key, iv);
            
            const encrypted = Buffer.concat([
                cipher.update(data),
                cipher.final()
            ]);

            const authTag = cipher.getAuthTag();

            // Combine salt + iv + authTag + encrypted data
            const result = Buffer.concat([salt, iv, authTag, encrypted]);

            return {
                success: true,
                data: result,
                metadata: {
                    algorithm: this.algorithm,
                    saltLength: this.saltLength,
                    ivLength: this.ivLength,
                    tagLength: this.tagLength,
                    originalSize: data.length,
                    encryptedSize: result.length
                }
            };
        } catch (error) {
            logger.error('Encryption error:', error);
            throw new Error('Encryption failed: ' + error.message);
        }
    }

    /**
     * Decrypt data
     * @param {Buffer} encryptedData - Encrypted data with metadata
     * @param {string} userKey - User's encryption key
     * @returns {Object} Decrypted data
     */
    decrypt(encryptedData, userKey) {
        try {
            // Extract components
            const salt = encryptedData.slice(0, this.saltLength);
            const iv = encryptedData.slice(this.saltLength, this.saltLength + this.ivLength);
            const authTag = encryptedData.slice(
                this.saltLength + this.ivLength,
                this.saltLength + this.ivLength + this.tagLength
            );
            const encrypted = encryptedData.slice(this.saltLength + this.ivLength + this.tagLength);

            const key = this.deriveKey(userKey, salt);

            const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
            decipher.setAuthTag(authTag);

            const decrypted = Buffer.concat([
                decipher.update(encrypted),
                decipher.final()
            ]);

            return {
                success: true,
                data: decrypted
            };
        } catch (error) {
            logger.error('Decryption error:', error);
            throw new Error('Decryption failed: Invalid key or corrupted data');
        }
    }

    /**
     * Encrypt a file
     * @param {string} inputPath - Path to input file
     * @param {string} outputPath - Path to output encrypted file
     * @param {string} userKey - User's encryption key
     * @returns {Promise<Object>} Encryption result
     */
    async encryptFile(inputPath, outputPath, userKey) {
        return new Promise((resolve, reject) => {
            try {
                const salt = this.generateSalt();
                const iv = this.generateIV();
                const key = this.deriveKey(userKey, salt);

                const cipher = crypto.createCipheriv(this.algorithm, key, iv);

                const input = fs.createReadStream(inputPath);
                const output = fs.createWriteStream(outputPath);

                // Write salt and IV at the beginning
                output.write(salt);
                output.write(iv);

                // Reserve space for auth tag (will be written at the end)
                const tagPlaceholder = Buffer.alloc(this.tagLength);
                output.write(tagPlaceholder);

                let bytesWritten = this.saltLength + this.ivLength + this.tagLength;

                input.pipe(cipher).pipe(output);

                output.on('finish', () => {
                    // Get auth tag and write it
                    const authTag = cipher.getAuthTag();
                    
                    // Open file and write auth tag at the correct position
                    const fd = fs.openSync(outputPath, 'r+');
                    fs.writeSync(fd, authTag, 0, this.tagLength, this.saltLength + this.ivLength);
                    fs.closeSync(fd);

                    const stats = fs.statSync(outputPath);

                    resolve({
                        success: true,
                        outputPath,
                        metadata: {
                            algorithm: this.algorithm,
                            originalSize: fs.statSync(inputPath).size,
                            encryptedSize: stats.size
                        }
                    });
                });

                input.on('error', (error) => {
                    reject(new Error('Failed to read input file: ' + error.message));
                });

                output.on('error', (error) => {
                    reject(new Error('Failed to write output file: ' + error.message));
                });

                cipher.on('error', (error) => {
                    reject(new Error('Encryption failed: ' + error.message));
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Decrypt a file
     * @param {string} inputPath - Path to encrypted file
     * @param {string} outputPath - Path to output decrypted file
     * @param {string} userKey - User's encryption key
     * @returns {Promise<Object>} Decryption result
     */
    async decryptFile(inputPath, outputPath, userKey) {
        return new Promise((resolve, reject) => {
            try {
                const fd = fs.openSync(inputPath, 'r');
                
                // Read salt, IV, and auth tag
                const salt = Buffer.alloc(this.saltLength);
                const iv = Buffer.alloc(this.ivLength);
                const authTag = Buffer.alloc(this.tagLength);

                fs.readSync(fd, salt, 0, this.saltLength, 0);
                fs.readSync(fd, iv, 0, this.ivLength, this.saltLength);
                fs.readSync(fd, authTag, 0, this.tagLength, this.saltLength + this.ivLength);
                fs.closeSync(fd);

                const key = this.deriveKey(userKey, salt);

                const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
                decipher.setAuthTag(authTag);

                const headerSize = this.saltLength + this.ivLength + this.tagLength;
                const input = fs.createReadStream(inputPath, { start: headerSize });
                const output = fs.createWriteStream(outputPath);

                input.pipe(decipher).pipe(output);

                output.on('finish', () => {
                    resolve({
                        success: true,
                        outputPath,
                        size: fs.statSync(outputPath).size
                    });
                });

                input.on('error', (error) => {
                    reject(new Error('Failed to read encrypted file: ' + error.message));
                });

                output.on('error', (error) => {
                    reject(new Error('Failed to write output file: ' + error.message));
                });

                decipher.on('error', (error) => {
                    // Clean up partial output file
                    if (fs.existsSync(outputPath)) {
                        fs.unlinkSync(outputPath);
                    }
                    reject(new Error('Decryption failed: Invalid key or corrupted file'));
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Hash data using SHA-256
     * @param {string|Buffer} data - Data to hash
     * @returns {string} Hex-encoded hash
     */
    hash(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Generate a secure file checksum
     * @param {string} filePath - Path to file
     * @returns {Promise<string>} File checksum
     */
    async generateFileChecksum(filePath) {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);

            stream.on('data', (data) => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', (error) => reject(error));
        });
    }

    /**
     * Verify file checksum
     * @param {string} filePath - Path to file
     * @param {string} expectedChecksum - Expected checksum
     * @returns {Promise<boolean>} Whether checksum matches
     */
    async verifyFileChecksum(filePath, expectedChecksum) {
        const actualChecksum = await this.generateFileChecksum(filePath);
        return actualChecksum === expectedChecksum;
    }
}

module.exports = new EncryptionService();