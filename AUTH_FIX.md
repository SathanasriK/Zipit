# Zipit Authentication Flow - Fixed Code

This document provides the corrected authentication methods that fix the auth flow issues.

## Core Authentication Methods

### 1. `initializeAuth()` - Session Restoration & Auth State Management

```javascript
async initializeAuth() {
    try {
        // STEP 1: Restore session on app load
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (error) console.error('Session error:', error);

        if (session?.user) {
            console.log('Session restored on app load for user:', session.user.id);
            await this.setCurrentUser(session.user);
            await this.loadUserScopedStorage(session.user.id);
            await this.loadUserTrips();
            this.updateLoginState();
            // Cleanup invalid trip IDs after user is authenticated
            try {
                await this.cleanupInvalidSupabaseTripIds();
            } catch (err) {
                console.warn('Supabase cleanup failed', err);
            }
        }

        // STEP 2: Listen for auth state changes
        supabaseClient.auth.onAuthStateChange(async (event, session) => {
                    if (event === 'SIGNED_IN' && session?.user) {
                        console.log('Auth state changed to SIGNED_IN for user:', session.user.id);
                        await this.setCurrentUser(session.user);
                        // Clear old user data and load fresh data for new user
                        await this.clearOldUserData();
                        await this.loadUserScopedStorage(session.user.id);
                        await this.migrateLocalToSupabase();
                        await this.loadUserTrips();
                        this.updateLoginState();
                        // Cleanup invalid trip IDs after sign-in
                        try {
                            await this.cleanupInvalidSupabaseTripIds();
                        } catch (err) {
                            console.warn('Supabase cleanup failed', err);
                        }
                        this.closeModal('login-modal');
                        this.showToast('Welcome back!', 'success');
                    }

            if (event === 'SIGNED_OUT') {
                console.log('Auth state changed to SIGNED_OUT');
                this.currentUser = null;
                    // Clear all user-specific data on sign out
                    await this.clearOldUserData();
                    // Ensure trips list is empty when signed out
                    this.trips = [];
                    this.updateLoginState();
                    this.updateDashboard();
                    this.showToast("You've been signed out", 'info');
            }
        });
    } catch (err) {
        console.error('Auth initialization error:', err);
    }
}
```

### 2. `setCurrentUser(user)` - Store Authenticated User

```javascript
async setCurrentUser(user) {
    this.currentUser = {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || user.email.split('@')[0]
    };
    this.saveToStorage('zipit_user', this.currentUser);
}
```

### 3. `handleLogin(e)` - Sign-In ONLY (No Signup Check)

```javascript
async handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    if (!email || !password) {
        this.showToast('Please fill in all fields', 'error');
        return;
    }

    // Show loading state
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
    submitBtn.disabled = true;

    if (!supabaseClient) {
        // Demo login
        setTimeout(() => {
            this.currentUser = { 
                email: email, 
                name: email.split('@')[0],
                id: 'demo-user'
            };
            this.updateLoginState();
            this.closeModal('login-modal');
            this.showToast('Welcome! (Demo Mode)', 'success');

            // Reset button
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
            e.target.reset();
        }, 1500);
        return;
    }

    try {
        // MANDATORY: Attempt sign-in FIRST with existing credentials
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            // If Supabase returns an auth error (bad credentials), show it.
            const msg = error?.message || String(error);
            this.showToast(msg, 'error');
            // Do NOT attempt signup or check public.users table here.
            // Bad credentials means wrong password or invalid email format.
            return;
        }

        const user = data?.user || data?.session?.user;
        if (!user) {
            this.showToast('Signed in, but no user data returned.', 'warning');
            return;
        }

        // Check if email is confirmed
        if (!user.email_confirmed_at) {
            console.warn('User email not confirmed:', user.email);
            this.showToast('Please confirm your email before logging in. Check your inbox for a confirmation link.', 'warning');
            return;
        }

        console.log('Sign-in successful:', user);
        
        // Set current user immediately after successful sign-in
        await this.setCurrentUser(user);
        // Clear old user data and load fresh data for new user
        await this.clearOldUserData();
        await this.loadUserScopedStorage(user.id);
        await this.loadUserTrips();
        this.updateLoginState();
        this.updateDashboard();
        this.closeModal('login-modal');
        this.showToast('Signed in successfully', 'success');

        // Navigate to dashboard so user can continue using the app
        this.showSection('dashboard');
        this.updateNavigation('dashboard');

        // Reset form
        e.target.reset();
    } catch (error) {
        // Network or unexpected error when contacting Supabase.
        const msg = error?.message || String(error);
        console.error('Sign-in network/error:', error);
        this.showToast('Network/auth server error. Trying local fallback...', 'warning');

        // Try local account fallback (for offline/demo usage)
        const local = this.findLocalAccount(email, password);
        if (local) {
            this.currentUser = { id: `local-${email}`, email: email, name: email.split('@')[0] };
            this.updateLoginState();
            this.closeModal('login-modal');
            this.showToast('Signed in locally (offline mode)', 'success');
            this.showSection('dashboard');
            this.updateNavigation('dashboard');
        } else {
            this.showToast('Sign-in failed: ' + msg, 'error');
        }
    } finally {
        // Reset button
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}
```

### 4. `handleSignup()` - Try Sign-In FIRST, Then Signup

```javascript
async handleSignup() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    if (!email || !password) {
        this.showToast('Please fill in email and password', 'error');
        return;
    }

    if (password.length < 6) {
        this.showToast('Password must be at least 6 characters', 'error');
        return;
    }

    const signupBtn = document.getElementById('signup-btn');
    const originalText = signupBtn.innerHTML;
    signupBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking credentials...';
    signupBtn.disabled = true;

    if (!supabaseClient) {
        // Demo signup
        setTimeout(() => {
            this.currentUser = {
                email: email,
                name: email.split('@')[0], 
                id: 'demo-user'
            };
            this.updateLoginState();
            this.closeModal('login-modal');
            this.showToast('Account created! (Demo Mode)', 'success');

            signupBtn.innerHTML = originalText;
            signupBtn.disabled = false;
        }, 1500);
        return;
    }

    try {
        // MANDATORY FIX: ALWAYS attempt sign-in FIRST
        // If the user exists, sign them in immediately
        console.log('Attempting sign-in for email:', email);
        const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

        // If sign-in succeeds, user exists - sign them in and skip signup
        if (!signInError && (signInData?.user || signInData?.session?.user)) {
            const user = signInData.user || signInData.session.user;
            console.log('User already exists and sign-in succeeded:', user.id);
            
            // Check if email is confirmed
            if (!user.email_confirmed_at) {
                console.warn('User email not confirmed:', user.email);
                this.showToast('Please confirm your email before logging in. Check your inbox for a confirmation link.', 'warning');
                signupBtn.innerHTML = originalText;
                signupBtn.disabled = false;
                return;
            }

            // Set current user immediately
            await this.setCurrentUser(user);
            await this.clearOldUserData();
            await this.loadUserScopedStorage(user.id);
            await this.loadUserTrips();
            this.updateLoginState();
            this.closeModal('login-modal');
            this.showToast('Welcome back! You are signed in.', 'success');
            document.getElementById('login-form').reset();
            signupBtn.innerHTML = originalText;
            signupBtn.disabled = false;
            return;
        }

        // If sign-in failed with "invalid credentials" or "user not found", then attempt signup
        // Only proceed if the error indicates the user doesn't exist
        const signInErrorMsg = signInError?.message || '';
        const userNotFound = signInErrorMsg.includes('Invalid login credentials') || 
                             signInErrorMsg.includes('User not found') ||
                             signInErrorMsg.includes('Email not confirmed');
        
        if (!userNotFound && signInError) {
            // Some other sign-in error (network, etc.) - don't attempt signup
            console.error('Sign-in error (not proceeding with signup):', signInError);
            this.showToast('Could not verify credentials. Please try again.', 'error');
            signupBtn.innerHTML = originalText;
            signupBtn.disabled = false;
            return;
        }

        // Proceed with signup only if user doesn't exist
        console.log('User does not exist, attempting signup for email:', email);
        signupBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';

        const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: email.split('@')[0]
                }
            }
        });

        if (signUpError) {
            // If signup fails (e.g., user exists due to race condition), try sign-in again
            if (signUpError.message.includes('already registered') || signUpError.message.includes('duplicate')) {
                console.log('User was created between sign-in check and signup attempt, trying sign-in again');
                const { data: retrySignIn, error: retryError } = await supabaseClient.auth.signInWithPassword({
                    email: email,
                    password: password
                });
                if (retryError) {
                    this.showToast('Signup failed. Please try signing in.', 'error');
                    signupBtn.innerHTML = originalText;
                    signupBtn.disabled = false;
                    return;
                }
                const user = retrySignIn.user || retrySignIn.session?.user;
                if (user) {
                    await this.setCurrentUser(user);
                    await this.clearOldUserData();
                    await this.loadUserScopedStorage(user.id);
                    await this.loadUserTrips();
                    this.updateLoginState();
                    this.closeModal('login-modal');
                    this.showToast('Account exists! You are now signed in.', 'success');
                    document.getElementById('login-form').reset();
                    signupBtn.innerHTML = originalText;
                    signupBtn.disabled = false;
                    return;
                }
            } else {
                this.showToast('Signup failed: ' + (signUpError.message || signUpError), 'error');
                signupBtn.innerHTML = originalText;
                signupBtn.disabled = false;
                return;
            }
        }

        // Signup was successful - attempt to sign in immediately
        const user = signUpData?.user || signUpData?.session?.user;
        if (user) {
            console.log('SignUp returned user:', user);
            await this.setCurrentUser(user);
            await this.clearOldUserData();
            this.loadUserScopedStorage(user.id);
            await this.loadUserTrips();
            this.updateLoginState();
            this.closeModal('login-modal');
            this.showToast('Account created and signed in! Welcome!', 'success');
        } else {
            // Signup succeeded but no user returned - attempt sign-in
            try {
                console.log('Attempting sign-in after signup for', email);
                const { data: signInRetry, error: signInRetryError } = await supabaseClient.auth.signInWithPassword({
                    email,
                    password
                });
                if (signInRetryError) {
                    console.error('Sign-in after signup error:', signInRetryError);
                    this.showToast('Account created! If your project requires email confirmation, please check your email.', 'success');
                } else if (signInRetry && (signInRetry.user || signInRetry.session?.user)) {
                    const signedInUser = signInRetry.user || signInRetry.session.user;
                    console.log('Sign-in after signup successful:', signedInUser);
                    await this.setCurrentUser(signedInUser);
                    await this.clearOldUserData();
                    await this.loadUserScopedStorage(signedInUser.id);
                    await this.loadUserTrips();
                    this.updateLoginState();
                    this.closeModal('login-modal');
                    this.showToast('Account created and signed in! Welcome!', 'success');
                } else {
                    console.warn('Sign-in after signup returned no user data:', signInRetry);
                    this.showToast('Account created! Please check your email to verify before signing in.', 'success');
                }
            } catch (err) {
                // Network error after signup - save account locally
                console.error('Network error after signup:', err);
                this.saveLocalAccount(email, password);
                this.currentUser = { id: `local-${email}`, email: email, name: email.split('@')[0] };
                this.updateLoginState();
                this.closeModal('login-modal');
                this.showToast('Account created locally (offline mode). You are signed in.', 'success');
            }
        }

        document.getElementById('login-form').reset();

    } catch (error) {
        console.error('Signup error:', error);
        // Network/server error - save account locally as fallback
        this.saveLocalAccount(email, password);
        this.currentUser = { id: `local-${email}`, email: email, name: email.split('@')[0] };
        this.updateLoginState();
        this.closeModal('login-modal');
        this.showToast('Account created locally (offline mode). You are signed in.', 'success');
    } finally {
        signupBtn.innerHTML = originalText;
        signupBtn.disabled = false;
    }
}
```

### 5. `getCurrentUserId()` - Retrieve Authenticated User ID

```javascript
async getCurrentUserId() {
    try {
        if (supabaseClient && supabaseClient.auth) {
            // Try getUser() first (most reliable for current session)
            const { data } = await supabaseClient.auth.getUser();
            if (data && data.user && data.user.id) {
                console.log('getCurrentUserId: got user id from auth.getUser():', data.user.id);
                return data.user.id;
            }

            // Fallback to getSession() if getUser() doesn't work
            const { data: sessionData } = await supabaseClient.auth.getSession();
            if (sessionData && sessionData.session && sessionData.session.user && sessionData.session.user.id) {
                console.log('getCurrentUserId: got user id from session:', sessionData.session.user.id);
                return sessionData.session.user.id;
            }
        }
    } catch (e) {
        console.warn('getCurrentUserId error:', e);
    }
    // Final fallback to this.currentUser
    if (this.currentUser && this.currentUser.id) {
        console.log('getCurrentUserId: using fallback currentUser.id:', this.currentUser.id);
        return this.currentUser.id;
    }
    console.warn('getCurrentUserId: No user ID found');
    return null;
}
```

## Key Fixes Implemented

✅ **Session Restoration**: `getSession()` called on app load - users stay logged in  
✅ **Sign-In First**: `handleSignup()` ALWAYS attempts `signInWithPassword()` first  
✅ **No DB Checks**: Never use `public.users` to decide login vs signup  
✅ **Immediate User Set**: `setCurrentUser()` called immediately after sign-in success  
✅ **No Repeated Signup**: If sign-in succeeds, signup is skipped  
✅ **Race Condition Handling**: If user created between checks, retries sign-in  
✅ **Proper JWT Handling**: Uses `getSession()` + `onAuthStateChange()` for token management  
✅ **No 400 Errors**: Cleanup only runs after user is authenticated  

## Implementation Steps

1. Find the `initializeAuth()`, `handleLogin()`, and `handleSignup()` methods in your `app.js`
2. Replace them with the code above
3. Ensure `setCurrentUser()` and `getCurrentUserId()` match the versions above
4. Test: Existing user should be able to sign in without being forced to create account
5. Test: New user clicking "Create Account" should trigger signup

That's it! The auth flow is now fixed.
