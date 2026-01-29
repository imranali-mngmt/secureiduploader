/**
 * Authentication Module
 * Handles login, registration, and password management
 */

const Auth = {
    /**
     * Initialize authentication handlers
     */
    init() {
        this.bindEvents();
    },

    /**
     * Bind authentication events
     */
    bindEvents() {
        // Login form
        const loginForm = document.getElementById('login');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Register form
        const registerForm = document.getElementById('register');
        if (registerForm) {
            registerForm.addEventListener('submit', (e) => this.handleRegister(e));
        }

        // Toggle between login and register
        document.getElementById('show-register')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showRegisterForm();
        });

        document.getElementById('show-login')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showLoginForm();
        });

        // Password visibility toggle
        document.querySelectorAll('.toggle-password').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const input = e.target.closest('.input-wrapper').querySelector('input');
                const icon = e.target.closest('.toggle-password').querySelector('i');

                if (input.type === 'password') {
                    input.type = 'text';
                    icon.classList.replace('fa-eye', 'fa-eye-slash');
                } else {
                    input.type = 'password';
                    icon.classList.replace('fa-eye-slash', 'fa-eye');
                }
            });
        });

        // Password strength indicator
        const registerPassword = document.getElementById('register-password');
        if (registerPassword) {
            registerPassword.addEventListener('input', (e) => {
                this.updatePasswordStrength(e.target.value);
            });
        }
    },

    /**
     * Handle login form submission
     * @param {Event} e - Form submit event
     */
    async handleLogin(e) {
        e.preventDefault();

        const form = e.target;
        const email = form.querySelector('#login-email').value.trim();
        const password = form.querySelector('#login-password').value;

        // Validation
        if (!email || !password) {
            Toast.error('Please fill in all fields');
            return;
        }

        if (!this.validateEmail(email)) {
            Toast.error('Please enter a valid email address');
            return;
        }

        App.showLoading(true);

        try {
            const response = await App.apiRequest('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });

            App.state.token = response.data.token;
            App.state.user = response.data.user;
            App.saveState();

            Toast.success('Login successful!');
            App.showDashboard();

        } catch (error) {
            Toast.error(error.message || 'Login failed. Please check your credentials.');
        } finally {
            App.showLoading(false);
        }
    },

    /**
     * Handle register form submission
     * @param {Event} e - Form submit event
     */
    async handleRegister(e) {
        e.preventDefault();

        const form = e.target;
        const username = form.querySelector('#register-username').value.trim();
        const email = form.querySelector('#register-email').value.trim();
        const password = form.querySelector('#register-password').value;
        const confirmPassword = form.querySelector('#register-confirm-password').value;

        // Validation
        if (!username || !email || !password || !confirmPassword) {
            Toast.error('Please fill in all fields');
            return;
        }

        if (username.length < 3 || username.length > 30) {
            Toast.error('Username must be between 3 and 30 characters');
            return;
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            Toast.error('Username can only contain letters, numbers, and underscores');
            return;
        }

        if (!this.validateEmail(email)) {
            Toast.error('Please enter a valid email address');
            return;
        }

        if (password.length < 8) {
            Toast.error('Password must be at least 8 characters long');
            return;
        }

        if (!this.validatePasswordStrength(password)) {
            Toast.error('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character');
            return;
        }

        if (password !== confirmPassword) {
            Toast.error('Passwords do not match');
            return;
        }

        App.showLoading(true);

        try {
            const response = await App.apiRequest('/auth/register', {
                method: 'POST',
                body: JSON.stringify({ username, email, password, confirmPassword })
            });

            App.state.token = response.data.token;
            App.state.user = response.data.user;
            App.saveState();

            Toast.success('Account created successfully!');
            App.showDashboard();

        } catch (error) {
            Toast.error(error.message || 'Registration failed. Please try again.');
        } finally {
            App.showLoading(false);
        }
    },

    /**
     * Show login form
     */
    showLoginForm() {
        document.getElementById('login-form').classList.remove('hidden');
        document.getElementById('register-form').classList.add('hidden');
    },

    /**
     * Show register form
     */
    showRegisterForm() {
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('register-form').classList.remove('hidden');
    },

    /**
     * Validate email format
     * @param {string} email - Email address
     * @returns {boolean} Is valid
     */
    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },

    /**
     * Validate password strength
     * @param {string} password - Password
     * @returns {boolean} Is strong enough
     */
    validatePasswordStrength(password) {
        const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
        return re.test(password);
    },

    /**
     * Update password strength indicator
     * @param {string} password - Password
     */
    updatePasswordStrength(password) {
        const strengthFill = document.getElementById('strength-fill');
        const strengthText = document.getElementById('strength-text');

        if (!strengthFill || !strengthText) return;

        let strength = 0;
        let text = '';
        let color = '';

        if (password.length >= 8) strength++;
        if (password.length >= 12) strength++;
        if (/[a-z]/.test(password)) strength++;
        if (/[A-Z]/.test(password)) strength++;
        if (/\d/.test(password)) strength++;
        if (/[@$!%*?&]/.test(password)) strength++;

        if (strength <= 2) {
            text = 'Weak';
            color = 'var(--danger-color)';
        } else if (strength <= 4) {
            text = 'Medium';
            color = 'var(--warning-color)';
        } else {
            text = 'Strong';
            color = 'var(--success-color)';
        }

        const percentage = (strength / 6) * 100;
        strengthFill.style.width = `${percentage}%`;
        strengthFill.style.background = color;
        strengthText.textContent = text;
        strengthText.style.color = color;
    }
};

// Initialize auth when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    Auth.init();
});