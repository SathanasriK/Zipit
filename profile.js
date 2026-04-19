// Profile Manager - handles user profile operations
// Supabase configuration (same as app.js)
const SUPABASE_URL = 'https://sfhuyrgphlhkmvosobqj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmaHV5cmdwaGxoa212b3NvYnFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0NDA2OTUsImV4cCI6MjA3MzAxNjY5NX0.8iRz_3tOnZRNMqDJ2odiZhp_XWrKTIncES31bxa-TPw';

// Initialize Supabase
const supabaseClient = (typeof supabase !== 'undefined' && SUPABASE_URL && SUPABASE_ANON_KEY) ? 
    supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

class ProfileManager {
    constructor() {
        this.currentUser = null;
        this.userProfile = null;
        this._initialized = false;
    }

    // Initialize profile page
    async init() {
        try {
            if (this._initialized) return;
            this._initialized = true;
            // Check authentication
            if (!supabaseClient) {
                this.redirectToLogin();
                return;
            }

            const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
            
            if (sessionError || !session) {
                this.redirectToLogin();
                return;
            }

            this.currentUser = session.user;
            
            // Render skeleton immediately for perceived performance
            try {
                this.renderProfileFormSkeleton();
            } catch (skErr) {
                console.warn('Skeleton render error', skErr);
            }

            // Load user profile asynchronously (don't wait/block)
            this.loadUserProfile().then(() => {
                try {
                    this.renderProfileForm();
                } catch (renderErr) {
                    console.error('Render profile form error:', renderErr);
                }
            }).catch(err => {
                console.warn('loadUserProfile error (async):', err);
            });

            // Setup event listeners immediately
            this.setupEventListeners();
        } catch (error) {
            console.error('Profile init error:', error);
            this.showToast('Failed to load profile', 'error');
            // Ensure loading indicators are removed so page doesn't appear stuck
            const profileContent = document.getElementById('profile-content');
            if (profileContent) profileContent.innerHTML = '<p style="color:var(--text-secondary);">Failed to load profile. Redirecting...</p>';
            setTimeout(() => this.redirectToLogin(), 1500);
        }
    }

    // Quick skeleton UI for perceived performance
    renderProfileFormSkeleton() {
        const profileContent = document.getElementById('profile-content');
        profileContent.innerHTML = `
            <form class="profile-form">
                <div class="form-group">
                    <label>Full Name</label>
                    <div style="height:40px; background:var(--border); border-radius:6px; animation:pulse 1.5s ease-in-out infinite;"></div>
                </div>
                <div class="form-group">
                    <label>Email</label>
                    <div style="height:40px; background:var(--border); border-radius:6px; animation:pulse 1.5s ease-in-out infinite;"></div>
                </div>
                <button type="button" disabled class="btn btn--primary" style="opacity:0.6;">Loading...</button>
            </form>
        `;
    }

    // Fetch user profile from public.users table
    async loadUserProfile() {
        try {
            if (!this.currentUser || !supabaseClient) {
                console.warn('No authenticated user for profile load');
                this.userProfile = { id: null, full_name: '', email: '' };
                return;
            }

            const { data, error } = await supabaseClient
                .from('users')
                .select('id, full_name')
                .eq('id', this.currentUser.id)
                .single();

            if (error) {
                console.warn('Profile fetch error:', error);
                // User might not have a profile entry yet - create one
                this.userProfile = {
                    id: this.currentUser.id,
                    full_name: this.currentUser.email.split('@')[0],
                    email: this.currentUser.email
                };
            } else {
                this.userProfile = {
                    ...data,
                    email: this.currentUser.email
                };
            }
        } catch (error) {
            console.error('Load profile error:', error);
            // Fallback: set a minimal profile so UI can render instead of leaving loader
            this.userProfile = {
                id: this.currentUser?.id || null,
                full_name: this.currentUser?.email?.split('@')[0] || 'User',
                email: this.currentUser?.email || ''
            };
            // Do not throw - allow init to continue and render fallback UI
            return;
        }
    }

    // Render profile form in DOM
    renderProfileForm() {
        const profileContent = document.getElementById('profile-content');
        const displayName = this.userProfile?.full_name || this.currentUser?.email?.split('@')[0] || 'User';
        
        profileContent.innerHTML = `
            <form class="profile-form" id="profile-form">
                <div class="form-group">
                    <label for="fullName">Full Name</label>
                    <input 
                        type="text" 
                        id="fullName" 
                        name="fullName"
                        value="${displayName}"
                        placeholder="Enter your full name"
                        required
                    />
                </div>
                
                <div class="form-group">
                    <label for="email">Email Address</label>
                    <input 
                        type="email" 
                        id="email" 
                        name="email"
                        value="${this.currentUser?.email || ''}"
                        disabled
                    />
                </div>
                
                <div class="profile-actions">
                    <button type="submit" class="btn btn-primary" id="saveBtn">
                        <i class="fas fa-save"></i> Save Changes
                    </button>
                    <button type="button" class="btn btn-danger" id="logoutBtn">
                        <i class="fas fa-sign-out-alt"></i> Logout
                    </button>
                </div>
            </form>
        `;
        
        // Update avatar with initials
        this.updateAvatar(displayName);
        // Attach event listeners now that the DOM for the form exists
        try {
            this.setupEventListeners();
        } catch (err) {
            console.warn('Failed to attach profile event listeners', err);
        }
    }

    // Update avatar with user initials
    updateAvatar(name) {
        const avatar = document.getElementById('profile-avatar');
        if (avatar) {
            const initials = name
                .split(' ')
                .map(part => part.charAt(0).toUpperCase())
                .join('')
                .slice(0, 2);
            
            avatar.innerHTML = initials || '👤';
        }
    }

    // Setup form event listeners
    setupEventListeners() {
        const container = document.getElementById('profile-content');
        // Avoid attaching duplicate listeners
        if (container && container.dataset.profileListeners === 'attached') return;

        const form = document.getElementById('profile-form');
        const logoutBtn = document.getElementById('logoutBtn');

        if (form) {
            form.addEventListener('submit', (e) => this.handleSaveProfile(e));
        } else if (container) {
            // Delegate submit events so handler works if the form is rendered later
            container.addEventListener('submit', (e) => {
                const f = e.target && e.target.closest && e.target.closest('form');
                if (f && f.id === 'profile-form') this.handleSaveProfile(e);
            });
        }

        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.handleLogout());
        } else if (container) {
            container.addEventListener('click', (e) => {
                const target = e.target && e.target.closest && e.target.closest('#logoutBtn');
                if (target) this.handleLogout();
            });
        }

        if (container) container.dataset.profileListeners = 'attached';
    }

    // Save profile changes to Supabase
    async handleSaveProfile(e) {
        e.preventDefault();
        
        const fullNameInput = document.getElementById('fullName');
        const newFullName = fullNameInput?.value?.trim();

        if (!newFullName) {
            this.showToast('Full name cannot be empty', 'error');
            return;
        }

        try {
            const saveBtn = document.getElementById('saveBtn');
            if (saveBtn) saveBtn.disabled = true;

            // Update full_name in public.users table
            const { error } = await supabaseClient
                .from('users')
                .update({ full_name: newFullName })
                .eq('id', this.currentUser.id);

            if (error) {
                throw error;
            }

            // Update local state
            this.userProfile.full_name = newFullName;

            // Update avatar
            this.updateAvatar(newFullName);

            this.showToast('Profile updated successfully', 'success');

            // Re-enable button
            if (saveBtn) saveBtn.disabled = false;
        } catch (error) {
            console.error('Save profile error:', error);
            this.showToast('Failed to save profile', 'error');
            const saveBtn = document.getElementById('saveBtn');
            if (saveBtn) saveBtn.disabled = false;
        }
    }

    // Handle logout
    async handleLogout() {
        try {
            const { error } = await supabaseClient.auth.signOut();

            if (error) {
                throw error;
            }

            this.showToast('Logged out successfully', 'success');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 800);
        } catch (error) {
            console.error('Logout error:', error);
            this.showToast('Failed to logout', 'error');
            // Force redirect anyway
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 2000);
        }
    }

    // Show toast notification
    showToast(message, type = 'success') {
        const existingToast = document.querySelector('.toast');
        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
            ${message}
        `;

        document.body.appendChild(toast);

        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 3000);
    }

    // Redirect to login page
    redirectToLogin() {
        window.location.href = 'index.html';
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const profileManager = new ProfileManager();
    profileManager.init();
});
