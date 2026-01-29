/**
 * SecureVault - Main Application
 * Handles core functionality, state management, and utilities
 */

const App = {
    // Application state
    state: {
        user: null,
        token: null,
        currentView: 'files',
        files: [],
        selectedFiles: new Set(),
        pagination: {
            page: 1,
            limit: 20,
            total: 0,
            pages: 0
        },
        viewMode: 'grid',
        sortBy: '-createdAt',
        searchQuery: '',
        isLoading: false
    },

    // API Base URL
    apiUrl: '/api',

    /**
     * Initialize the application
     */
    init() {
        this.loadState();
        this.bindEvents();
        this.checkAuth();
        console.log('SecureVault initialized');
    },

    /**
     * Load state from localStorage
     */
    loadState() {
        try {
            const token = localStorage.getItem('token');
            const user = localStorage.getItem('user');
            const viewMode = localStorage.getItem('viewMode');

            if (token) {
                this.state.token = token;
            }

            if (user) {
                this.state.user = JSON.parse(user);
            }

            if (viewMode) {
                this.state.viewMode = viewMode;
            }
        } catch (error) {
            console.error('Error loading state:', error);
            this.clearState();
        }
    },

    /**
     * Save state to localStorage
     */
    saveState() {
        try {
            if (this.state.token) {
                localStorage.setItem('token', this.state.token);
            }
            if (this.state.user) {
                localStorage.setItem('user', JSON.stringify(this.state.user));
            }
            localStorage.setItem('viewMode', this.state.viewMode);
        } catch (error) {
            console.error('Error saving state:', error);
        }
    },

    /**
     * Clear application state
     */
    clearState() {
        this.state.token = null;
        this.state.user = null;
        this.state.files = [];
        this.state.selectedFiles.clear();
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    },

    /**
     * Check authentication status
     */
    async checkAuth() {
        if (!this.state.token) {
            this.showAuth();
            return;
        }

        try {
            const response = await this.apiRequest('/auth/me');
            this.state.user = response.data.user;
            this.saveState();
            this.showDashboard();
        } catch (error) {
            console.error('Auth check failed:', error);
            this.clearState();
            this.showAuth();
        }
    },

    /**
     * Show authentication section
     */
    showAuth() {
        document.getElementById('auth-section').classList.remove('hidden');
        document.getElementById('dashboard-section').classList.add('hidden');
    },

    /**
     * Show dashboard section
     */
    showDashboard() {
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('dashboard-section').classList.remove('hidden');

        // Update user info
        this.updateUserInfo();
        this.updateStorageInfo();

        // Load files
        FileManager.loadFiles();
    },

    /**
     * Update user info in sidebar
     */
    updateUserInfo() {
        const userNameEl = document.getElementById('user-name');
        if (userNameEl && this.state.user) {
            userNameEl.textContent = this.state.user.username;
        }
    },

    /**
     * Update storage info in sidebar
     */
    async updateStorageInfo() {
        try {
            const response = await this.apiRequest('/auth/storage');
            const { storageUsed, storageLimit, usedPercentage } = response.data;

            const storageFill = document.getElementById('storage-fill');
            const storageText = document.getElementById('storage-text');

            if (storageFill) {
                storageFill.style.width = `${Math.min(usedPercentage, 100)}%`;

                // Change color based on usage
                if (usedPercentage > 90) {
                    storageFill.style.background = 'var(--danger-color)';
                } else if (usedPercentage > 70) {
                    storageFill.style.background = 'var(--warning-color)';
                }
            }

            if (storageText) {
                storageText.textContent = `${this.formatBytes(storageUsed)} / ${this.formatBytes(storageLimit)}`;
            }
        } catch (error) {
            console.error('Error fetching storage info:', error);
        }
    },

    /**
     * Make API request
     * @param {string} endpoint - API endpoint
     * @param {object} options - Fetch options
     * @returns {Promise<object>} Response data
     */
    async apiRequest(endpoint, options = {}) {
        const url = `${this.apiUrl}${endpoint}`;

        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (this.state.token) {
            headers['Authorization'] = `Bearer ${this.state.token}`;
        }

        // Don't set Content-Type for FormData
        if (options.body instanceof FormData) {
            delete headers['Content-Type'];
        }

        try {
            const response = await fetch(url, {
                ...options,
                headers
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Request failed');
            }

            return data;
        } catch (error) {
            console.error('API request error:', error);
            throw error;
        }
    },

    /**
     * Bind global events
     */
    bindEvents() {
        // Mobile menu toggle
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        const sidebar = document.querySelector('.sidebar');

        if (mobileMenuBtn && sidebar) {
            mobileMenuBtn.addEventListener('click', () => {
                sidebar.classList.toggle('open');
            });

            // Close sidebar when clicking outside on mobile
            document.addEventListener('click', (e) => {
                if (window.innerWidth <= 768 &&
                    !sidebar.contains(e.target) &&
                    !mobileMenuBtn.contains(e.target)) {
                    sidebar.classList.remove('open');
                }
            });
        }

        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const view = item.dataset.view;
                this.setCurrentView(view);
            });
        });

        // View toggle
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                this.setViewMode(view);
            });
        });

        // Sort select
        const sortSelect = document.getElementById('sort-select');
        if (sortSelect) {
            sortSelect.addEventListener('change', () => {
                this.state.sortBy = sortSelect.value;
                FileManager.loadFiles();
            });
        }

        // Search
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.state.searchQuery = searchInput.value;
                    this.state.pagination.page = 1;
                    FileManager.loadFiles();
                }, 300);
            });
        }

        // Logout
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.logout();
            });
        }

        // Select all checkbox
        const selectAllCheckbox = document.getElementById('select-all');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', () => {
                FileManager.selectAll(selectAllCheckbox.checked);
            });
        }

        // Modal close handlers
        document.querySelectorAll('.modal-close, .modal-cancel, .modal-overlay').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target === el) {
                    this.closeModals();
                }
            });
        });

        // Escape key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModals();
            }
        });

        // Pagination
        const prevPageBtn = document.getElementById('prev-page');
        const nextPageBtn = document.getElementById('next-page');

        if (prevPageBtn) {
            prevPageBtn.addEventListener('click', () => {
                if (this.state.pagination.page > 1) {
                    this.state.pagination.page--;
                    FileManager.loadFiles();
                }
            });
        }

        if (nextPageBtn) {
            nextPageBtn.addEventListener('click', () => {
                if (this.state.pagination.page < this.state.pagination.pages) {
                    this.state.pagination.page++;
                    FileManager.loadFiles();
                }
            });
        }

        // Bulk actions
        document.getElementById('bulk-delete')?.addEventListener('click', () => {
            FileManager.bulkDelete();
        });

        document.getElementById('bulk-download')?.addEventListener('click', () => {
            FileManager.bulkDownload();
        });
    },

    /**
     * Set current view
     * @param {string} view - View name
     */
    setCurrentView(view) {
        this.state.currentView = view;
        this.state.pagination.page = 1;
        this.state.selectedFiles.clear();

        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.view === view);
        });

        // Update title
        const titles = {
            files: 'My Files',
            images: 'Images',
            documents: 'Documents',
            videos: 'Videos',
            shared: 'Shared Files',
            trash: 'Trash'
        };

        const titleEl = document.getElementById('current-view-title');
        if (titleEl) {
            titleEl.textContent = titles[view] || 'My Files';
        }

        // Close mobile sidebar
        document.querySelector('.sidebar')?.classList.remove('open');

        // Load files
        FileManager.loadFiles();
    },

    /**
     * Set view mode (grid or list)
     * @param {string} mode - View mode
     */
    setViewMode(mode) {
        this.state.viewMode = mode;
        this.saveState();

        // Update buttons
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === mode);
        });

        // Update files grid
        const filesGrid = document.getElementById('files-grid');
        if (filesGrid) {
            filesGrid.classList.toggle('list-view', mode === 'list');
        }
    },

    /**
     * Logout user
     */
    async logout() {
        try {
            await this.apiRequest('/auth/logout', { method: 'POST' });
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            this.clearState();
            this.showAuth();
            Toast.success('Logged out successfully');
        }
    },

    /**
     * Close all modals
     */
    closeModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.add('hidden');
        });
    },

    /**
     * Show loading overlay
     * @param {boolean} show - Show or hide
     */
    showLoading(show = true) {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.toggle('hidden', !show);
        }
        this.state.isLoading = show;
    },

    /**
     * Format bytes to human readable
     * @param {number} bytes - Bytes
     * @param {number} decimals - Decimal places
     * @returns {string} Formatted string
     */
    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    },

    /**
     * Format date to relative time
     * @param {string} dateString - ISO date string
     * @returns {string} Relative time string
     */
    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;

        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 7) {
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } else if (days > 0) {
            return `${days} day${days > 1 ? 's' : ''} ago`;
        } else if (hours > 0) {
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        } else if (minutes > 0) {
            return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        } else {
            return 'Just now';
        }
    },

    /**
     * Get file icon class based on category
     * @param {string} category - File category
     * @returns {string} Icon class
     */
    getFileIcon(category) {
        const icons = {
            image: 'fas fa-image file-icon-image',
            document: 'fas fa-file-alt file-icon-document',
            video: 'fas fa-video file-icon-video',
            audio: 'fas fa-music file-icon-audio',
            archive: 'fas fa-file-archive file-icon-archive',
            other: 'fas fa-file file-icon-other'
        };

        return icons[category] || icons.other;
    },

    /**
     * Escape HTML to prevent XSS
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    /**
     * Debounce function
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in ms
     * @returns {Function} Debounced function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
};

/**
 * Toast notification system
 */
const Toast = {
    container: null,

    init() {
        this.container = document.getElementById('toast-container');
    },

    show(message, type = 'info', duration = 5000) {
        if (!this.container) this.init();

        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <i class="${icons[type]}"></i>
            <span class="toast-message">${App.escapeHtml(message)}</span>
            <button class="toast-close">&times;</button>
        `;

        this.container.appendChild(toast);

        // Close button
        toast.querySelector('.toast-close').addEventListener('click', () => {
            this.remove(toast);
        });

        // Auto remove
        setTimeout(() => {
            this.remove(toast);
        }, duration);
    },

    remove(toast) {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => {
            toast.remove();
        }, 300);
    },

    success(message) {
        this.show(message, 'success');
    },

    error(message) {
        this.show(message, 'error');
    },

    warning(message) {
        this.show(message, 'warning');
    },

    info(message) {
        this.show(message, 'info');
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});