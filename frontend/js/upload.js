/**
 * Upload Module
 * Handles file uploads with progress tracking
 */

const Uploader = {
    uploadQueue: [],
    isUploading: false,
    currentXHR: null,

    /**
     * Initialize uploader
     */
    init() {
        this.bindEvents();
    },

    /**
     * Bind upload events
     */
    bindEvents() {
        const uploadBtn = document.getElementById('upload-btn');
        const emptyUploadBtn = document.getElementById('empty-upload-btn');
        const uploadArea = document.getElementById('upload-area');
        const fileInput = document.getElementById('file-input');
        const uploadZone = document.getElementById('upload-zone');
        const cancelUploadBtn = document.getElementById('cancel-upload');

        // Toggle upload zone
        uploadBtn?.addEventListener('click', () => {
            uploadZone.classList.toggle('hidden');
        });

        emptyUploadBtn?.addEventListener('click', () => {
            uploadZone.classList.remove('hidden');
        });

        // Click to upload
        uploadArea?.addEventListener('click', () => {
            fileInput.click();
        });

        // File input change
        fileInput?.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.addFiles(e.target.files);
                e.target.value = ''; // Reset input
            }
        });

        // Drag and drop
        uploadArea?.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea?.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
        });

        uploadArea?.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');

            if (e.dataTransfer.files.length > 0) {
                this.addFiles(e.dataTransfer.files);
            }
        });

        // Cancel upload
        cancelUploadBtn?.addEventListener('click', () => {
            this.cancelUpload();
        });

        // Global drag and drop
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        document.addEventListener('drop', (e) => {
            e.preventDefault();
        });
    },

    /**
     * Add files to upload queue
     * @param {FileList} files - Files to upload
     */
    addFiles(files) {
        const maxSize = 150 * 1024 * 1024; // 150MB

        for (const file of files) {
            // Check file size
            if (file.size > maxSize) {
                Toast.error(`File "${file.name}" is too large. Maximum size is 150MB.`);
                continue;
            }

            // Check if already in queue
            if (this.uploadQueue.find(f => f.name === file.name && f.size === file.size)) {
                Toast.warning(`File "${file.name}" is already in the queue.`);
                continue;
            }

            this.uploadQueue.push({
                file,
                name: file.name,
                size: file.size,
                progress: 0,
                status: 'pending',
                id: Date.now() + Math.random().toString(36).substr(2, 9)
            });
        }

        if (this.uploadQueue.length > 0) {
            this.showProgress();
            this.processQueue();
        }
    },

    /**
     * Show upload progress UI
     */
    showProgress() {
        const uploadArea = document.getElementById('upload-area');
        const uploadProgress = document.getElementById('upload-progress');

        uploadArea?.classList.add('hidden');
        uploadProgress?.classList.remove('hidden');

        this.renderProgressList();
    },

    /**
     * Hide upload progress UI
     */
    hideProgress() {
        const uploadArea = document.getElementById('upload-area');
        const uploadProgress = document.getElementById('upload-progress');

        uploadArea?.classList.remove('hidden');
        uploadProgress?.classList.add('hidden');
    },

    /**
     * Render progress list
     */
    renderProgressList() {
        const progressList = document.getElementById('progress-list');
        if (!progressList) return;

        progressList.innerHTML = this.uploadQueue.map(item => `
            <div class="progress-item" data-id="${item.id}">
                <div class="progress-item-icon">
                    <i class="${this.getFileIcon(item.name)}"></i>
                </div>
                <div class="progress-item-info">
                    <div class="progress-item-name">${App.escapeHtml(item.name)}</div>
                    <div class="progress-bar">
                        <div class="progress-bar-fill" style="width: ${item.progress}%"></div>
                    </div>
                </div>
                <div class="progress-item-status ${item.status}">
                    ${this.getStatusText(item)}
                </div>
            </div>
        `).join('');
    },

    /**
     * Get file icon based on extension
     * @param {string} filename - File name
     * @returns {string} Icon class
     */
    getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();

        const iconMap = {
            // Images
            jpg: 'fas fa-image',
            jpeg: 'fas fa-image',
            png: 'fas fa-image',
            gif: 'fas fa-image',
            svg: 'fas fa-image',
            webp: 'fas fa-image',
            // Documents
            pdf: 'fas fa-file-pdf',
            doc: 'fas fa-file-word',
            docx: 'fas fa-file-word',
            xls: 'fas fa-file-excel',
            xlsx: 'fas fa-file-excel',
            ppt: 'fas fa-file-powerpoint',
            pptx: 'fas fa-file-powerpoint',
            txt: 'fas fa-file-alt',
            // Videos
            mp4: 'fas fa-file-video',
            avi: 'fas fa-file-video',
            mov: 'fas fa-file-video',
            webm: 'fas fa-file-video',
            // Audio
            mp3: 'fas fa-file-audio',
            wav: 'fas fa-file-audio',
            ogg: 'fas fa-file-audio',
            // Archives
            zip: 'fas fa-file-archive',
            rar: 'fas fa-file-archive',
            '7z': 'fas fa-file-archive',
            gz: 'fas fa-file-archive'
        };

        return iconMap[ext] || 'fas fa-file';
    },

    /**
     * Get status text
     * @param {object} item - Queue item
     * @returns {string} Status text
     */
    getStatusText(item) {
        switch (item.status) {
            case 'pending':
                return 'Waiting...';
            case 'uploading':
                return `${item.progress}%`;
            case 'encrypting':
                return 'Encrypting...';
            case 'success':
                return '<i class="fas fa-check"></i> Done';
            case 'error':
                return '<i class="fas fa-times"></i> Failed';
            default:
                return '';
        }
    },

    /**
     * Update progress item
     * @param {string} id - Item ID
     * @param {object} updates - Updates to apply
     */
    updateProgressItem(id, updates) {
        const item = this.uploadQueue.find(i => i.id === id);
        if (!item) return;

        Object.assign(item, updates);

        const itemEl = document.querySelector(`.progress-item[data-id="${id}"]`);
        if (!itemEl) return;

        const progressBar = itemEl.querySelector('.progress-bar-fill');
        const statusEl = itemEl.querySelector('.progress-item-status');

        if (progressBar) {
            progressBar.style.width = `${item.progress}%`;
        }

        if (statusEl) {
            statusEl.className = `progress-item-status ${item.status}`;
            statusEl.innerHTML = this.getStatusText(item);
        }
    },

    /**
     * Process upload queue
     */
    async processQueue() {
        if (this.isUploading) return;

        const pendingItem = this.uploadQueue.find(item => item.status === 'pending');
        if (!pendingItem) {
            this.onQueueComplete();
            return;
        }

        this.isUploading = true;
        await this.uploadFile(pendingItem);
        this.isUploading = false;

        // Process next item
        this.processQueue();
    },

    /**
     * Upload a single file
     * @param {object} item - Queue item
     */
    async uploadFile(item) {
        return new Promise((resolve) => {
            const formData = new FormData();
            formData.append('files', item.file);

            const xhr = new XMLHttpRequest();
            this.currentXHR = xhr;

            // Progress handler
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const progress = Math.round((e.loaded / e.total) * 100);
                    this.updateProgressItem(item.id, {
                        progress,
                        status: 'uploading'
                    });
                }
            });

            // Load handler
            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        if (response.success) {
                            this.updateProgressItem(item.id, {
                                progress: 100,
                                status: 'success'
                            });
                        } else {
                            this.updateProgressItem(item.id, {
                                status: 'error'
                            });
                            Toast.error(response.message || 'Upload failed');
                        }
                    } catch (e) {
                        this.updateProgressItem(item.id, {
                            status: 'error'
                        });
                    }
                } else {
                    this.updateProgressItem(item.id, {
                        status: 'error'
                    });

                    try {
                        const response = JSON.parse(xhr.responseText);
                        Toast.error(response.message || 'Upload failed');
                    } catch (e) {
                        Toast.error('Upload failed');
                    }
                }
                resolve();
            });

            // Error handler
            xhr.addEventListener('error', () => {
                this.updateProgressItem(item.id, {
                    status: 'error'
                });
                Toast.error('Upload failed. Please try again.');
                resolve();
            });

            // Abort handler
            xhr.addEventListener('abort', () => {
                this.updateProgressItem(item.id, {
                    status: 'error'
                });
                resolve();
            });

            // Send request
            xhr.open('POST', `${App.apiUrl}/files/upload`);
            xhr.setRequestHeader('Authorization', `Bearer ${App.state.token}`);
            xhr.send(formData);

            this.updateProgressItem(item.id, { status: 'uploading' });
        });
    },

    /**
     * Cancel current upload
     */
    cancelUpload() {
        if (this.currentXHR) {
            this.currentXHR.abort();
            this.currentXHR = null;
        }

        this.uploadQueue = [];
        this.isUploading = false;
        this.hideProgress();

        Toast.info('Upload cancelled');
    },

    /**
     * Handle queue complete
     */
    onQueueComplete() {
        const successCount = this.uploadQueue.filter(i => i.status === 'success').length;
        const errorCount = this.uploadQueue.filter(i => i.status === 'error').length;

        if (successCount > 0) {
            Toast.success(`${successCount} file(s) uploaded successfully`);

            // Refresh files list
            FileManager.loadFiles();
            App.updateStorageInfo();
        }

        if (errorCount > 0) {
            Toast.error(`${errorCount} file(s) failed to upload`);
        }

        // Clear queue after delay
        setTimeout(() => {
            this.uploadQueue = [];
            this.hideProgress();
        }, 2000);
    }
};

// Initialize uploader when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    Uploader.init();
});