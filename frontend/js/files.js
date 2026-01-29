/**
 * File Manager Module
 * Handles file listing, preview, download, share, and delete operations
 */

const FileManager = {
    currentFile: null,

    /**
     * Initialize file manager
     */
    init() {
        this.bindEvents();
    },

    /**
     * Bind file manager events
     */
    bindEvents() {
        // Preview modal
        document.getElementById('preview-download')?.addEventListener('click', () => {
            if (this.currentFile) {
                this.downloadFile(this.currentFile.id);
            }
        });

        document.getElementById('preview-share')?.addEventListener('click', () => {
            if (this.currentFile) {
                this.showShareModal(this.currentFile);
            }
        });

        // Share modal
        document.getElementById('generate-share-link')?.addEventListener('click', () => {
            this.generateShareLink();
        });

        document.getElementById('copy-share-link')?.addEventListener('click', () => {
            this.copyShareLink();
        });

        // Details modal
        document.getElementById('save-details')?.addEventListener('click', () => {
            this.saveFileDetails();
        });

        // Delete modal
        document.getElementById('confirm-delete')?.addEventListener('click', () => {
            this.confirmDelete();
        });
    },

    /**
     * Load files from server
     */
    async loadFiles() {
        const filesGrid = document.getElementById('files-grid');
        const emptyState = document.getElementById('empty-state');
        const loadingFiles = document.getElementById('loading-files');
        const pagination = document.getElementById('pagination');

        // Show loading
        filesGrid.innerHTML = '';
        emptyState?.classList.add('hidden');
        loadingFiles?.classList.remove('hidden');

        try {
            // Build query params
            const params = new URLSearchParams({
                page: App.state.pagination.page,
                limit: App.state.pagination.limit,
                sort: App.state.sortBy
            });

            // Category filter
            if (App.state.currentView !== 'files' && App.state.currentView !== 'shared' && App.state.currentView !== 'trash') {
                params.set('category', App.state.currentView);
            }

            // Search query
            if (App.state.searchQuery) {
                params.set('search', App.state.searchQuery);
            }

            // Use trash endpoint for trash view
            let endpoint = '/files';
            if (App.state.currentView === 'trash') {
                endpoint = '/files/trash';
            }

            const response = await App.apiRequest(`${endpoint}?${params.toString()}`);

            App.state.files = response.data.files;
            App.state.pagination = {
                ...App.state.pagination,
                ...response.data.pagination
            };

            this.renderFiles();
            this.updatePagination();

        } catch (error) {
            Toast.error('Failed to load files');
            console.error('Load files error:', error);
        } finally {
            loadingFiles?.classList.add('hidden');
        }
    },

    /**
     * Render files grid
     */
    renderFiles() {
        const filesGrid = document.getElementById('files-grid');
        const emptyState = document.getElementById('empty-state');

        if (App.state.files.length === 0) {
            filesGrid.innerHTML = '';
            emptyState?.classList.remove('hidden');
            return;
        }

        emptyState?.classList.add('hidden');

        // Apply view mode
        filesGrid.classList.toggle('list-view', App.state.viewMode === 'list');

        filesGrid.innerHTML = App.state.files.map(file => this.renderFileCard(file)).join('');

        // Bind file card events
        this.bindFileCardEvents();
    },

    /**
     * Render single file card
     * @param {object} file - File object
     * @returns {string} HTML string
     */
    renderFileCard(file) {
        const isSelected = App.state.selectedFiles.has(file.id);
        const isImage = file.category === 'image';

        return `
            <div class="file-card ${isSelected ? 'selected' : ''}" data-id="${file.id}" data-category="${file.category}">
                <label class="file-card-checkbox checkbox-wrapper" onclick="event.stopPropagation()">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} data-file-id="${file.id}">
                    <span class="checkmark"></span>
                </label>
                <div class="file-card-actions">
                    <button class="file-action-btn" data-action="download" data-tooltip="Download">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="file-action-btn" data-action="share" data-tooltip="Share">
                        <i class="fas fa-share"></i>
                    </button>
                    <button class="file-action-btn" data-action="details" data-tooltip="Details">
                        <i class="fas fa-info-circle"></i>
                    </button>
                    <button class="file-action-btn" data-action="delete" data-tooltip="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="file-card-preview">
                    ${isImage ? 
                        `<img src="${App.apiUrl}/files/${file.id}/preview" alt="${App.escapeHtml(file.name)}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                         <i class="${App.getFileIcon(file.category)}" style="display: none;"></i>` :
                        `<i class="${App.getFileIcon(file.category)}"></i>`
                    }
                </div>
                <div class="file-card-info">
                    <div class="file-card-name" title="${App.escapeHtml(file.name)}">${App.escapeHtml(file.name)}</div>
                    <div class="file-card-meta">
                        <span>${file.formattedSize}</span>
                        <span>${App.formatDate(file.createdAt)}</span>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Bind file card events
     */
    bindFileCardEvents() {
        // File card click - preview
        document.querySelectorAll('.file-card').forEach(card => {
            card.addEventListener('click', (e) => {
                // Ignore if clicking on action buttons or checkbox
                if (e.target.closest('.file-card-actions') || e.target.closest('.file-card-checkbox')) {
                    return;
                }

                const fileId = card.dataset.id;
                const file = App.state.files.find(f => f.id === fileId);
                if (file) {
                    this.showPreview(file);
                }
            });

            // Context menu
            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const fileId = card.dataset.id;
                const file = App.state.files.find(f => f.id === fileId);
                if (file) {
                    this.showContextMenu(e, file);
                }
            });
        });

        // File checkbox
        document.querySelectorAll('.file-card-checkbox input').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const fileId = e.target.dataset.fileId;
                if (e.target.checked) {
                    App.state.selectedFiles.add(fileId);
                } else {
                    App.state.selectedFiles.delete(fileId);
                }
                this.updateSelectionUI();
            });
        });

        // Action buttons
        document.querySelectorAll('.file-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const fileId = btn.closest('.file-card').dataset.id;
                const file = App.state.files.find(f => f.id === fileId);

                if (!file) return;

                switch (action) {
                    case 'download':
                        this.downloadFile(file.id);
                        break;
                    case 'share':
                        this.showShareModal(file);
                        break;
                    case 'details':
                        this.showDetailsModal(file);
                        break;
                    case 'delete':
                        this.showDeleteModal(file);
                        break;
                }
            });
        });
    },

    /**
     * Update selection UI
     */
    updateSelectionUI() {
        const count = App.state.selectedFiles.size;
        const selectedCountEl = document.getElementById('selected-count');
        const bulkActionsEl = document.getElementById('bulk-actions');
        const selectAllCheckbox = document.getElementById('select-all');

        if (selectedCountEl) {
            selectedCountEl.textContent = `${count} selected`;
            selectedCountEl.classList.toggle('hidden', count === 0);
        }

        bulkActionsEl?.classList.toggle('hidden', count === 0);

        // Update select all checkbox
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = count === App.state.files.length && count > 0;
            selectAllCheckbox.indeterminate = count > 0 && count < App.state.files.length;
        }

        // Update card styles
        document.querySelectorAll('.file-card').forEach(card => {
            const isSelected = App.state.selectedFiles.has(card.dataset.id);
            card.classList.toggle('selected', isSelected);
            card.querySelector('.file-card-checkbox input').checked = isSelected;
        });
    },

    /**
     * Select/deselect all files
     * @param {boolean} select - Select or deselect
     */
    selectAll(select) {
        if (select) {
            App.state.files.forEach(file => App.state.selectedFiles.add(file.id));
        } else {
            App.state.selectedFiles.clear();
        }
        this.updateSelectionUI();
    },

    /**
     * Update pagination UI
     */
    updatePagination() {
        const paginationEl = document.getElementById('pagination');
        const pageInfoEl = document.getElementById('page-info');
        const prevPageBtn = document.getElementById('prev-page');
        const nextPageBtn = document.getElementById('next-page');

        const { page, pages, total } = App.state.pagination;

        if (total === 0 || pages <= 1) {
            paginationEl?.classList.add('hidden');
            return;
        }

        paginationEl?.classList.remove('hidden');

        if (pageInfoEl) {
            pageInfoEl.textContent = `Page ${page} of ${pages}`;
        }

        if (prevPageBtn) {
            prevPageBtn.disabled = page <= 1;
        }

        if (nextPageBtn) {
            nextPageBtn.disabled = page >= pages;
        }
    },

    /**
     * Show file preview
     * @param {object} file - File object
     */
    showPreview(file) {
        this.currentFile = file;

        const modal = document.getElementById('preview-modal');
        const filenameEl = document.getElementById('preview-filename');
        const containerEl = document.getElementById('preview-container');

        if (filenameEl) {
            filenameEl.textContent = file.name;
        }

        // Render preview based on file type
        if (file.category === 'image') {
            containerEl.innerHTML = `<img src="${App.apiUrl}/files/${file.id}/preview" alt="${App.escapeHtml(file.name)}">`;
        } else {
            containerEl.innerHTML = `
                <div class="preview-icon">
                    <i class="${App.getFileIcon(file.category)}"></i>
                    <p>${App.escapeHtml(file.name)}</p>
                    <p class="text-muted">${file.formattedSize}</p>
                </div>
            `;
        }

        modal?.classList.remove('hidden');
    },

    /**
     * Download file
     * @param {string} fileId - File ID
     */
    async downloadFile(fileId) {
        try {
            App.showLoading(true);

            const response = await fetch(`${App.apiUrl}/files/${fileId}/download`, {
                headers: {
                    'Authorization': `Bearer ${App.state.token}`
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Download failed');
            }

            // Get filename from header
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'download';
            if (contentDisposition) {
                const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                if (match) {
                    filename = decodeURIComponent(match[1].replace(/['"]/g, ''));
                }
            }

            // Create blob and download
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();

            Toast.success('Download started');

        } catch (error) {
            Toast.error(error.message || 'Failed to download file');
        } finally {
            App.showLoading(false);
        }
    },

    /**
     * Show share modal
     * @param {object} file - File object
     */
    showShareModal(file) {
        this.currentFile = file;

        const modal = document.getElementById('share-modal');
        const linkContainer = document.getElementById('share-link-container');

        // Reset form
        document.getElementById('share-expires').value = '7';
        document.getElementById('share-max-downloads').value = '';
        document.getElementById('share-password').value = '';
        linkContainer?.classList.add('hidden');

        modal?.classList.remove('hidden');
    },

    /**
     * Generate share link
     */
    async generateShareLink() {
        if (!this.currentFile) return;

        const expiresIn = document.getElementById('share-expires').value;
        const maxDownloads = document.getElementById('share-max-downloads').value;
        const password = document.getElementById('share-password').value;

        try {
            App.showLoading(true);

            const body = { expiresIn: parseInt(expiresIn) };
            if (maxDownloads) body.maxDownloads = parseInt(maxDownloads);
            if (password) body.password = password;

            const response = await App.apiRequest(`/files/${this.currentFile.id}/share`, {
                method: 'POST',
                body: JSON.stringify(body)
            });

            // Show link
            const linkContainer = document.getElementById('share-link-container');
            const linkInput = document.getElementById('share-link');

            if (linkInput) {
                linkInput.value = response.data.shareUrl;
            }

            linkContainer?.classList.remove('hidden');
            Toast.success('Share link created');

        } catch (error) {
            Toast.error(error.message || 'Failed to create share link');
        } finally {
            App.showLoading(false);
        }
    },

    /**
     * Copy share link to clipboard
     */
    async copyShareLink() {
        const linkInput = document.getElementById('share-link');
        if (!linkInput) return;

        try {
            await navigator.clipboard.writeText(linkInput.value);
            Toast.success('Link copied to clipboard');
        } catch (error) {
            // Fallback
            linkInput.select();
            document.execCommand('copy');
            Toast.success('Link copied to clipboard');
        }
    },

    /**
     * Show file details modal
     * @param {object} file - File object
     */
    async showDetailsModal(file) {
        this.currentFile = file;

        const modal = document.getElementById('details-modal');
        const detailsEl = document.getElementById('file-details');

        // Fetch full file details
        try {
            const response = await App.apiRequest(`/files/${file.id}`);
            const fullFile = response.data.file;

            detailsEl.innerHTML = `
                <div class="detail-row">
                    <span class="detail-label">Name</span>
                    <div class="detail-value">
                        <input type="text" id="detail-name" value="${App.escapeHtml(fullFile.name)}">
                    </div>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Size</span>
                    <span class="detail-value">${fullFile.formattedSize}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Type</span>
                    <span class="detail-value">${fullFile.mimeType}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Uploaded</span>
                    <span class="detail-value">${new Date(fullFile.createdAt).toLocaleString()}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Downloads</span>
                    <span class="detail-value">${fullFile.downloadCount}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Checksum</span>
                    <span class="detail-value" style="word-break: break-all; font-family: monospace; font-size: 12px;">${fullFile.checksum}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Description</span>
                    <div class="detail-value">
                        <textarea id="detail-description" placeholder="Add a description...">${App.escapeHtml(fullFile.description || '')}</textarea>
                    </div>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Tags</span>
                    <div class="detail-value">
                        <input type="text" id="detail-tags" value="${(fullFile.tags || []).join(', ')}" placeholder="Enter tags, separated by commas">
                    </div>
                </div>
            `;

            modal?.classList.remove('hidden');

        } catch (error) {
            Toast.error('Failed to load file details');
        }
    },

    /**
     * Save file details
     */
    async saveFileDetails() {
        if (!this.currentFile) return;

        const name = document.getElementById('detail-name')?.value.trim();
        const description = document.getElementById('detail-description')?.value.trim();
        const tags = document.getElementById('detail-tags')?.value.trim();

        if (!name) {
            Toast.error('File name cannot be empty');
            return;
        }

        try {
            App.showLoading(true);

            await App.apiRequest(`/files/${this.currentFile.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    originalName: name,
                    description,
                    tags
                })
            });

            Toast.success('File details updated');
            App.closeModals();
            this.loadFiles();

        } catch (error) {
            Toast.error(error.message || 'Failed to update file details');
        } finally {
            App.showLoading(false);
        }
    },

    /**
     * Show delete confirmation modal
     * @param {object} file - File object
     */
    showDeleteModal(file) {
        this.currentFile = file;

        const modal = document.getElementById('delete-modal');
        const messageEl = document.getElementById('delete-message');
        const permanentCheckbox = document.getElementById('permanent-delete');

        if (messageEl) {
            messageEl.textContent = `Are you sure you want to delete "${file.name}"?`;
        }

        if (permanentCheckbox) {
            permanentCheckbox.checked = false;
        }

        modal?.classList.remove('hidden');
    },

    /**
     * Confirm file deletion
     */
    async confirmDelete() {
        if (!this.currentFile) return;

        const permanent = document.getElementById('permanent-delete')?.checked;

        try {
            App.showLoading(true);

            await App.apiRequest(`/files/${this.currentFile.id}?permanent=${permanent}`, {
                method: 'DELETE'
            });

            Toast.success(permanent ? 'File permanently deleted' : 'File moved to trash');
            App.closeModals();
            this.loadFiles();
            App.updateStorageInfo();

        } catch (error) {
            Toast.error(error.message || 'Failed to delete file');
        } finally {
            App.showLoading(false);
        }
    },

    /**
     * Bulk delete files
     */
    async bulkDelete() {
        const fileIds = Array.from(App.state.selectedFiles);

        if (fileIds.length === 0) {
            Toast.warning('No files selected');
            return;
        }

        if (!confirm(`Are you sure you want to delete ${fileIds.length} file(s)?`)) {
            return;
        }

        try {
            App.showLoading(true);

            await App.apiRequest('/files/bulk-delete', {
                method: 'POST',
                body: JSON.stringify({ fileIds, permanent: false })
            });

            App.state.selectedFiles.clear();
            Toast.success(`${fileIds.length} file(s) moved to trash`);
            this.loadFiles();
            App.updateStorageInfo();

        } catch (error) {
            Toast.error(error.message || 'Failed to delete files');
        } finally {
            App.showLoading(false);
        }
    },

    /**
     * Bulk download files
     */
    async bulkDownload() {
        const fileIds = Array.from(App.state.selectedFiles);

        if (fileIds.length === 0) {
            Toast.warning('No files selected');
            return;
        }

        // Download files one by one
        for (const fileId of fileIds) {
            await this.downloadFile(fileId);
            // Small delay between downloads
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    },

    /**
     * Show context menu
     * @param {Event} e - Mouse event
     * @param {object} file - File object
     */
    showContextMenu(e, file) {
        // Remove existing context menu
        document.querySelector('.context-menu')?.remove();

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.innerHTML = `
            <div class="context-menu-item" data-action="preview">
                <i class="fas fa-eye"></i>
                <span>Preview</span>
            </div>
            <div class="context-menu-item" data-action="download">
                <i class="fas fa-download"></i>
                <span>Download</span>
            </div>
            <div class="context-menu-item" data-action="share">
                <i class="fas fa-share"></i>
                <span>Share</span>
            </div>
            <div class="context-menu-item" data-action="details">
                <i class="fas fa-info-circle"></i>
                <span>Details</span>
            </div>
            <div class="context-menu-divider"></div>
            <div class="context-menu-item danger" data-action="delete">
                <i class="fas fa-trash"></i>
                <span>Delete</span>
            </div>
        `;

        // Position menu
        menu.style.left = `${e.pageX}px`;
        menu.style.top = `${e.pageY}px`;

        document.body.appendChild(menu);

        // Handle menu item clicks
        menu.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;

                switch (action) {
                    case 'preview':
                        this.showPreview(file);
                        break;
                    case 'download':
                        this.downloadFile(file.id);
                        break;
                    case 'share':
                        this.showShareModal(file);
                        break;
                    case 'details':
                        this.showDetailsModal(file);
                        break;
                    case 'delete':
                        this.showDeleteModal(file);
                        break;
                }

                menu.remove();
            });
        });

        // Close menu on click outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };

        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 0);
    }
};

// Initialize file manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    FileManager.init();
});