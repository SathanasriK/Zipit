
// ZipIt Enhanced Travel Packing Application
// Modern JavaScript with enhanced features and animations

// Supabase Configuration
const SUPABASE_URL = 'https://sfhuyrgphlhkmvosobqj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmaHV5cmdwaGxoa212b3NvYnFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0NDA2OTUsImV4cCI6MjA3MzAxNjY5NX0.8iRz_3tOnZRNMqDJ2odiZhp_XWrKTIncES31bxa-TPw';

// Optional travel data API (configure with your API endpoint/key if available)
// If not set, ZipIt will show mocked suggestions for flights/trains/buses.
const TRAVEL_API_URL = ''; // e.g. 'https://your-travel-api.example.com'
const TRAVEL_API_KEY = ''; // optional API key

// Nominatim (OpenStreetMap) geocoding endpoint (no key required) used for estimating distances
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

// Load environment variables from .env in Node.js, then read the OpenWeather API key
let OPENWEATHERMAP_API_KEY = '';
if (typeof process !== 'undefined' && typeof require === 'function') {
    try {
        require('dotenv').config();
    } catch (err) {
        // dotenv is optional here; if not installed or if this file is loaded in a browser, ignore.
    }
}
if (typeof process !== 'undefined' && process.env && process.env.OPENWEATHER_API_KEY) {
    OPENWEATHERMAP_API_KEY = process.env.OPENWEATHER_API_KEY;
}

// ============================================================================
// LLM API Configuration for intelligent chatbot responses
// ============================================================================
// IMPORTANT: Configure one of these to enable AI-powered chat responses
// 
// OPTION 1: OpenAI API (Recommended) - EASIEST TO SET UP
// -------------------------------------------------------
// 1. Go to: https://platform.openai.com/account/api-keys
// 2. Sign up with email (free $18 credits)
// 3. Click "Create new secret key"
// 4. Copy the key (starts with "sk-")
// 5. Paste it below in OPENAI_API_KEY = 'sk-...'
// 6. Reload this page and test the chatbot
//
// OPTION 2: HuggingFace Inference API (Free Alternative)
// -------------------------------------------------------
// 1. Go to: https://huggingface.co/settings/tokens
// 2. Create new token (read access)
// 3. Paste in HUGGINGFACE_API_KEY = 'hf_...'
//
// OPTION 3: Google Generative AI (Free)
// -------------------------------------------------------
// 1. Go to: https://makersuite.google.com/app/apikey
// 2. Create API key
// 3. Paste in GOOGLE_API_KEY = '...'
// ============================================================================

// Choose your LLM provider:
const LLM_PROVIDER = 'openai'; // Options: 'openai', 'huggingface', 'google', 'anthropic'

// ===== PASTE YOUR API KEYS BELOW =====

// OpenAI Configuration (SET THIS FIRST!)
// Example: const OPENAI_API_KEY = 'sk-proj-abc123...';
const OPENAI_API_KEY = ''; // ← PASTE YOUR OPENAI API KEY HERE

const OPENAI_MODEL = 'gpt-3.5-turbo'; // or 'gpt-4', 'gpt-4-turbo-preview'

// HuggingFace Configuration (Alternative)
// Example: const HUGGINGFACE_API_KEY = 'hf_abc123...';
const HUGGINGFACE_API_KEY = ''; // hf_... (optional alternative)
const HUGGINGFACE_MODEL = 'tiiuae/falcon-7b-instruct'; // Free model

// Google Generative AI Configuration (Alternative)
// Example: const GOOGLE_API_KEY = 'AIza...';
const GOOGLE_API_KEY = ''; // (optional alternative)


// Initialize Supabase client
const supabaseClient = (typeof supabase !== 'undefined' && SUPABASE_URL && SUPABASE_ANON_KEY) ?
    supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Expose Supabase to the window for debugging in the browser console.
// As requested: expose the library object; also expose the created client instance.
try {
    window.supabase = supabase;
    window.supabaseClient = supabaseClient;
    // Prefer the actual client instance if available
    if (supabaseClient) window.supabase = supabaseClient;
} catch (e) { /* ignore in non-browser environments */ }

// Helper: call the Supabase Edge Function `llm-proxy` to query the LLM securely
async function callLLMViaSupabase(messages, model = OPENAI_MODEL) {
    try {
        // Preferred: use supabase client functions API (supabase-js v2+)
        // v2 invoke() returns { data, error } — NOT a fetch Response object
        if (typeof supabaseClient !== 'undefined' && supabaseClient && supabaseClient.functions && typeof supabaseClient.functions.invoke === 'function') {
            const { data, error } = await supabaseClient.functions.invoke('llm-proxy', {
                body: { messages, model }
            });
            if (error) {
                throw new Error('Supabase function error: ' + (error.message || JSON.stringify(error)));
            }
            // data is already parsed JSON from the edge function response
            if (data) return data;
            throw new Error('Supabase function returned empty data');
        }

        // Fallback: call the Supabase Functions HTTP endpoint directly
        if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Supabase config missing');
        const url = `${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/llm-proxy`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({ messages, model })
        });
        if (!res.ok) {
            const t = await res.text();
            throw new Error('Supabase function error: ' + t);
        }
        return await res.json();
    } catch (err) {
        console.error('[callLLMViaSupabase] failed', err);
        throw err;
    }
}

class ZipItApp {
    constructor() {
        this.currentUser = null;
        this.trips = [];
        this.currentTripId = null;
        this.currentPackingList = {};
        this.isOnline = navigator.onLine;
        this.offlineQueue = [];
        this._suppressAnimations = false;
        this.activeTripFilter = 'all';
        this.isCreatingTrip = false;
        this.pendingTripCreateId = null;

        // No demo trips: trips must come exclusively from localStorage

        this.packingCategories = {
            essentials: [
                "Passport", "Visa", "Travel Insurance", "Flight Tickets",
                "Hotel Confirmations", "Travel Itinerary", "Emergency Contacts",
                "Wallet", "Credit/Debit Cards", "Cash", "Phone", "Charger"
            ],
            clothing: [
                "T-shirts", "Long-sleeve shirts", "Pants/Jeans", "Shorts",
                "Underwear", "Bras", "Socks", "Pajamas", "Jacket/Coat",
                "Dress", "Formal wear", "Comfortable shoes", "Sandals"
            ],
            toiletries: [
                "Toothbrush", "Toothpaste", "Shampoo", "Conditioner",
                "Body wash", "Deodorant", "Sunscreen", "Moisturizer",
                "Razor", "Shaving cream", "Makeup", "Perfume", "Medications"
            ],
            tech: [
                "Laptop", "Tablet", "Camera", "Headphones", "Power Bank",
                "USB Cables", "Travel Adapter", "External Hard Drive",
                "Smartwatch", "E-reader", "Portable Speaker"
            ],
            health: [
                "First Aid Kit", "Prescription Medications", "Vitamins",
                "Hand Sanitizer", "Face Masks", "Thermometer",
                "Pain Relievers", "Allergy Medicine", "Band-aids"
            ]
        };

        // Track AI chat interactions per trip to personalize suggestions
        this.aiInteractionHistory = {}; // { [tripId]: { added: [], removed: [] } }

        // Lightweight suggestion map: seed item -> suggested complementary items
        this.suggestionMap = {
            'sunscreen': ['lip balm with SPF', 'after-sun lotion', 'sun hat', 'sunglasses'],
            'swimwear': ['beach towel', 'flip flops', 'waterproof bag', 'snorkel mask'],
            'toothbrush': ['toothpaste', 'floss', 'mouthwash'],
            'laptop': ['charger', 'mouse', 'laptop sleeve', 'hdmi adapter'],
            'camera': ['extra sd card', 'spare battery', 'camera charger', 'lens cloth'],
            'first aid kit': ['band-aids', 'antiseptic wipes', 'pain relievers'],
            'passport': ['passport holder', 'copies of passport', 'emergency contacts on paper'],
            'power bank': ['usb cables', 'wall charger'],
            'jacket': ['beanie', 'gloves'],
            'charger': ['power bank', 'usb cables']
        };

        this.weatherIcons = {
            sunny: 'fas fa-sun',
            cloudy: 'fas fa-cloud',
            'partly cloudy': 'fas fa-cloud-sun',
            'light rain': 'fas fa-cloud-rain',
            rainy: 'fas fa-cloud-rain',
            humid: 'fas fa-cloud',
            snow: 'fas fa-snowflake',
            windy: 'fas fa-wind'
        };

        this.init();
    }

    // Generate a UUID for new trips (uses crypto.randomUUID when available)
    generateUUID() {
        try {
            if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
        } catch (e) { }
        // Fallback to RFC4122 v4 using crypto.getRandomValues
        try {
            const buf = new Uint8Array(16);
            (typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto : window.crypto).getRandomValues(buf);
            // Per RFC4122 v4
            buf[6] = (buf[6] & 0x0f) | 0x40;
            buf[8] = (buf[8] & 0x3f) | 0x80;
            const hex = Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
            return `${hex.substr(0, 8)}-${hex.substr(8, 4)}-${hex.substr(12, 4)}-${hex.substr(16, 4)}-${hex.substr(20, 12)}`;
        } catch (e) {
            // Ultimate fallback
            return 'id-' + Date.now() + '-' + Math.floor(Math.random() * 1000000);
        }
    }

    // Query LLM via Supabase Edge Function proxy (returns assistant text or raw response)
    async queryLLM(messages, model = OPENAI_MODEL) {
        try {
            const res = await callLLMViaSupabase(messages, model);
            // Normalize common OpenAI-style responses
            if (res && res.choices && Array.isArray(res.choices) && res.choices[0] && res.choices[0].message) {
                return res.choices[0].message.content;
            }
            if (res && typeof res.reply === 'string') return res.reply;
            // last-resort: stringify whole response
            return typeof res === 'string' ? res : JSON.stringify(res);
        } catch (err) {
            console.error('[queryLLM] error', err);
            throw err;
        }
    }

    // Validate UUID v4-ish pattern (36 chars with hyphens)
    isValidUUID(id) {
        if (!id || typeof id !== 'string') return false;
        return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id);
    }

    // Log actions for audit and undo (DB or localStorage fallback)
    async logAction(actionType, payload, tripId, previousState, newState) {
        const userId = await this.getCurrentUserId();
        const entry = {
            user_id: userId || null,
            trip_id: tripId,
            action_type: actionType,
            action_payload: payload ? JSON.stringify(payload) : null,
            previous_state: previousState ? JSON.stringify(previousState) : null,
            new_state: newState ? JSON.stringify(newState) : null
        };
        // ...existing code for logging actions...
    }

    async handleTripCreation(e) {
        if (e && typeof e.preventDefault === 'function') {
            e.preventDefault();
        }

        if (this.isCreatingTrip) {
            console.warn('Trip creation already in progress');
            this.showToast('Trip creation is already in progress. Please wait.', 'info');
            return;
        }
        this.isCreatingTrip = true;

        const formEl = (e.currentTarget && e.currentTarget.tagName === 'FORM')
            ? e.currentTarget
            : (e.target && typeof e.target.closest === 'function'
                ? e.target.closest('form')
                : document.getElementById('trip-form'));

        if (!formEl) {
            console.error('Trip creation form not found');
            this.isCreatingTrip = false;
            return;
        }

        const restoreTripCreationState = () => {
            this.isCreatingTrip = false;
            this.pendingTripCreateId = null;
            if (submitBtn) {
                submitBtn.disabled = false;
                if (originalSubmitText !== null) {
                    submitBtn.innerHTML = originalSubmitText;
                }
            }
        };

        let submitBtn = null;
        let originalSubmitText = null;
        const formData = new FormData(formEl);
        const isEditing = !!this.editingTripId;
        let tripData;
        if (isEditing) {
            // Editing existing trip
            tripData = this.trips.find(t => t.id === this.editingTripId);
            if (!tripData) {
                this.showToast('Trip not found for editing', 'error');
                return;
            }
            tripData.title = formData.get('trip-title') || `Trip to ${formData.get('destination')}`;
            tripData.destination = formData.get('destination');
            tripData.startDate = formData.get('start-date');
            tripData.endDate = formData.get('end-date');
            tripData.transport = formData.get('transport');
            tripData.purpose = formData.get('purpose');
            tripData.startLocation = formData.get('start-location') || '';
            // Recalculate duration
            const startDate = new Date(tripData.startDate);
            const endDate = new Date(tripData.endDate);
            tripData.duration = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
            // Validate dates
            if (startDate >= endDate) {
                this.showToast('End date must be after start date', 'error');
                restoreTripCreationState();
                return;
            }
        } else {
            // Creating new trip - use native crypto.randomUUID() and numeric timestamp
            const newId = crypto.randomUUID();
            tripData = {
                id: newId,
                title: formData.get('trip-title') || `Trip to ${formData.get('destination')}`,
                destination: formData.get('destination'),
                startDate: formData.get('start-date'),
                endDate: formData.get('end-date'),
                transport: formData.get('transport'),
                purpose: formData.get('purpose'),
                startLocation: formData.get('start-location') || '',
                progress: 0,
                weather: this.generateWeatherData(formData.get('destination')),
                createdAt: Date.now()
            };
            // Calculate duration
            const startDate = new Date(tripData.startDate);
            const endDate = new Date(tripData.endDate);
            tripData.duration = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
            // Validate dates
            if (startDate >= endDate) {
                this.showToast('End date must be after start date', 'error');
                restoreTripCreationState();
                return;
            }
        }

        // Validate start location for road-based transport
        const transport = formData.get('transport') || '';
        const roadModes = ['bike', 'car', 'bus', 'ferry'];
        const isRoadBased = roadModes.some(mode => transport.toLowerCase().includes(mode));
        if (isRoadBased) {
            const startLocation = formData.get('start-location')?.trim();
            if (!startLocation) {
                const errorEl = document.getElementById('start-location-error');
                if (errorEl) errorEl.style.display = '';
                const inputEl = document.getElementById('start-location');
                if (inputEl) inputEl.focus();
                restoreTripCreationState();
                return;
            } else {
                const errorEl = document.getElementById('start-location-error');
                if (errorEl) errorEl.style.display = 'none';
            }
        }

        // Calculate Google Maps route for transport modes (non-blocking)
        if (tripData.transportMode && ['bike', 'car', 'bus', 'ferry'].includes(tripData.transportMode.toLowerCase())) {
            try {
                if (!window.mapsRouteHandler) {
                    const apiKey = this.getConfig('GOOGLE_MAPS_API_KEY') || '';
                    window.mapsRouteHandler = new GoogleMapsRouteHandler(apiKey);
                }
                const startLocation = formData.get('start-location')?.trim() || 'Delhi, India';
                const routeData = await window.mapsRouteHandler.calculateRoute(startLocation, tripData.destination, 'DRIVING');
                tripData.route = routeData;
                console.log('Calculated shortest route:', routeData);
            } catch (err) {
                console.warn('Route calculation failed, continuing without route data:', err);
            }
        }

        // Show loading state (defensive: ensure we find the form and submit button)
        submitBtn = formEl ? formEl.querySelector(isEditing ? '#updateTripBtn' : '#create-trip-submit') : null;
        const originalText = submitBtn ? submitBtn.innerHTML : null;
        if (submitBtn) {
            submitBtn.innerHTML = isEditing ? '<i class="fas fa-spinner fa-spin"></i> Updating...' : '<i class="fas fa-spinner fa-spin"></i> Creating Trip...';
            submitBtn.disabled = true;
        }

        try {
            if (supabaseClient && this.currentUser) {
                const userId = await this.getCurrentUserId();
                if (!userId) {
                    throw new Error('Cannot create/update trip: user not authenticated');
                }
                if (isEditing) {
                    // Update trip in Supabase
                    const { error } = await supabaseClient
                        .from('trips')
                        .update({
                            title: tripData.title,
                            destination: tripData.destination,
                            start_date: tripData.startDate,
                            end_date: tripData.endDate,
                            transport: tripData.transport,
                            purpose: tripData.purpose
                        })
                        .eq('id', tripData.id)
                        .eq('user_id', userId);
                    if (error) throw error;
                } else {
                    // Insert new trip in Supabase only when we have a valid UUID for the id
                    if (this.isValidUUID(tripData.id)) {
                        const { data, error } = await supabaseClient
                            .from('trips')
                            .insert({
                                id: tripData.id,
                                title: tripData.title,
                                destination: tripData.destination,
                                start_date: tripData.startDate,
                                end_date: tripData.endDate,
                                transport: tripData.transport,
                                purpose: tripData.purpose,
                                user_id: userId,
                                created_at: tripData.createdAt
                            });
                        if (error) throw error;
                    } else {
                        // Skip cloud insert for non-UUID ids (local-only trip)
                        console.warn('[handleTripCreation] Skipping Supabase insert: invalid trip id', tripData.id);
                    }
                }
            }
        } catch (err) {
            console.error(isEditing ? 'Trip update error:' : 'Trip creation error:', err);
            this.showToast(isEditing ? 'Failed to update trip in cloud. Updated locally.' : 'Failed to save trip to cloud. Saved locally.', 'warning');
        }

        if (!isEditing) {
            try {
                const userIdForSave = await this.getCurrentUserId();
                const storageKey = userIdForSave ? `trips_${userIdForSave}` : 'trips';
                // Load existing trips array (must always be an array)
                const raw = localStorage.getItem(storageKey);
                const existingTrips = raw ? JSON.parse(raw) : [];
                if (!Array.isArray(existingTrips)) {
                    // Defensive: ensure it's an array
                    console.warn('[handleTripCreation] existing trips in storage was not an array, resetting to []');
                    existingTrips.length = 0;
                }
                // Append new trip
                existingTrips.push(tripData);
                // Save back to localStorage
                localStorage.setItem(storageKey, JSON.stringify(existingTrips));
                // Update in-memory and refresh UI immediately
                this.trips = existingTrips;
                this.cleanupDuplicateTripRecords();
                try { this.updateTripsGrid(); } catch (e) { console.warn('updateTripsGrid failed after create', e); }
            } catch (e) {
                console.error('[handleTripCreation] Failed to persist new trip to localStorage', e);
                // Fallback to in-memory only
                this.trips = this.trips || [];
                this.trips.push(tripData);
                try { this.updateTripsGrid(); } catch (err) { }
            }
        } else {
            // Editing an existing trip: update in-memory and persist via saveUserTrips
            const idx = this.trips.findIndex(t => t.id === tripData.id);
            if (idx !== -1) this.trips[idx] = tripData;
            this.saveUserTrips();
        }

        // Apply dynamic weather background for the trip destination (fire-and-forget)
        try {
            this.applyWeatherBackgroundForDestination(tripData.destination).catch(err =>
                console.warn('Weather background update failed:', err)
            );
        } catch (err) {
            console.warn('applyWeatherBackgroundForDestination error:', err);
        }

        // If user chose to use a saved template during creation, apply it now
        try {
            const useTpl = document.getElementById('use-saved-templates');
            const tplSelect = document.getElementById('template-select');
            if (!isEditing && useTpl && useTpl.checked && tplSelect && tplSelect.value) {
                // Find template data - prefer fetching fresh from server
                const templates = await this.fetchUserPackingTemplates();
                const selected = templates.find(t => (t.id && t.id.toString() === tplSelect.value) || (t.name && (t.name === tplSelect.options[tplSelect.selectedIndex].text)));
                if (selected) {
                    this.applyPackingTemplateToTrip(tripData.id, selected);
                } else {
                    // Fallback: try to read items from the option dataset
                    const opt = tplSelect.options[tplSelect.selectedIndex];
                    if (opt && opt.dataset && opt.dataset.items) {
                        try {
                            const items = JSON.parse(opt.dataset.items);
                            this.applyPackingTemplateToTrip(tripData.id, { items });
                        } catch (err) {
                            console.warn('Failed to parse template items from select option', err);
                        }
                    }
                }
            }
        } catch (err) {
            console.warn('Applying selected template failed', err);
        }

        // Close modal and update UI
        this.closeModal('trip-modal');
        this.updateDashboard();
        this.showToast(isEditing ? `${tripData.title} updated successfully!` : `${tripData.title} created successfully!`, 'success');

        // Open the packing list for the trip so suggested items are shown
        try {
            // slight delay to ensure UI updated
            setTimeout(() => {
                this.openPackingList(tripData.id);
                // Launch the AI Agent experience for deeper, personalized suggestions (non-blocking)
                this.startAIAgentForTrip(tripData).catch(aiErr => {
                    console.error('AI Agent launch failed:', aiErr);
                });
            }, 300);
        } catch (err) {
            console.error('Failed to open packing list after creation/update', err);
        }

        // Reset form and button
        formEl.reset();
        if (submitBtn) {
            // restore original text only if we saved it earlier
            if (originalText !== null) submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
        // Clear editing state
        this.editingTripId = null;
        this.isCreatingTrip = false;
        this.pendingTripCreateId = null;
    }

    // If mode supports routing (car, bike, train, bus), provide a Google Maps route button

    _mockTransportOptions(mode, destination, startDate, endDate) {
        // Simple mocked providers and generated prices
        const providers = {
            flight: ['IndiGo', 'Air India', 'SpiceJet', 'Emirates', 'Vistara'],
            train: ['Express 123', 'Intercity 45', 'Regional 8'],
            bus: ['SuperBus', 'InterBus', 'CityLine']
        };

        const list = (providers[mode] || providers['bus']).slice(0, 3);
        return list.map((p, i) => ({
            provider: p,
            price: Math.round((50 + Math.random() * 300) * (mode === 'flight' ? 1.5 : 1)),
            duration: mode === 'flight' ? `${2 + i}h ${10 + i * 5}m` : `${3 + i * 2}h ${15 + i * 10}m`,
            details: `From ${destination}`
        }));
    }

    // Render transport suggestions into the UI and wire simple select handlers
    async showTransportSuggestions(mode, destination, startDate, endDate) {
        try {
            const sugEl = document.getElementById('transport-suggestions');
            if (!sugEl) return;

            // Check if this is a road-based transport mode
            const roadModes = ['bike', 'car', 'bus', 'ferry'];
            if (roadModes.includes(mode.toLowerCase())) {
                // For road transport, show Google Maps shortest route link
                const startLocationInput = document.getElementById('start-location');
                const startLocation = startLocationInput?.value?.trim() || 'Delhi, India'; // fallback
                const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(startLocation)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;

                sugEl.innerHTML = `
                    <div style="padding:12px;text-align:center;">
                        <div style="font-weight:600;margin-bottom:8px;">Shortest Route (Google Maps)</div>
                        <a href="${mapsUrl}" target="_blank" style="color:var(--primary);text-decoration:underline;">
                            View route from ${startLocation} to ${destination}
                        </a>
                    </div>
                `;
                return;
            }

            // Show loading state for non-road modes
            sugEl.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i> Loading suggestions...</div>';

            // Get origin (use demo or current user location)
            const origin = 'Delhi, India'; // Default origin; in future could use geolocation

            // Fetch live suggestions
            let options = [];
            if (window.transportSuggestions) {
                try {
                    options = await window.transportSuggestions.getSuggestions({
                        mode,
                        origin,
                        destination,
                        startDate,
                        endDate
                    });
                } catch (err) {
                    console.warn('Transport suggestions fetch failed, using fallback:', err);
                    options = this._mockTransportOptions(mode, destination, startDate, endDate);
                }
            } else {
                // Fallback if service not loaded
                options = this._mockTransportOptions(mode, destination, startDate, endDate);
            }

            if (!options || options.length === 0) {
                sugEl.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-secondary);">No suggestions available. Try another destination or date.</div>';
                return;
            }

            // Render suggestions
            const html = options.map((opt, idx) => {
                const isRoute = opt.isRoute;
                return `
                    <div class="transport-suggestion" style="padding:12px;border:1px solid var(--border);margin-bottom:10px;border-radius:6px;display:flex;justify-content:space-between;align-items:center;">
                        <div style="max-width:70%;">
                            <div style="font-weight:600;">${opt.provider}</div>
                            <div style="font-size:0.9rem;color:var(--text-secondary);">
                                ${opt.depart || 'TBD'} → ${opt.arrive || 'TBD'} 
                                <br>
                                ${opt.duration ? `Duration: ${opt.duration}` : ''}
                                ${opt.distance ? ` | Distance: ${opt.distance}` : ''}
                            </div>
                            ${opt.availability ? `<div style="font-size:0.85rem;color:var(--success);margin-top:4px;">✓ ${opt.availability}</div>` : ''}
                            ${opt.availableSeats ? `<div style="font-size:0.85rem;color:var(--success);margin-top:4px;">✓ ${opt.availableSeats}</div>` : ''}
                        </div>
                        <div style="text-align:right;">
                            ${opt.price ? `<div style="font-weight:700;margin-bottom:6px;">${opt.price}</div>` : ''}
                            <button class="btn btn--small btn--secondary select-transport-btn" data-provider="${opt.provider}" data-mode="${mode}" data-index="${idx}" ${isRoute ? 'data-is-route="true"' : ''}>
                                ${isRoute ? 'Show Route' : 'Select'}
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            sugEl.innerHTML = html;

            // Show airline selector only for flights
            const airlineGroup = document.getElementById('airline-group');
            if (airlineGroup) airlineGroup.style.display = (mode === 'flight') ? '' : 'none';

            // Attach handlers to select buttons
            const buttons = sugEl.querySelectorAll('.select-transport-btn');
            buttons.forEach((btn, idx) => {
                btn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    const provider = btn.dataset.provider;
                    const isRoute = btn.dataset.isRoute === 'true';
                    const transportEl = document.getElementById('transport');

                    if (transportEl) transportEl.value = provider;

                    // If this is a route, show the map
                    if (isRoute && options[idx] && options[idx].routeData) {
                        try {
                            await this.displayRouteOnMap(mode, options[idx]);
                        } catch (err) {
                            console.error('Failed to display route:', err);
                            this.showToast('Could not display route on map', 'error');
                        }
                    }

                    // Clear suggestions after selection
                    sugEl.innerHTML = '';
                    if (airlineGroup && mode !== 'flight') airlineGroup.style.display = 'none';
                });
            });

            // Add powered-by footer
            const footer = document.createElement('div');
            footer.style.cssText = 'padding:8px;font-size:0.75rem;color:var(--text-secondary);text-align:center;border-top:1px solid var(--border);margin-top:8px;';
            footer.innerHTML = '🔄 Powered by live APIs | Refreshed every 60 seconds';
            sugEl.appendChild(footer);

        } catch (err) {
            console.warn('showTransportSuggestions error:', err);
            // Fallback to mocked suggestions on error
            try {
                const sugEl = document.getElementById('transport-suggestions');
                if (sugEl) {
                    const options = this._mockTransportOptions(mode, destination, startDate, endDate) || [];
                    const html = options.map(opt => {
                        return `
                            <div class="transport-suggestion" style="padding:8px;border:1px solid var(--border);margin-bottom:8px;border-radius:6px;display:flex;justify-content:space-between;align-items:center;">
                                <div style="max-width:70%;">
                                    <div style="font-weight:600;">${opt.provider}</div>
                                    <div style="font-size:0.9rem;color:var(--text-secondary)">${opt.duration} · ${opt.details}</div>
                                </div>
                                <div style="text-align:right;">
                                    <div style="font-weight:700;margin-bottom:6px;">${opt.price}</div>
                                    <button class="btn btn--small btn--secondary select-transport-btn" data-provider="${opt.provider}" data-mode="${mode}">Select</button>
                                </div>
                            </div>
                        `;
                    }).join('');
                    sugEl.innerHTML = html;

                    // Attach handlers
                    const buttons = sugEl.querySelectorAll('.select-transport-btn');
                    buttons.forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            const provider = btn.dataset.provider;
                            const transportEl = document.getElementById('transport');
                            if (transportEl) transportEl.value = provider;
                            sugEl.innerHTML = '';
                        });
                    });
                }
            } catch (fallbackErr) {
                console.error('Fallback suggestions also failed:', fallbackErr);
            }
        }
    }

    /**
     * Display route on map for car/bike/ferry modes
     */
    async displayRouteOnMap(mode, routeOption) {
        // Create map container if it doesn't exist
        let mapContainer = document.getElementById('route-map-container');
        if (!mapContainer) {
            // Create a modal or inline container for the map
            mapContainer = document.createElement('div');
            mapContainer.id = 'route-map-container';
            mapContainer.style.cssText = `
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                height: 40vh;
                background: white;
                border-top: 2px solid var(--border);
                z-index: 5000;
                box-shadow: 0 -2px 10px rgba(0,0,0,0.1);
            `;

            const closeBtn = document.createElement('button');
            closeBtn.innerHTML = '<i class="fas fa-times"></i> Close Map';
            closeBtn.className = 'btn btn--outline btn--sm';
            closeBtn.style.cssText = 'position: absolute; top: 10px; right: 10px; z-index: 5001;';
            closeBtn.addEventListener('click', () => {
                mapContainer.style.display = 'none';
            });

            const mapDiv = document.createElement('div');
            mapDiv.id = 'google-maps-route';
            mapDiv.style.cssText = 'width: 100%; height: 100%;';

            mapContainer.appendChild(closeBtn);
            mapContainer.appendChild(mapDiv);
            document.body.appendChild(mapContainer);
        }

        mapContainer.style.display = 'block';

        // Initialize Google Maps and render route
        if (!window.mapsRouteHandler) {
            const apiKey = this.getConfig('GOOGLE_MAPS_API_KEY') || '';
            window.mapsRouteHandler = new GoogleMapsRouteHandler(apiKey);
        }

        try {
            await window.mapsRouteHandler.initializeGoogleMaps('google-maps-route');
            const routeResult = await window.mapsRouteHandler.renderRoute(
                routeOption.depart || 'Delhi, India',
                routeOption.arrive || 'Destination',
                this._getMapsTransportMode(mode)
            );

            console.debug('Route rendered:', routeResult);
            this.showToast(`Route displayed: ${routeResult.distance} (${routeResult.duration})`, 'success');
        } catch (err) {
            console.error('Error displaying route:', err);
            throw err;
        }
    }

    /**
     * Map app transport mode to Google Maps travel mode
     */
    _getMapsTransportMode(mode) {
        const modeMap = {
            'car': 'DRIVING',
            'bike': 'BICYCLING',
            'motorcycle': 'DRIVING',
            'ferry': 'TRANSIT'
        };
        return modeMap[mode.toLowerCase()] || 'DRIVING';
    }

    /**
     * Get configuration value (placeholder; integrate with actual config)
     */
    getConfig(key) {
        // Return from environment or config; for now return empty
        return process.env[key] || '';
    }


    openGoogleMapsRoute(mode, destination) {
        // Determine travelmode for Google Maps (driving, transit, bicycling, walking)
        const m = (mode || '').toLowerCase();
        let travelmode = 'driving';
        if (m.includes('train') || m.includes('bus') || m.includes('transit')) travelmode = 'transit';
        else if (m.includes('bike') || m.includes('bicycle')) travelmode = 'bicycling';
        else if (m.includes('walk')) travelmode = 'walking';

        const destinationEncoded = encodeURIComponent(destination || '');

        // Open a placeholder window synchronously so subsequent navigation
        // (after async geolocation) is treated as user-initiated and not blocked.
        const newWin = window.open('', '_blank');
        if (!newWin) {
            // Popup was blocked immediately — notify the user and fall back to direct open later
            if (this && typeof this.showToast === 'function') {
                this.showToast('Popup blocked. Allow popups for this site to open directions.', 'error');
            } else {
                console.warn('Popup blocked. Allow popups for this site to open directions.');
            }
        }

        const openWithOrigin = (origin) => {
            const originStr = origin ? `${origin.latitude},${origin.longitude}` : '';
            const base = 'https://www.google.com/maps/dir/?api=1';
            const params = new URLSearchParams();
            if (originStr) params.set('origin', originStr);
            params.set('destination', destinationEncoded);
            params.set('travelmode', travelmode);
            const url = `${base}&${params.toString()}`;

            // If we successfully opened a placeholder window, navigate it. Otherwise open normally.
            try {
                if (newWin && !newWin.closed) {
                    newWin.location.href = url;
                } else {
                    window.open(url, '_blank');
                }
            } catch (err) {
                // Some browsers may throw on cross-origin location assignment in rare contexts — fallback
                window.open(url, '_blank');
            }
        };

        // Try to get user's current position for an origin
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => openWithOrigin({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
                (err) => {
                    console.warn('Geolocation failed, opening maps without origin', err);
                    openWithOrigin(null);
                },
                { timeout: 8000 }
            );
        } else {
            openWithOrigin(null);
        }
    }

    _calculateDistanceKm(lat1, lon1, lat2, lon2) {
        // Haversine formula
        const toRad = (v) => v * Math.PI / 180;
        const R = 6371; // km
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    _formatDuration(hours) {
        const h = Math.floor(hours);
        const m = Math.round((hours - h) * 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    }

    async init() {
        this.showLoadingScreen();
        await this.loadApplicationData();
        this.setupEventListeners();
        this.setupComboLists();
        this.setupTheme();
        this.setupScrollAnimations();
        this.setupNetworkListeners();
        this.setupIntersectionObserver();

        // Setup dynamic weather overlay (canvas) behind the UI
        try {
            this.setupWeatherOverlay();
        } catch (e) {
            console.warn('Weather overlay init failed', e);
        }

        // Initialize Supabase auth if available
        if (supabaseClient) {
            console.log('✅ Supabase client initialized successfully');
            await this.initializeAuth();
        } else {
            console.log('❌ Supabase client not initialized - using demo mode');
            // Auto-login for demo
            this.currentUser = {
                name: 'Travel Enthusiast',
                email: 'demo@zipit.com',
                id: 'demo-user'
            };
            this.updateLoginState();
        }

        // Initialize with demo data or load from storage
        // If currentUser exists, load per-user namespaced storage; otherwise use shared storage
        if (this.currentUser && this.currentUser.id) {
            await this.loadUserScopedStorage(this.currentUser.id);
            // Run local cleanup immediately after loading user-scoped storage
            try { await this.cleanupLocalTrips(this.currentUser.id); } catch (e) { console.warn('cleanupLocalTrips failed', e); }
        } else {
            // Always load trips from localStorage using canonical helper. If none exist, remain empty.
            try {
                this.trips = await this.loadTrips();
            } catch (e) {
                this.trips = [];
            }
            this.currentPackingList = this.loadFromStorage(this.getUserStorageKey('packing')) || {};
            // Run cleanup for anonymous/global trips
            try { await this.cleanupLocalTrips(null); } catch (e) { console.warn('cleanupLocalTrips failed', e); }
        }

        // Note: cleanupInvalidSupabaseTripIds is now called after successful sign-in
        // to ensure authentication is ready before making Supabase queries

        this.updateDashboard();

        // Hide loading screen with delay for better UX
        setTimeout(() => {
            this.hideLoadingScreen();
            this.animateHeroElements();
        }, 3000);
    }

    // Enhance inputs that use datalist so the suggestion dropdown appears below the input
    setupComboLists() {
        const combos = [
            { inputId: 'purpose', listId: 'purpose-list' },
            { inputId: 'transport', listId: 'transport-list' }
        ];

        combos.forEach(c => this._createCombo(c.inputId, c.listId));
    }

    _createCombo(inputId, listId) {
        const input = document.getElementById(inputId);
        const datalist = document.getElementById(listId);
        if (!input || !datalist) return;

        const options = Array.from(datalist.querySelectorAll('option')).map(o => o.value).filter(Boolean);

        const parent = input.parentElement;
        if (parent) parent.style.position = parent.style.position || 'relative';

        const dropdown = document.createElement('div');
        dropdown.className = 'combo-dropdown';
        Object.assign(dropdown.style, {
            position: 'absolute',
            left: '0',
            top: 'calc(100% + 6px)',
            width: '100%',
            background: 'var(--surface, #fff)',
            border: '1px solid var(--border, #e5e7eb)',
            boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
            borderRadius: '6px',
            maxHeight: '200px',
            overflowY: 'auto',
            display: 'none',
            zIndex: 2000
        });

        parent.appendChild(dropdown);

        const render = (items) => {
            if (!items || items.length === 0) {
                dropdown.style.display = 'none';
                dropdown.innerHTML = '';
                return;
            }
            dropdown.innerHTML = items.map(i => `<div class="combo-item" role="option" style="padding:8px 12px; cursor:pointer;">${i}</div>`).join('');
            dropdown.style.display = 'block';
        };

        input.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase();
            const filtered = options.filter(o => o.toLowerCase().includes(val));
            render(filtered.length ? filtered : options);
        });

        input.addEventListener('focus', () => render(options));

        // Hide after short delay to allow clicks
        input.addEventListener('blur', () => setTimeout(() => dropdown.style.display = 'none', 150));

        dropdown.addEventListener('mousedown', (e) => {
            // prevent input blur before click
            e.preventDefault();
        });

        dropdown.addEventListener('click', (e) => {
            const item = e.target.closest('.combo-item');
            if (!item) return;
            input.value = item.textContent.trim();
            input.dispatchEvent(new Event('input', { bubbles: true }));
            dropdown.style.display = 'none';
        });
    }

    /* Weather overlay and animations ------------------------------------------------ */
    setupWeatherOverlay() {
        // Create container and canvas
        if (this._weatherOverlayInitialized) return;
        this._weatherOverlayInitialized = true;

        const overlay = document.createElement('div');
        overlay.id = 'weather-overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            left: '0',
            top: '0',
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            overflow: 'hidden',
            zIndex: '0'
        });

        const canvas = document.createElement('canvas');
        canvas.id = 'weather-canvas';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.display = 'block';
        overlay.appendChild(canvas);

        // Insert overlay as first child of body so it's behind appended UI if we raise UI z-index
        document.body.insertBefore(overlay, document.body.firstChild);

        // Ensure existing UI sits above the overlay by nudging direct children z-index
        Array.from(document.body.children).forEach(ch => {
            if (ch === overlay) return;
            try {
                if (!ch.style) return;
                const prev = window.getComputedStyle(ch).zIndex;
                if (!prev || prev === 'auto' || Number(prev) <= 0) {
                    ch.style.position = ch.style.position || 'relative';
                    ch.style.zIndex = ch.style.zIndex || '1';
                }
            } catch (err) { /* ignore */ }
        });

        this._weather = {
            overlay,
            canvas,
            ctx: canvas.getContext('2d'),
            animFrame: null,
            mode: null,
            particles: [],
            lastTick: performance.now(),
            thunderTimer: 0
        };

        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            const w = overlay.clientWidth;
            const h = overlay.clientHeight;
            canvas.width = Math.max(1, Math.floor(w * dpr));
            canvas.height = Math.max(1, Math.floor(h * dpr));
            canvas.getContext('2d').scale(dpr, dpr);
        };

        window.addEventListener('resize', () => {
            try { resize(); } catch (e) { console.warn('weather resize failed', e); }
        });
        resize();
        // start an idle loop (no-op until mode set)
        this.startWeatherAnimationLoop();
    }

    startWeatherAnimationLoop() {
        if (!this._weather) return;
        if (this._weather.animFrame) return; // already running
        const tick = (now) => {
            const w = this._weather;
            const ctx = w.ctx;
            const canvas = w.canvas;
            const width = canvas.clientWidth;
            const height = canvas.clientHeight;
            const dt = Math.min(60, now - (w.lastTick || now)) / 1000;
            w.lastTick = now;

            // clear with transparent so body background underneath shows through
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // choose renderer based on mode
            if (w.mode === 'rain') this._renderRain(ctx, width, height, dt);
            else if (w.mode === 'snow') this._renderSnow(ctx, width, height, dt);
            else if (w.mode === 'clouds') this._renderClouds(ctx, width, height, dt);
            else if (w.mode === 'thunderstorm') this._renderThunder(ctx, width, height, dt);
            else if (w.mode === 'clear') this._renderClear(ctx, width, height, dt);

            w.animFrame = window.requestAnimationFrame(tick);
        };
        this._weather.animFrame = window.requestAnimationFrame(tick);
    }

    stopWeatherAnimationLoop() {
        if (this._weather && this._weather.animFrame) {
            window.cancelAnimationFrame(this._weather.animFrame);
            this._weather.animFrame = null;
        }
    }

    setWeatherAnimation(mode, weatherData = {}) {
        if (!this._weather) return;
        const w = this._weather;
        w.mode = mode;
        w.particles = [];
        w.thunderTimer = 0;

        // initialize particles for modes
        const width = w.canvas.clientWidth;
        const height = w.canvas.clientHeight;

        if (mode === 'rain') {
            const count = Math.floor((width * height) / 60000) * 80 + 80;
            for (let i = 0; i < count; i++) {
                w.particles.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    len: 8 + Math.random() * 12,
                    vy: 300 + Math.random() * 400,
                    alpha: 0.2 + Math.random() * 0.5
                });
            }
        } else if (mode === 'snow') {
            const count = Math.floor((width * height) / 90000) * 60 + 40;
            for (let i = 0; i < count; i++) {
                w.particles.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    r: 1 + Math.random() * 3,
                    vy: 20 + Math.random() * 40,
                    vx: -10 + Math.random() * 20,
                    alpha: 0.6 + Math.random() * 0.4
                });
            }
        } else if (mode === 'clouds' || mode === 'thunderstorm') {
            // cloud layers
            const layers = 3 + Math.floor(Math.random() * 2);
            for (let i = 0; i < layers; i++) {
                w.particles.push({
                    x: Math.random() * width,
                    y: (i / layers) * height * 0.5 + Math.random() * 40,
                    vw: 5 + Math.random() * 20,
                    scale: 0.8 + Math.random() * 1.2,
                    alpha: 0.08 + Math.random() * 0.18
                });
            }
        } else if (mode === 'clear') {
            // subtle moving light blobs
            for (let i = 0; i < 3; i++) {
                w.particles.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    r: 80 + Math.random() * 160,
                    vx: -10 + Math.random() * 20,
                    vy: -5 + Math.random() * 10,
                    alpha: 0.06 + Math.random() * 0.06
                });
            }
        }
    }

    /* Renderers --------------------------------------------------------------- */
    _renderRain(ctx, width, height, dt) {
        const w = this._weather;
        ctx.save();
        ctx.translate(0, 0);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(200,220,255,0.35)';
        for (const p of w.particles) {
            p.y += p.vy * dt;
            p.x += (p.vy * 0.002) * dt;
            if (p.y > height + p.len) {
                p.y = -10 - Math.random() * 100;
                p.x = Math.random() * width;
            }
            ctx.globalAlpha = p.alpha;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - 2, p.y + p.len);
            ctx.stroke();
        }
        ctx.restore();
    }

    _renderSnow(ctx, width, height, dt) {
        const w = this._weather;
        ctx.save();
        for (const p of w.particles) {
            p.y += p.vy * dt;
            p.x += p.vx * dt;
            if (p.y > height + p.r) {
                p.y = -10 - Math.random() * 100;
                p.x = Math.random() * width;
            }
            ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    _renderClouds(ctx, width, height, dt) {
        const w = this._weather;
        ctx.save();
        // subtle moving cloud blobs
        for (const p of w.particles) {
            p.x += (p.vw * 0.02) * dt * 60;
            if (p.x > width + 200) p.x = -200;
            const grd = ctx.createLinearGradient(p.x - 200, p.y, p.x + 200, p.y);
            grd.addColorStop(0, `rgba(255,255,255,0)`);
            grd.addColorStop(0.4, `rgba(255,255,255,${p.alpha * 0.6})`);
            grd.addColorStop(1, `rgba(255,255,255,0)`);
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, 300 * p.scale, 80 * p.scale, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    _renderThunder(ctx, width, height, dt) {
        // render clouds
        this._renderClouds(ctx, width, height, dt);
        const w = this._weather;
        w.thunderTimer -= dt;
        if (w.thunderTimer <= 0) {
            // random next strike
            w.thunderTimer = 2 + Math.random() * 6;
            // flash
            ctx.save();
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        }
    }

    _renderClear(ctx, width, height, dt) {
        const w = this._weather;
        ctx.save();
        for (const p of w.particles) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.x < -200) p.x = width + 200;
            if (p.x > width + 200) p.x = -200;
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
            g.addColorStop(0, `rgba(255,255,220,${p.alpha})`);
            g.addColorStop(1, 'rgba(255,255,220,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    async loadApplicationData() {
        try {
            // In a real app, this would load from zipit_app_data.json
            // For now, we'll use the built-in data
            console.log('✅ App data loaded successfully');
        } catch (error) {
            console.error('Failed to load app data:', error);
        }
    }

    setupNetworkListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.showToast('Back online! Syncing data...', 'success');
            this.syncOfflineData();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.showToast("You're offline. Changes will sync when back online.", 'warning');
        });
    }

    async syncOfflineData() {
        if (!this.isOnline || !supabaseClient || this.offlineQueue.length === 0) return;

        for (const action of this.offlineQueue) {
            try {
                await this.processOfflineAction(action);
            } catch (error) {
                console.error('Sync error:', error);
            }
        }

        this.offlineQueue = [];
        this.saveToStorage('zipit_offline_queue', this.offlineQueue);
    }

    async processOfflineAction(action) {
        switch (action.type) {
            case 'create_trip':
                await this.createTripInSupabase(action.payload);
                break;
            case 'update_trip':
                await this.updateTripInSupabase(action.payload);
                break;
            case 'delete_trip':
                await this.deleteTripInSupabase(action.payload.id);
                break;
        }
    }

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

    async setCurrentUser(user) {
        this.currentUser = {
            id: user.id,
            email: user.email,
            name: user.user_metadata?.full_name || user.email.split('@')[0]
        };
        this.saveToStorage('zipit_user', this.currentUser);
    }

    async migrateLocalToSupabase() {
        const localTrips = this.loadFromStorage(this.getUserStorageKey('trips')) || [];
        if (localTrips.length === 0) return;

        for (const trip of localTrips) {
            try {
                // Ensure trip has a UUID before migrating
                if (!trip.id || !this.isValidUUID(trip.id)) trip.id = this.generateUUID();
                await this.createTripInSupabase(trip);
            } catch (error) {
                console.error('Migration error for trip:', trip.title, error);
            }
        }
    }

    async loadUserTrips() {
        if (!this.currentUser || !supabaseClient) return;
        // Lightweight load: fetch only this user's trips and minimize client-side processing
        try {
            const userId = await this.getCurrentUserId();
            if (!userId) return;

            // Temporarily suppress animation-heavy rendering while we update the DOM
            this._suppressAnimations = true;

            const { data, error } = await supabaseClient
                .from('trips')
                .select('id, title, destination, start_date, end_date, duration, transport, purpose, packing_progress, weather_data, created_at')
                .eq('user_id', userId);

            if (error) throw error;

            // Minimal mapping; defer heavy computations (like weather generation) until needed
            this.trips = (data || []).map(t => ({
                id: t.id,
                title: t.title,
                destination: t.destination,
                startDate: t.start_date,
                endDate: t.end_date,
                duration: t.duration,
                transport: t.transport,
                purpose: t.purpose,
                progress: t.packing_progress || 0,
                weather: t.weather_data || null,
                createdAt: t.created_at
            }));

            this.cleanupDuplicateTripRecords();

            // Update only the parts of UI that changed
            this.updateTripsGrid();
            this.updateStats();

            // Re-enable animations shortly after render
            setTimeout(() => { this._suppressAnimations = false; }, 250);
        } catch (err) {
            console.error('Load trips error:', err);
            this.showToast('Failed to load trips from cloud', 'error');
            this._suppressAnimations = false;
        }
    }

    async createTripInSupabase(trip) {
        if (!supabaseClient || !this.currentUser) {
            console.warn('Cannot create trip in Supabase: no client or user', { supabaseClient: !!supabaseClient, currentUser: !!this.currentUser });
            return;
        }

        try {
            // Ensure trip has a UUID id when creating in Supabase
            if (!trip.id) trip.id = this.generateUUID();

            const insertData = {
                id: trip.id,
                title: trip.title,
                destination: trip.destination,
                start_date: trip.startDate,
                end_date: trip.endDate,
                duration: trip.duration,
                transport: trip.transport,
                purpose: trip.purpose,
                weather_data: trip.weather,
                packing_progress: trip.progress || 0,
                user_id: this.currentUser.id
            };

            const { data, error } = await supabaseClient
                .from('trips')
                .insert([insertData])
                .select('*')
                .single();

            if (error) {
                const isDuplicateKey = error.code === '23505' || (error.message && /duplicate key|already exists/i.test(error.message));
                if (isDuplicateKey) {
                    console.warn('Duplicate trip insert detected, fetching existing trip:', trip.id);
                    const { data: existingTrip, error: fetchError } = await supabaseClient
                        .from('trips')
                        .select('*')
                        .eq('id', trip.id)
                        .single();
                    if (!fetchError && existingTrip) {
                        return existingTrip;
                    }
                }
                console.error('Error inserting trip into Supabase:', error);
                throw error;
            }

            console.log('Trip successfully created in Supabase:', data);
            return data;
        } catch (err) {
            console.error('createTripInSupabase failed:', err);
            throw err;
        }
    }

    cleanupDuplicateTripRecords() {
        if (!Array.isArray(this.trips) || this.trips.length < 2) return;

        const seen = new Map();
        const uniqueTrips = [];
        for (const trip of this.trips) {
            const key = trip.id || `${trip.title}||${trip.destination}||${trip.startDate}||${trip.endDate}`;
            if (seen.has(key)) continue;
            seen.set(key, trip);
            uniqueTrips.push(trip);
        }

        if (uniqueTrips.length !== this.trips.length) {
            console.warn('Removed duplicate trips from current session', {
                originalCount: this.trips.length,
                cleanedCount: uniqueTrips.length
            });
            this.trips = uniqueTrips;
            this.saveUserTrips();
            try { this.updateTripsGrid(); } catch (e) { console.warn('updateTripsGrid failed after duplicate cleanup', e); }
        }
    }

    // Lightweight update helper for a trip that respects RLS and avoids heavy migrations/syncs
    async updateTripInSupabase(arg1, arg2) {
        // Supports both (tripId, payload) and (payloadObjectWithId)
        let tripId = null;
        let payload = null;
        if (arg2 === undefined && arg1 && typeof arg1 === 'object') {
            payload = Object.assign({}, arg1);
            tripId = payload.id || payload.trip_id || null;
            // remove id from payload so update doesn't try to set id
            delete payload.id; delete payload.trip_id;
        } else {
            tripId = arg1;
            payload = arg2 || {};
        }

        if (!supabaseClient || !this.currentUser) {
            console.warn('Cannot update trip in Supabase: no client or user');
            return { error: 'no-client-or-user' };
        }

        try {
            const userId = await this.getCurrentUserId();
            if (!userId) return { error: 'no-user' };

            const { data, error } = await supabaseClient
                .from('trips')
                .update(payload)
                .eq('id', tripId)
                .eq('user_id', userId);

            if (error) {
                console.error('updateTripInSupabase error:', error);
                return { error };
            }

            return { data };
        } catch (err) {
            console.error('updateTripInSupabase failed:', err);
            return { error: err };
        }
    }

    showLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.remove('hide');
        }
    }

    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.add('hide');
            // Remove from DOM after animation
            setTimeout(() => {
                loadingScreen.style.display = 'none';
            }, 500);
        }
    }

    animateHeroElements() {
        // Animate hero content with GSAP if available
        if (this._suppressAnimations) return;
        if (typeof gsap !== 'undefined') {
            const tl = gsap.timeline();
            tl.fromTo('.hero-content h1',
                { opacity: 0, y: 50 },
                { opacity: 1, y: 0, duration: 1, ease: 'power3.out' }
            )
                .fromTo('.hero-content p',
                    { opacity: 0, y: 30 },
                    { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, '-=0.5'
                )
                .fromTo('.hero-actions',
                    { opacity: 0, y: 20 },
                    { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, '-=0.3'
                )
                .fromTo('.hero-card',
                    { opacity: 0, scale: 0.8, rotationY: -15 },
                    { opacity: 1, scale: 1, rotationY: -5, duration: 1, ease: 'power3.out' }, '-=0.8'
                );
        }
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const target = link.getAttribute('href').replace('#', '');
                this.showSection(target);
                this.updateNavigation(target);
            });
        });

        // Brand logo navigation
        const navBrand = document.querySelector('.nav-brand');
        if (navBrand) {
            navBrand.addEventListener('click', (e) => {
                e.preventDefault();
                this.showSection('hero');
                this.updateNavigation('hero');
            });
        }

        // Theme toggle
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }

        // Login/User menu
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => this.openModal('login-modal'));
        }

        const userAvatar = document.querySelector('.user-avatar');
        if (userAvatar) {
            userAvatar.addEventListener('click', (e) => {
                e.stopPropagation();
                const dropdown = document.querySelector('.user-dropdown');
                dropdown.classList.toggle('show');
            });
        }

        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.handleLogout());
        }

        // Hero buttons
        const getStartedBtn = document.getElementById('get-started-btn');
        if (getStartedBtn) {
            getStartedBtn.addEventListener('click', () => {
                this.showSection('dashboard');
                this.updateNavigation('dashboard');
            });
        }

        const learnMoreBtn = document.getElementById('learn-more-btn');
        if (learnMoreBtn) {
            learnMoreBtn.addEventListener('click', () => {
                this.smoothScrollTo('.hero-content p');
            });
        }

        // Transport suggestions: listen for transport or destination changes
        const transportInput = document.getElementById('transport');
        const destinationInput = document.getElementById('destination');
        const startLocationInput = document.getElementById('start-location');
        const startDateInput = document.getElementById('start-date');
        const endDateInput = document.getElementById('end-date');

        const trySuggest = () => {
            const transport = (transportInput?.value || '').toLowerCase();
            const destination = (destinationInput?.value || '').trim();
            const start = startDateInput?.value;
            const end = endDateInput?.value;
            if (!transport || !destination) return;

            // Show/hide start location field for road-based transport
            const startLocationGroup = document.getElementById('start-location-group');
            const roadModes = ['car', 'bike', 'bus', 'ferry'];
            const isRoadBased = roadModes.some(mode => transport.includes(mode));
            if (startLocationGroup) {
                startLocationGroup.style.display = isRoadBased ? '' : 'none';
            }

            if (transport.includes('flight')) {
                this.showTransportSuggestions('flight', destination, start, end);
            } else if (transport.includes('train')) {
                this.showTransportSuggestions('train', destination, start, end);
            } else if (transport.includes('bus')) {
                this.showTransportSuggestions('bus', destination, start, end);
            } else if (transport.includes('car') || transport.includes('taxi') || transport.includes('cab')) {
                this.showTransportSuggestions('car', destination, start, end);
            } else if (transport.includes('bike') || transport.includes('motor') || transport.includes('motorcycle') || transport.includes('bicycle') || transport.includes('two-wheeler')) {
                this.showTransportSuggestions('bike', destination, start, end);
            } else {
                // hide suggestions if transport is other
                const sug = document.getElementById('transport-suggestions');
                if (sug) sug.innerHTML = '';
                const airlineGroup = document.getElementById('airline-group');
                if (airlineGroup) airlineGroup.style.display = 'none';
            }
        };

        transportInput?.addEventListener('input', trySuggest);
        destinationInput?.addEventListener('blur', trySuggest);
        startLocationInput?.addEventListener('input', trySuggest);
        startDateInput?.addEventListener('change', trySuggest);
        endDateInput?.addEventListener('change', trySuggest);

        // Update weather preview when destination changes (debounced)
        if (destinationInput) {
            let _wbTimer = null;
            const doWeatherUpdate = () => {
                const dest = destinationInput.value && destinationInput.value.trim();
                if (!dest) return;
                try {
                    // fire-and-forget; method guards against missing API key
                    this.applyWeatherBackgroundForDestination(dest).catch && this.applyWeatherBackgroundForDestination(dest).catch(err => console.warn('Weather update failed', err));
                } catch (err) { console.warn('Weather update invocation failed', err); }
            };
            destinationInput.addEventListener('input', () => {
                if (_wbTimer) clearTimeout(_wbTimer);
                _wbTimer = setTimeout(doWeatherUpdate, 700);
            });
            destinationInput.addEventListener('blur', () => doWeatherUpdate());
        }

        // Dashboard buttons
        const newTripBtn = document.getElementById('new-trip-btn');
        if (newTripBtn) {
            newTripBtn.addEventListener('click', () => this.openModal('trip-modal'));
        }

        // Trip form step navigation (Next / Previous)
        const nextBtn = document.getElementById('next-step');
        const prevBtn = document.getElementById('prev-step');
        const createBtn = document.getElementById('create-trip-submit');
        const updateBtn = document.getElementById('updateTripBtn');
        const formSteps = Array.from(document.querySelectorAll('#trip-form .form-step'));
        const maxStep = formSteps.length;

        const goToStep = (step) => {
            formSteps.forEach(fs => fs.classList.remove('active'));
            const target = document.querySelector(`#trip-form .form-step[data-step='${step}']`);
            if (target) target.classList.add('active');

            if (prevBtn) prevBtn.style.display = step > 1 ? '' : 'none';
            if (nextBtn) nextBtn.style.display = step < maxStep ? '' : 'none';
            if (createBtn) createBtn.style.display = step === maxStep ? '' : 'none';
        };

        const validateStep = (step) => {
            const stepEl = document.querySelector(`#trip-form .form-step[data-step='${step}']`);
            if (!stepEl) return true;
            const requiredInputs = Array.from(stepEl.querySelectorAll('input[required], select[required], textarea[required]'));
            for (const inp of requiredInputs) {
                if (!inp.value || inp.value.trim() === '') {
                    this.showToast('Please fill in all required fields for this step', 'error');
                    inp.focus();
                    return false;
                }
            }

            // Additional date validation on step 1
            if (step === 1) {
                const start = document.getElementById('start-date')?.value;
                const end = document.getElementById('end-date')?.value;
                if (start && end && new Date(start) >= new Date(end)) {
                    this.showToast('End date must be after start date', 'error');
                    return false;
                }
            }

            return true;
        };

        if (nextBtn) {
            nextBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const current = document.querySelector('#trip-form .form-step.active');
                const currentStep = parseInt(current?.getAttribute('data-step') || '1', 10);
                if (!validateStep(currentStep)) return;
                const nextStep = Math.min(maxStep, currentStep + 1);
                goToStep(nextStep);
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const current = document.querySelector('#trip-form .form-step.active');
                const currentStep = parseInt(current?.getAttribute('data-step') || '1', 10);
                const prevStep = Math.max(1, currentStep - 1);
                goToStep(prevStep);
            });
        }

        const backBtn = document.getElementById('back-to-dashboard');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this.showSection('dashboard');
                this.updateNavigation('dashboard');
            });
        }

        // Form submissions
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        const tripForm = document.getElementById('trip-form');
        if (tripForm) {
            tripForm.addEventListener('submit', (e) => this.handleTripCreation(e));
        }

        // Update trip button (for edit flow) - now submits the form like create button
        // Removed separate click handler since updateBtn is now type="submit"
        const signupBtn = document.getElementById('signup-btn');
        if (signupBtn) {
            signupBtn.addEventListener('click', () => this.handleSignup());
        }

        // Profile link in dropdown - navigate to profile page
        const profileLink = document.querySelector('a[href="#profile"]');
        if (profileLink) {
            profileLink.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = 'profile.html';
            });
        }

        // Filter dropdown (right of "Your Trips")
        try {
            const filterToggle = document.getElementById('filter-toggle-btn');
            const filterDropdown = document.getElementById('filter-dropdown');
            const filterContainer = document.querySelector('.filter-container');

            const closeFilterDropdown = () => {
                if (filterDropdown) {
                    filterDropdown.style.display = 'none';
                }
                if (filterToggle) {
                    filterToggle.setAttribute('aria-expanded', 'false');
                }
            };

            if (filterToggle && filterDropdown) {
                // Toggle dropdown
                filterToggle.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    const isOpen = filterDropdown.style.display === 'block';
                    // close other dropdowns (defensive)
                    document.querySelectorAll('.filter-dropdown').forEach(d => d.style.display = 'none');
                    if (isOpen) {
                        closeFilterDropdown();
                    } else {
                        filterDropdown.style.display = 'block';
                        filterToggle.setAttribute('aria-expanded', 'true');
                    }
                });

                // Option selection
                Array.from(filterDropdown.querySelectorAll('.filter-option')).forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const sel = btn.getAttribute('data-filter') || 'all';
                        this.activeTripFilter = sel;
                        // Close dropdown and re-render trips
                        closeFilterDropdown();
                        this.updateTripsGrid();
                    });
                });

                // Close dropdown when clicking outside
                document.addEventListener('click', (e) => {
                    if (!e.target.closest('.filter-container')) {
                        closeFilterDropdown();
                    }
                });
            }
        } catch (e) {
            console.warn('Filter dropdown init error', e);
        }

        // Packing Templates: wire Save Template buttons (scoped; non-intrusive)
        try {
            const templateButtons = document.querySelectorAll('.save-template-btn');
            templateButtons.forEach(btn => {
                btn.addEventListener('click', async (ev) => {
                    ev.stopPropagation();
                    const card = btn.closest('.template-card');
                    if (!card) return;
                    const name = card.getAttribute('data-name') || card.querySelector('h3')?.textContent || 'Untitled Template';
                    const description = card.getAttribute('data-description') || '';
                    let items = {};
                    try {
                        const raw = card.getAttribute('data-items') || '{}';
                        items = JSON.parse(raw);
                    } catch (err) {
                        console.warn('Invalid template items JSON', err);
                        items = {};
                    }

                    // call class method to save (handles supabase / demo fallback)
                    await this.savePackingTemplate({ name, description, items }, btn);
                });
            });
        } catch (err) {
            console.warn('Packing template button wiring error', err);
        }

        // Global event listeners
        this.setupGlobalEventListeners();
        this.setupKeyboardShortcuts();
    }

    setupGlobalEventListeners() {
        // Close modals and dropdowns on outside click
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModal(e.target.id);
            }
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.user-menu')) {
                document.querySelectorAll('.user-dropdown').forEach(dropdown => {
                    dropdown.classList.remove('show');
                });
            }
        });

        // Navbar scroll effect
        window.addEventListener('scroll', () => {
            const navbar = document.querySelector('.navbar');
            if (window.scrollY > 100) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        });

        // Form date validation
        const startDateInput = document.getElementById('start-date');
        const endDateInput = document.getElementById('end-date');

        if (startDateInput && endDateInput) {
            const today = new Date().toISOString().split('T')[0];
            startDateInput.min = today;

            startDateInput.addEventListener('change', (e) => {
                endDateInput.min = e.target.value;
                if (endDateInput.value && endDateInput.value < e.target.value) {
                    endDateInput.value = e.target.value;
                }
            });
        }
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Escape to close modals
            if (e.key === 'Escape') {
                const visibleModal = document.querySelector('.modal.show');
                if (visibleModal) {
                    this.closeModal(visibleModal.id);
                }
            }

            // Ctrl/Cmd + N for new trip
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                if (document.getElementById('dashboard').classList.contains('active')) {
                    this.openModal('trip-modal');
                }
            }

            // Ctrl/Cmd + D for dashboard
            if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                e.preventDefault();
                this.showSection('dashboard');
                this.updateNavigation('dashboard');
            }
        });
    }

    setupTheme() {
        const savedTheme = this.loadFromStorage('zipit_theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.updateThemeIcon(savedTheme);
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';

        document.documentElement.setAttribute('data-theme', newTheme);
        this.updateThemeIcon(newTheme);
        this.saveToStorage('zipit_theme', newTheme);
        this.showToast(`Switched to ${newTheme} mode`, 'success');
    }

    updateThemeIcon(theme) {
        const icon = document.querySelector('#theme-toggle i');
        if (icon) {
            icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
    }

    setupScrollAnimations() {
        if (typeof gsap !== 'undefined' && gsap.registerPlugin && typeof ScrollTrigger !== 'undefined') {
            gsap.registerPlugin(ScrollTrigger);

            // Animate stats cards
            gsap.utils.toArray('.stat-card').forEach(card => {
                gsap.fromTo(card,
                    { opacity: 0, y: 50 },
                    {
                        opacity: 1,
                        y: 0,
                        duration: 0.8,
                        scrollTrigger: {
                            trigger: card,
                            start: 'top 80%',
                            end: 'bottom 20%',
                            toggleActions: 'play none none reverse'
                        }
                    }
                );
            });

            // Animate trip cards
            gsap.utils.toArray('.trip-card').forEach((card, index) => {
                gsap.fromTo(card,
                    { opacity: 0, y: 30, scale: 0.9 },
                    {
                        opacity: 1,
                        y: 0,
                        scale: 1,
                        duration: 0.6,
                        delay: index * 0.1,
                        scrollTrigger: {
                            trigger: card,
                            start: 'top 80%',
                            toggleActions: 'play none none reverse'
                        }
                    }
                );
            });
        }
    }

    setupIntersectionObserver() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '-50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate');
                }
            });
        }, observerOptions);

        // Observe elements that should animate on scroll
        document.querySelectorAll('.fade-in, .slide-up, .scale-in').forEach(el => {
            observer.observe(el);
        });
    }

    showSection(sectionId) {
        // Hide all sections
        document.querySelectorAll('.section').forEach(section => {
            section.classList.remove('active');
        });

        // Show target section
        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.classList.add('active');

            // Trigger section-specific animations
            this.animateSection(sectionId);
        }

        // Scroll to top smoothly
        this.smoothScrollTo('body');
    }

    animateSection(sectionId) {
        if (typeof gsap === 'undefined') return;

        switch (sectionId) {
            case 'dashboard':
                this.animateDashboard();
                break;
            case 'packing-list':
                this.animatePackingList();
                break;
        }
    }

    animateDashboard() {
        if (typeof gsap === 'undefined') return;

        const tl = gsap.timeline();
        tl.fromTo('.dashboard-header',
            { opacity: 0, y: -30 },
            { opacity: 1, y: 0, duration: 0.6 }
        )
            .fromTo('.stats-grid .stat-card',
                { opacity: 0, y: 50, scale: 0.9 },
                { opacity: 1, y: 0, scale: 1, duration: 0.8, stagger: 0.1 }, '-=0.3'
            )
            .fromTo('.trips-grid .trip-card',
                { opacity: 0, x: -50 },
                { opacity: 1, x: 0, duration: 0.6, stagger: 0.1 }, '-=0.4'
            );
    }

    animatePackingList() {
        if (this._suppressAnimations) return;
        if (typeof gsap === 'undefined') return;

        gsap.fromTo('.packing-categories .category',
            { opacity: 0, x: -30 },
            { opacity: 1, x: 0, duration: 0.45, stagger: 0.06 }
        );
    }

    smoothScrollTo(selector) {
        const element = document.querySelector(selector);
        if (element) {
            element.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }

    updateNavigation(activeSection) {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });

        const activeLink = document.querySelector(`[href="#${activeSection}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        }
    }

    updateLoginState() {
        const loginBtn = document.getElementById('login-btn');
        const userMenu = document.getElementById('user-menu');

        if (this.currentUser) {
            if (loginBtn) loginBtn.classList.add('hidden');
            if (userMenu) userMenu.classList.remove('hidden');

            // Fetch and display full_name from Supabase
            this.updateUserDropdown();
        } else {
            if (loginBtn) loginBtn.classList.remove('hidden');
            if (userMenu) userMenu.classList.add('hidden');
        }
    }

    // Fetch and update user's full name in dropdown from Supabase
    async updateUserDropdown() {
        if (!supabaseClient || !this.currentUser) return;
        try {
            // Get full_name from public.users table
            const { data, error } = await supabaseClient
                .from('users')
                .select('full_name')
                .eq('id', this.currentUser.id)
                .single();

            const displayName = data?.full_name || (this.currentUser.email ? this.currentUser.email.split('@')[0] : 'User');
            const userEmail = this.currentUser.email || 'user@example.com';

            // Update dropdown text
            const nameEl = document.getElementById('user-name');
            const emailEl = document.getElementById('user-email');
            if (nameEl) nameEl.textContent = displayName;
            if (emailEl) emailEl.textContent = userEmail;

            // Update avatar with name
            const avatar = document.querySelector('.user-avatar');
            if (avatar) {
                avatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0EA5E9&color=fff&size=44&bold=true`;
                avatar.alt = `${displayName}'s avatar`;
            }
        } catch (err) {
            console.warn('Failed to fetch user full_name:', err);
            // Fallback: use email name
            const displayName = this.currentUser && this.currentUser.email ? this.currentUser.email.split('@')[0] : 'User';
            const nameEl = document.getElementById('user-name');
            if (nameEl) nameEl.textContent = displayName;
        }
    }

    updateDashboard() {
        this.updateStats();
        this.updateTripsGrid();
    }

    updateStats() {
        const statsGrid = document.getElementById('stats-grid');
        if (!statsGrid) return;

        const completedTrips = this.trips.filter(trip => trip.progress === 100).length;
        const avgProgress = this.trips.length > 0 ?
            Math.round(this.trips.reduce((sum, trip) => sum + trip.progress, 0) / this.trips.length) : 0;
        const uniqueDestinations = new Set(this.trips.map(t => t.destination.split(',')[0])).size;
        const upcomingTrips = this.trips.filter(trip => new Date(trip.startDate) > new Date()).length;

        const stats = [
            {
                icon: 'fas fa-map-marked-alt',
                value: this.trips.length,
                label: 'Total Trips',
                color: 'var(--primary)'
            },
            {
                icon: 'fas fa-check-circle',
                value: completedTrips,
                label: 'Completed',
                color: 'var(--success)'
            },
            {
                icon: 'fas fa-clock',
                value: upcomingTrips,
                label: 'Upcoming',
                color: 'var(--warning)'
            },
            {
                icon: 'fas fa-globe-americas',
                value: uniqueDestinations,
                label: 'Destinations',
                color: 'var(--accent)'
            }
        ];

        statsGrid.innerHTML = stats.map((stat, index) => `
            <div class="stat-card" style="animation-delay: ${index * 0.1}s">
                <i class="${stat.icon}" style="color: ${stat.color}"></i>
                <div class="stat-value">${stat.value}</div>
                <div class="stat-label">${stat.label}</div>
            </div>
        `).join('');

        // Animate stat numbers
        this.animateStatNumbers();
    }

    animateStatNumbers() {
        if (this._suppressAnimations) return;
        document.querySelectorAll('.stat-value').forEach(element => {
            const finalValue = parseInt(element.textContent);
            let currentValue = 0;
            const increment = Math.max(1, Math.ceil(finalValue / 12));
            const timer = setInterval(() => {
                currentValue += increment;
                if (currentValue >= finalValue) {
                    currentValue = finalValue;
                    clearInterval(timer);
                }
                element.textContent = currentValue;
            }, 30);
        });
    }

    updateTripsGrid() {
        const tripsGrid = document.getElementById('trips-grid');
        if (!tripsGrid) {
            console.warn('[updateTripsGrid] trips-grid element not found');
            return;
        }

        console.log('[updateTripsGrid] Starting with', this.trips.length, 'trips, filter:', this.activeTripFilter);

        if (this.trips.length === 0) {
            tripsGrid.innerHTML = `
                <div style="text-align: center; grid-column: 1 / -1; padding: 80px 20px;">
                    <i class="fas fa-suitcase-rolling" style="font-size: 5rem; color: var(--text-secondary); margin-bottom: 24px; opacity: 0.5;"></i>
                    <h3 style="font-size: var(--font-size-2xl); margin-bottom: 16px; color: var(--text-primary);">No trips yet</h3>
                    <p style="color: var(--text-secondary); margin-bottom: 32px; font-size: var(--font-size-lg);">Start planning your next adventure!</p>
                    <button class="btn btn--primary btn--lg" onclick="app.openModal('trip-modal')">
                        <i class="fas fa-plus"></i>
                        Create Your First Trip
                    </button>
                </div>
            `;
            console.log('[updateTripsGrid] Showed empty state');
            return;
        }

        // Apply active filter
        let filteredTrips = Array.isArray(this.trips) ? [...this.trips] : [];
        const now = new Date();
        if (this.activeTripFilter === 'upcoming') {
            filteredTrips = filteredTrips.filter(trip => new Date(trip.startDate) > now);
        } else if (this.activeTripFilter === 'completed') {
            filteredTrips = filteredTrips.filter(trip => Number(trip.progress) === 100);
        }

        console.log('[updateTripsGrid] After filter:', filteredTrips.length, 'trips');

        // Sort and render
        const html = filteredTrips
            .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
            .map(trip => this.createTripCard(trip))
            .join('');

        tripsGrid.innerHTML = html;
        console.log('[updateTripsGrid] Rendered trips to grid');
    }

    createTripCard(trip) {
        const circumference = 2 * Math.PI * 26;
        const strokeDasharray = circumference;
        const strokeDashoffset = circumference - (trip.progress / 100) * circumference;

        const isUpcoming = new Date(trip.startDate) > new Date();
        const isOngoing = new Date(trip.startDate) <= new Date() && new Date(trip.endDate) >= new Date();

        let statusBadge = '';
        if (isOngoing) {
            statusBadge = '<span class="status-badge ongoing">Ongoing</span>';
        } else if (isUpcoming) {
            statusBadge = '<span class="status-badge upcoming">Upcoming</span>';
        } else if (trip.progress === 100) {
            statusBadge = '<span class="status-badge completed">Completed</span>';
        }

        return `
            <div class="trip-card" data-trip-id="${trip.id}">
                <div class="trip-header">
                    <div>
                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                            <h3 class="trip-title">${trip.title}</h3>
                            ${statusBadge}
                        </div>
                        <p class="trip-destination">
                            <i class="fas fa-map-marker-alt" style="margin-right: 4px;"></i>
                            ${trip.destination}
                        </p>
                        <p class="trip-dates">
                            <i class="far fa-calendar-alt" style="margin-right: 4px;"></i>
                            ${this.formatDateRange(trip.startDate, trip.endDate)}
                        </p>
                    </div>
                    <div class="progress-ring">
                        <svg width="70" height="70">
                            <circle class="progress-ring-bg" cx="35" cy="35" r="26"></circle>
                            <circle class="progress-ring-fill" cx="35" cy="35" r="26" 
                                    stroke-dasharray="${strokeDasharray}" 
                                    stroke-dashoffset="${strokeDashoffset}"></circle>
                        </svg>
                        <div class="progress-text">${trip.progress}%</div>
                    </div>
                </div>
                ${trip.weather ? `
                    <div class="weather-info">
                        <i class="weather-icon ${this.getWeatherIcon(trip.weather.condition)}"></i>
                        <div>
                            <div style="font-weight: 600;">${trip.weather.temp}°C</div>
                            <small style="text-transform: capitalize;">${trip.weather.condition}</small>
                        </div>
                        <div style="margin-left: auto; text-align: right;">
                            <div style="font-size: var(--font-size-xs); color: var(--text-secondary);">
                                <i class="fas fa-tint" style="margin-right: 4px;"></i>${trip.weather.humidity || 65}%
                            </div>
                        </div>
                    </div>
                ` : ''}
                <div class="trip-actions">
                    <button class="btn btn--primary btn--sm" onclick="app.openPackingList('${String(trip.id).replace(/'/g, '&#39;')}')">
                        <i class="fas fa-list-check"></i>
                        ${trip.progress === 0 ? 'Start Packing' : 'Continue'}
                    </button>
                    <button class="btn btn--secondary btn--sm" onclick="app.editTrip('${String(trip.id).replace(/'/g, '&#39;')}')">
                        <i class="fas fa-edit"></i>
                        Edit
                    </button>
                    <button class="btn btn--outline btn--sm" onclick="app.deleteTrip('${String(trip.id).replace(/'/g, '&#39;')}'); return false;" title="Delete Trip">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }

    formatDateRange(startDate, endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);

        const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
        const endMonth = end.toLocaleDateString('en-US', { month: 'short' });

        if (startMonth === endMonth) {
            return `${startMonth} ${start.getDate()}-${end.getDate()}`;
        } else {
            return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}`;
        }
    }

    openPackingList(tripId) {
        this.currentTripId = String(tripId);
        // Normalize ID comparison to string to handle numeric vs string mismatches
        const trip = this.trips.find(t => String(t.id) === String(tripId));
        if (!trip) {
            console.warn('openPackingList: trip not found for id', tripId);
            return;
        }

        // Update packing list header
        const titleElement = document.getElementById('packing-trip-title');
        if (titleElement) {
            titleElement.innerHTML = `
                <div style="display: flex; align-items: center; gap: 16px; margin-top: 16px;">
                    <div>
                        <h1>${trip.title}</h1>
                        <p style="color: var(--text-secondary); margin: 8px 0 0 0; font-size: var(--font-size-lg);">
                            <i class="fas fa-map-marker-alt" style="margin-right: 8px;"></i>
                            ${trip.destination}
                        </p>
                    </div>
                    <div class="progress-ring" style="margin-left: auto;">
                        <svg width="60" height="60">
                            <circle class="progress-ring-bg" cx="30" cy="30" r="26"></circle>
                            <circle class="progress-ring-fill" cx="30" cy="30" r="26" 
                                    stroke-dasharray="163" 
                                    stroke-dashoffset="${163 - (trip.progress / 100) * 163}"></circle>
                        </svg>
                        <div class="progress-text">${trip.progress}%</div>
                    </div>
                </div>
            `;
        }

        // If there's a saved packing list for this trip, use it immediately
        const saved = this.currentPackingList && this.currentPackingList[trip.id];
        if (saved && Object.keys(saved).length > 0) {
            this.updatePackingCategories();
        } else {
            // No saved list: attempt to load from DB (async) and fall back to curated generation
            (async () => {
                try {
                    const userId = await this.getCurrentUserId();
                    if (supabaseClient && userId) {
                        const loaded = await this.loadPackingListFromDB(trip.id);
                        if (!loaded) {
                            this.generatePackingList(trip);
                        }
                    } else {
                        this.generatePackingList(trip);
                    }
                } catch (e) {
                    console.warn('openPackingList: failed to load DB packing list, falling back to curated list', e);
                    this.generatePackingList(trip);
                }
            })();
        }
        this.updateWeatherWidget(trip);
        // Show/hide flight widget based on transport mode
        const flightWidget = document.getElementById('flight-widget');
        if (flightWidget) {
            flightWidget.style.display = (trip.transport === 'Flight') ? '' : 'none';
        }
        this.showSection('packing-list');
        this.updateNavigation('packing-list');

        // Initialize Nearby Hotels widget below packing suggestions (independent, modular)
        try {
            if (window.NearbyHotels && trip.destination) {
                window.NearbyHotels.init('#nearby-hotels-anchor', trip.destination);
            }
        } catch (hotelErr) {
            console.warn('NearbyHotels init failed (non-critical):', hotelErr);
        }

        // Initialize Nearby Tourist Spots widget below packing suggestions (independent, modular)
        try {
            if (window.NearbyTouristSpots && trip.destination) {
                window.NearbyTouristSpots.init('#nearby-tourist-spots-anchor', trip.destination);
            }
        } catch (touristErr) {
            console.warn('NearbyTouristSpots init failed (non-critical):', touristErr);
        }
    }

    // Load packing list rows from Supabase `packing_lists` table and populate in-memory structure
    async loadPackingListFromDB(tripId) {
        try {
            const userId = await this.getCurrentUserId();
            if (!supabaseClient || !userId || !tripId) return false;

            const { data, error } = await supabaseClient
                .from('packing_lists')
                .select('id,category,item,is_checked')
                .eq('trip_id', tripId)
                .eq('user_id', userId)
                .order('created_at', { ascending: true });

            if (error) {
                console.warn('loadPackingListFromDB error', error);
                return false;
            }

            if (!data || !data.length) return false;

            // Build categories -> items mapping
            const mapping = {};
            for (const row of data) {
                const cat = row.category || 'extras';
                if (!mapping[cat]) mapping[cat] = [];
                mapping[cat].push({ id: row.id, name: row.item || '', checked: !!row.is_checked });
            }

            this.currentPackingList[tripId] = mapping;
            try { this.savePackingList(); } catch (e) { /* ignore */ }
            this.updatePackingCategories();
            return true;
        } catch (e) {
            console.warn('loadPackingListFromDB exception', e);
            return false;
        }
    }

    generatePackingList(trip) {
        // Curate a packing list based on transport, weather, trip type, and user preferences
        this.currentPackingList[trip.id] = this.curatePackingItems(trip);
        this.savePackingList();
        this.updatePackingCategories();
    }

    // Build a curated packing list object (categories -> array of item objects)
    curatePackingItems(trip) {
        const categories = {
            essentials: [],
            clothing: [],
            toiletries: [],
            tech: [],
            health: [],
            extras: []
        };

        const add = (cat, name, meta = {}) => {
            if (!name) return;
            // avoid duplicates (case-insensitive)
            const exists = categories[cat].some(i => i.name.toLowerCase() === name.toLowerCase());
            if (!exists) categories[cat].push(Object.assign({ name, checked: false, addedAt: new Date().toISOString() }, meta));
        };

        const norm = (s) => (s || '').toString().toLowerCase();
        const transport = norm(trip.transport);
        const purpose = norm(trip.purpose);
        const weather = trip.weather || {};
        const weatherCond = norm(weather.condition || '');
        const temp = Number(weather.temp || 0);

        // Base essentials that are generally useful (but we'll avoid adding flight-only items here)
        ['Wallet', 'Credit/Debit Cards', 'Cash', 'Phone', 'Charger', 'Travel Insurance', 'Emergency Contacts'].forEach(i => add('essentials', i));

        // Transport-specific items
        if (transport.includes('flight') || transport.includes('air')) {
            ['Passport', 'Visa', 'Boarding Pass', 'Flight Tickets', 'Travel Documents', 'Baggage Rules / Check Limits'].forEach(i => add('essentials', i, { transportSpecific: true }));
            add('tech', 'Portable Charger / Power Bank');
            add('extras', 'Neck Pillow');
        } else {
            // Remove any airport/flight related items by simply not adding them
            if (transport.includes('car') || transport.includes('drive')) {
                ['Snacks', 'Car Charger', 'Emergency Kit', 'Water Bottle', 'Pillow', 'Offline Maps', 'Jumper Cables', 'Flashlight'].forEach(i => add('extras', i));
            }
            if (transport.includes('train')) {
                ['Food / Snacks', 'Water Bottle', 'Neck Pillow', 'Power Bank', 'Blanket', 'Entertainment (books/tablet)'].forEach(i => add('extras', i));
            }
            if (transport.includes('bus')) {
                ['Food / Snacks', 'Water Bottle', 'Neck Pillow', 'Power Bank', 'Earplugs', 'Blanket'].forEach(i => add('extras', i));
            }
        }

        // Weather-based logic
        if (/rain|drizzle|shower/.test(weatherCond)) {
            ['Umbrella', 'Raincoat', 'Waterproof Bags for Electronics', 'Extra Socks'].forEach(i => add('extras', i));
        }
        if (/snow|sleet|blizzard/.test(weatherCond) || temp <= 5) {
            ['Thick Jacket', 'Thermals', 'Gloves', 'Warm Hat', 'Snow Boots'].forEach(i => add('clothing', i));
            ['Moisturizer (heavy)', 'Lip Balm'].forEach(i => add('toiletries', i));
        }
        if (/hot|sunny|clear/.test(weatherCond) || temp >= 30) {
            ['Sunscreen', 'Light/Cotton Clothes', 'Cap / Hat', 'Reusable Water Bottle', 'Sunglasses'].forEach(i => add('clothing', i));
            add('toiletries', 'After-sun Lotion');
        }
        if (/humid|tropical/.test(weatherCond) || (temp >= 25 && (weather.humidity || 0) >= 70)) {
            ['Mosquito Repellent', 'Breathable / Moisture-wicking Clothes', 'Extra Underwear'].forEach(i => add('toiletries', i));
        }

        // Trip-purpose logic (keyword matching — dynamic)
        const purposeMap = [
            { k: ['beach', 'seaside'], items: [{ cat: 'clothing', name: 'Swimwear' }, { cat: 'clothing', name: 'Beach Towel' }, { cat: 'clothing', name: 'Flip-flops' }, { cat: 'extras', name: 'Beach Bag' }] },
            { k: ['business', 'conference', 'meeting', 'work', 'corporate'], items: [{ cat: 'tech', name: 'Laptop' }, { cat: 'clothing', name: 'Blazer / Suit' }, { cat: 'clothing', name: 'Formal Shoes' }, { cat: 'essentials', name: 'Business Cards' }] },
            { k: ['adventure', 'hiking', 'trek', 'camp', 'backpack'], items: [{ cat: 'clothing', name: 'Hiking Shoes' }, { cat: 'extras', name: 'Backpack' }, { cat: 'health', name: 'First Aid Kit' }, { cat: 'extras', name: 'Trail Snacks' }] },
            { k: ['religious', 'pilgrim', 'temple', 'church', 'mosque'], items: [{ cat: 'clothing', name: 'Modest Clothing' }, { cat: 'essentials', name: 'Religious Items (as needed)' }] },
            { k: ['honeymoon', 'romance', 'anniversary'], items: [{ cat: 'clothing', name: 'Special Outfits' }, { cat: 'toiletries', name: 'Skincare / Accessories' }] },
            { k: ['family', 'kids', 'children', 'baby', 'child'], items: [{ cat: 'health', name: "Kids' Medicines" }, { cat: 'extras', name: "Kids' Snacks / Entertainment" }] }
        ];

        // match purpose keywords and add items
        purposeMap.forEach(mapping => {
            if (mapping.k.some(tok => purpose.includes(tok))) {
                mapping.items.forEach(it => add(it.cat, it.name, { purposeSpecific: true }));
            }
        });

        // If no specific purpose matched, add general travel clothing/toiletries
        if (!purpose || purpose.trim() === '') {
            ['T-shirts', 'Underwear', 'Socks', 'Comfortable Shoes'].forEach(i => add('clothing', i));
            ['Toothbrush', 'Toothpaste', 'Shampoo', 'Deodorant'].forEach(i => add('toiletries', i));
        }

        // Tech and health defaults
        ['Phone Charger', 'USB Cables', 'Travel Adapter'].forEach(i => add('tech', i));
        ['Prescription Medications', 'Vitamins', 'Hand Sanitizer'].forEach(i => add('health', i));

        // Ensure transport exclusions (remove flight/airport items for ground transport)
        if (transport.includes('car') || transport.includes('train') || transport.includes('bus') || transport === '') {
            // remove any flight-specific items if present in essentials
            categories.essentials = categories.essentials.filter(i => !/passport|visa|boarding pass|flight tickets|baggage rules/i.test(i.name));
        }

        // Integrate user preferences (if available) — preferences can be an object with include/exclude arrays or booleans
        const prefs = (trip.preferences && typeof trip.preferences === 'object') ? trip.preferences : (this.currentUser && this.currentUser.preferences ? this.currentUser.preferences : null);
        if (prefs) {
            // if prefs.exclude is array of strings, remove matching items
            if (Array.isArray(prefs.exclude)) {
                const excludes = prefs.exclude.map(s => norm(s));
                Object.keys(categories).forEach(cat => {
                    categories[cat] = categories[cat].filter(i => !excludes.some(ex => i.name.toLowerCase().includes(ex)));
                });
            }
            // if prefs.include is array, ensure those items are present
            if (Array.isArray(prefs.include)) {
                prefs.include.forEach(inc => {
                    // place include into extras by default if not found
                    const incStr = inc.toString();
                    const found = Object.keys(categories).some(cat => categories[cat].some(i => i.name.toLowerCase() === incStr.toLowerCase()));
                    if (!found) add('extras', incStr, { userPreferred: true });
                });
            }
        }

        // Final sanitization: remove generic duplicates and items that conflict with transport logic
        Object.keys(categories).forEach(cat => {
            // trim whitespace and remove empty names
            categories[cat] = categories[cat].filter(i => i.name && i.name.toString().trim() !== '').map(i => ({ ...i, name: i.name.toString().trim() }));
        });

        return categories;
    }

    // --- AI Agent: interactive assistant for enhanced packing suggestions ---
    async geocodeDestination(destination) {
        if (!destination) return null;
        try {
            const params = new URLSearchParams({ q: destination, format: 'json', limit: 1 });
            const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`);
            if (!res.ok) return null;
            const out = await res.json();
            if (out && out[0]) return { lat: parseFloat(out[0].lat), lon: parseFloat(out[0].lon) };
            return null;
        } catch (e) {
            console.warn('Geocode failed', e);
            return null;
        }
    }

    async fetchWeatherForCoords(lat, lon, startDate, endDate) {
        try {
            const params = new URLSearchParams({
                latitude: lat,
                longitude: lon,
                daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
                hourly: 'temperature_2m,relativehumidity_2m,precipitation_probability',
                timezone: 'auto',
                start_date: startDate,
                end_date: endDate
            });
            const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('Weather fetch failed');
            const data = await res.json();
            return data;
        } catch (e) {
            console.warn('Weather fetch error', e);
            return null;
        }
    }

    // Best-effort trend fetching; uses AllOrigins to attempt HTML retrieval, but falls back to heuristics
    async fetchTrendsForDestination(destination) {
        const trends = { keywords: [], items: [] };
        if (!destination) return trends;
        try {
            // Don't attempt proxied scraping during local development to avoid noisy CORS errors
            const hostname = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : '';
            const isLocal = hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '0.0.0.0' || hostname.startsWith('192.168.') || hostname.startsWith('10.');
            if (!isLocal) {
                // Attempt to fetch Pinterest search page via AllOrigins (may fail due to CORS or rate limits)
                try {
                    const encoded = encodeURIComponent(`https://www.pinterest.com/search/pins/?q=${destination}`);
                    const proxyUrl = `https://api.allorigins.win/raw?url=${encoded}`;
                    const res = await fetch(proxyUrl, { cache: 'no-store' });
                    if (res.ok) {
                        const html = await res.text();
                        // parse simple keywords from HTML content (fallback, lightweight)
                        const matches = html.match(/"alt":"([^\"]{4,80})"/g) || [];
                        matches.slice(0, 10).forEach(m => {
                            try { trends.keywords.push(m.replace(/\"alt\":\"|\"/g, '')); } catch (e) { }
                        });
                    }
                } catch (e) {
                    // network/CORS issues are expected in some environments; log debug only
                    console.debug('Trend proxy fetch skipped/failed:', e && (e.message || e));
                }
            }
        } catch (e) {
            // ignore and fallback
        }

        // Fallback: derive trend-like items from destination name and common travel trends
        const baseFallback = [
            'Lightweight reusable water bottle', 'Portable phone stand', 'Stylish scarf', 'Minimal jewelry',
            'Compact toiletry kit', 'Collapsible bag', 'Travel-sized sunscreen', 'Travel-friendly outfit set'
        ];
        trends.items = trends.items.concat(baseFallback.slice(0, 6));
        return trends;
    }

    // Create and run the AI Agent experience for a trip (UI + logic)
    async startAIAgentForTrip(trip) {
        // Prepare basic context
        const tripId = trip.id;
        // Create overlay modal (reuse modal styles)
        let overlay = document.getElementById('ai-agent-overlay');
        if (overlay) overlay.remove();

        overlay = document.createElement('div');
        overlay.id = 'ai-agent-overlay';
        overlay.className = 'modal show';
        overlay.innerHTML = `
            <div class="modal-overlay"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Pack Assistant</h2>
                    <button class="modal-close" id="ai-close-btn"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body" style="min-height:200px;">
                    <div id="ai-loading-caption" style="font-size:1.05rem;margin-bottom:12px;">✨ Creating your personalized packing checklist…</div>
                    <div id="ai-chat-container"></div>
                </div>
                <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:12px;">
                    <button class="btn btn--secondary" id="ai-skip-btn">Skip</button>
                    <button class="btn btn--primary" id="ai-done-btn" style="display:none;">Done</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        // Close handlers
        document.getElementById('ai-close-btn').addEventListener('click', () => overlay.remove());
        document.getElementById('ai-skip-btn').addEventListener('click', () => {
            overlay.remove();
        });

        const captionEl = document.getElementById('ai-loading-caption');
        const chatContainer = document.getElementById('ai-chat-container');

        // Animated captions during preparation
        const captions = [
            '✨ Creating your personalized packing checklist…',
            '🧳 Crafting the perfect travel kit for your trip…',
            '🌍 Analyzing weather, trends, and your travel vibe…',
            '🔍 Researching destination tips and trending essentials…'
        ];
        let capIdx = 0;
        const capInterval = setInterval(() => {
            captionEl.textContent = captions[capIdx % captions.length];
            capIdx += 1;
        }, 1200);

        // Fetch data in background (geocode + weather + trends) - non-blocking
        let coords = null;
        let weatherData = null;
        let trends = { keywords: [], items: [] };
        try {
            if (trip.destination) coords = await this.geocodeDestination(trip.destination);
            const start = trip.startDate || new Date().toISOString().split('T')[0];
            const end = trip.endDate || start;
            weatherData = (coords) ? await this.fetchWeatherForCoords(coords.lat, coords.lon, start, end) : null;
            trends = await this.fetchTrendsForDestination(trip.destination || trip.title || '');
        } catch (fetchErr) {
            console.warn('Failed to fetch AI agent data:', fetchErr);
            // Continue with defaults
        }

        // stop caption rotation and start Q&A
        clearInterval(capInterval);
        captionEl.style.display = 'none';

        // Prepare conversational Q&A questions
        const questions = [
            { key: 'gender', q: 'What is your gender (optional)?', type: 'choice', choices: ['Female', 'Male', 'Non-binary', 'Prefer not to say'] },
            { key: 'vibe', q: 'How would you describe the vibe/purpose (e.g., girl\'s trip, solo relaxation, business)?', type: 'text' },
            { key: 'weather', q: 'What weather are you expecting?', type: 'choice', choices: ['Hot & Sunny', 'Cold', 'Rainy', 'Mixed / Unpredictable'] },
            { key: 'activities', q: 'What activities will you do? (hiking, beach, nightlife, meetings, photoshoots, etc.)', type: 'text' },
            { key: 'accommodation', q: 'Where will you be staying?', type: 'choice', choices: ['Hotel', 'Hostel', 'Camping / Outdoors', 'Airbnb / Apartment'] },
            { key: 'transport_type', q: 'How are you travelling?', type: 'choice', choices: ['Flight', 'Train', 'Road Trip / Car', 'Bus'] },
            { key: 'pref_packing', q: 'What is your packing style?', type: 'choice', choices: ['Minimal', 'Fashion-Focused', 'Photography Gear', 'Adventure / Outdoor', 'Tech-Heavy'] },
            { key: 'laundry', q: 'Will laundry be available at your destination?', type: 'choice', choices: ['Yes', 'No', 'Not Sure'] },
            { key: 'places', q: 'Any specific places or venues you plan to visit? (optional)', type: 'text' },
            { key: 'style', q: 'Any fashion/style preferences? (minimal, trendy, sporty, formal)', type: 'text' },
            { key: 'special', q: 'Any special requirements? (medications, baby items, gadgets, mobility, etc.)', type: 'text' }
        ];

        const answers = {};

        const renderQuestion = (idx) => {
            chatContainer.innerHTML = '';
            if (idx >= questions.length) {
                renderAIAgentSummary();
                return;
            }
            const q = questions[idx];
            const qEl = document.createElement('div');
            qEl.className = 'ai-question';
            qEl.innerHTML = `<p style="font-weight:600;margin-bottom:8px;">${q.q}</p>`;

            if (q.type === 'choice') {
                const btnWrap = document.createElement('div');
                btnWrap.style.display = 'flex';
                btnWrap.style.flexWrap = 'wrap';
                btnWrap.style.gap = '8px';
                q.choices.forEach(ch => {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'btn btn--outline btn--sm';
                    b.textContent = ch;
                    b.addEventListener('click', () => {
                        answers[q.key] = ch;
                        renderQuestion(idx + 1);
                    });
                    btnWrap.appendChild(b);
                });
                qEl.appendChild(btnWrap);
            } else {
                const ta = document.createElement('input');
                ta.type = 'text';
                ta.className = 'form-control';
                ta.style.width = '100%';
                ta.placeholder = 'Type your answer here (or leave blank to skip)';
                const nextBtn = document.createElement('button');
                nextBtn.type = 'button';
                nextBtn.className = 'btn btn--primary btn--sm';
                nextBtn.textContent = 'Next';
                nextBtn.style.marginTop = '8px';
                nextBtn.addEventListener('click', () => {
                    answers[q.key] = ta.value || '';
                    renderQuestion(idx + 1);
                });
                qEl.appendChild(ta);
                qEl.appendChild(nextBtn);
            }

            chatContainer.appendChild(qEl);
        };

        const renderAIAgentSummary = () => {
            chatContainer.innerHTML = '';
            const summary = document.createElement('div');
            summary.innerHTML = `<p style="font-weight:700;">✨ Thanks! Generating your personalized packing list with AI…</p><p style="color:var(--text-secondary);font-size:0.95rem;margin-top:4px;">This may take a moment.</p>`;
            chatContainer.appendChild(summary);

            setTimeout(async () => {
                // Build aiContext from all collected answers + background data
                const aiContext = Object.assign({}, answers, { trends, weatherData });

                // Store aiContext on the trip object for later regeneration
                const tripObj = this.trips.find(x => x.id === tripId);
                if (tripObj) {
                    tripObj.aiContext = aiContext;
                    // Persist aiContext to Supabase if available
                    try { await this.updateTripInSupabase(tripId, { aiContext }); } catch (e) { /* non-critical */ }
                }

                // Attempt OpenAI-powered packing list generation via Supabase proxy
                let openAISuccess = false;
                try {
                    const weatherDesc = answers.weather || (weatherData && weatherData.condition) || 'unknown';
                    const prompt = `Generate a comprehensive packing list as a JSON object for a traveller with these details:
- Destination: ${trip.destination || 'Unknown'}
- Trip duration: ${trip.duration || 'Unknown'} days
- Trip type / vibe: ${answers.vibe || trip.purpose || 'General travel'}
- Expected weather: ${weatherDesc}
- Planned activities: ${answers.activities || 'General sightseeing'}
- Accommodation: ${answers.accommodation || 'Hotel'}
- Transport: ${answers.transport_type || trip.transport || 'Flight'}
- Packing style: ${answers.pref_packing || 'Balanced'}
- Laundry available: ${answers.laundry || 'Unknown'}
- Places to visit: ${answers.places || 'Various'}
- Fashion preferences: ${answers.style || 'None specified'}
- Special needs: ${answers.special || 'None'}
- Gender: ${answers.gender || 'Not specified'}

Return ONLY valid JSON in this exact structure (no markdown, no explanation):
{"essentials":["item1","item2"],"clothing":["item1"],"toiletries":["item1"],"tech":["item1"],"health":["item1"],"extras":["item1"]}

Be specific and practical. Tailor items to the activities, weather, accommodation, and packing style. Include 6-12 items per category.`;

                    const messages = [
                        { role: 'system', content: 'You are a smart travel packing assistant. You help users create and improve packing lists based on their trip details such as destination, duration, weather, activities, accommodation type, and preferences. You can regenerate packing lists, suggest travel items, and answer packing-related questions. Always respond with valid JSON when asked.' },
                        { role: 'user', content: prompt }
                    ];

                    const result = await callLLMViaSupabase(messages);
                    // Extract text from response
                    let rawText = '';
                    if (result && result.choices && result.choices[0] && result.choices[0].message) {
                        rawText = result.choices[0].message.content || '';
                    } else if (typeof result === 'string') {
                        rawText = result;
                    } else if (result && result.reply) {
                        rawText = result.reply;
                    }

                    // Parse JSON packing list
                    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);
                        const newList = {};
                        const categories = ['essentials', 'clothing', 'toiletries', 'tech', 'health', 'extras'];
                        categories.forEach(cat => {
                            const raw = parsed[cat] || [];
                            newList[cat] = raw.map(name => ({ name: String(name), checked: false, addedAt: new Date().toISOString(), aiGenerated: true }));
                        });
                        this.currentPackingList[tripId] = newList;
                        this.savePackingList();
                        this.currentTripId = tripId;
                        this.updatePackingCategories();
                        openAISuccess = true;
                        summary.innerHTML = `<p style="font-weight:700;color:var(--success);">✅ AI packing list ready!</p><p style="color:var(--text-secondary);font-size:0.93rem;">Personalised just for your trip to ${trip.destination || 'your destination'}.</p>`;
                    }
                } catch (aiErr) {
                    console.warn('[PackAssistant] OpenAI list generation failed, falling back:', aiErr);
                }

                // Fallback to curated static list if OpenAI failed
                if (!openAISuccess) {
                    try {
                        await this.applyAIAugmentedPacking(tripId, trip, aiContext);
                        summary.innerHTML = `<p style="font-weight:700;">✅ Packing list ready!</p>`;
                    } catch (e) {
                        console.error('AI augmented packing failed', e);
                        summary.innerHTML = `<p style="font-weight:700;color:var(--danger);">Could not generate list — please try again.</p>`;
                    }
                }

                document.getElementById('ai-done-btn').style.display = '';
            }, 400);
        };

        document.getElementById('ai-done-btn').addEventListener('click', () => overlay.remove());

        // Start with first question
        renderQuestion(0);
    }

    // Apply AI augmentation to packing list and refresh UI
    async applyAIAugmentedPacking(tripId, trip, aiContext) {
        // Build a combined trip object for curation
        const augmentedTrip = Object.assign({}, trip, { aiContext });

        // Start with base curated categories
        const baseCategories = this.curatePackingItems(augmentedTrip);

        // Augment categories based on aiContext fields
        const addTo = (cat, name, meta) => {
            if (!baseCategories[cat]) baseCategories[cat] = [];
            const exists = baseCategories[cat].some(i => i.name.toLowerCase() === name.toLowerCase());
            if (!exists) baseCategories[cat].push(Object.assign({ name, checked: false, addedAt: new Date().toISOString() }, meta));
        };

        const norm = s => (s || '').toString().toLowerCase();
        const ctx = aiContext || {};

        // Gender-specific / beauty items
        if (ctx.gender && /female|woman|girl/i.test(ctx.gender)) {
            ['Makeup basics', 'Hair ties', 'Face wipes', 'Compact mirror'].forEach(i => addTo('toiletries', i));
        }

        // Vibe/style -> add fashion-forward items
        if (ctx.style && /trendy|fashion|aesthetic|stylish/.test(norm(ctx.style))) {
            ['Statement accessories', 'Coordinated outfits', 'Lightweight layering pieces'].forEach(i => addTo('clothing', i, { aiSuggested: true }));
        }

        // Activities
        if (ctx.activities) {
            const act = norm(ctx.activities);
            if (/hike|trek|trail/.test(act)) ['Hiking poles (optional)', 'Durable backpack', 'Quick-dry socks'].forEach(i => addTo('extras', i));
            if (/swim|beach|snorkel/.test(act)) ['Waterproof pouch', 'Cover-up', 'Aesthetic beach outfit'].forEach(i => addTo('clothing', i));
            if (/photograph|photoshoot|content|instagram|reel/.test(act)) ['Extra outfit options', 'Portable ring light', 'Tripod / mini stand'].forEach(i => addTo('tech', i));
        }

        // Places - destination specific small items
        if (ctx.places) {
            const p = norm(ctx.places);
            if (/temple|mosque|church|shrine/.test(p)) addTo('clothing', 'Modest clothing / shawl');
        }

        // Trends
        if (ctx.trends && ctx.trends.items && ctx.trends.items.length) {
            ctx.trends.items.slice(0, 5).forEach(item => addTo('extras', item, { trend: true }));
        }

        // Special requirements
        if (ctx.special && ctx.special.trim()) {
            addTo('health', `Special requirement: ${ctx.special}`, { userNote: true });
        }

        // Save augmented list and refresh UI
        this.currentPackingList[tripId] = baseCategories;
        this.savePackingList();
        // open packing list view if not already
        if (this.currentTripId !== tripId) this.currentTripId = tripId;
        this.updatePackingCategories();
    }

    addPurposeSpecificItems(trip) {
        const purposeItems = {
            'Business': [
                'Business Cards', 'Laptop', 'Presentation Materials',
                'Formal Suit', 'Dress Shoes', 'Ties', 'Professional Documents'
            ],
            'Beach': [
                'Swimwear', 'Beach Towel', 'Flip-flops', 'Sunglasses',
                'Beach Bag', 'Water Shoes', 'Snorkel Gear'
            ],
            'Adventure': [
                'Hiking Boots', 'Backpack', 'Trail Mix', 'First Aid Kit',
                'Map/GPS', 'Headlamp', 'Multi-tool', 'Weather Gear'
            ]
        };

        const purposeKey = Object.keys(purposeItems).find(k => k.toLowerCase() === (trip.purpose || '').toLowerCase());
        if (purposeKey) {
            const existingItems = this.currentPackingList[trip.id]['essentials'].map(item => item.name);
            purposeItems[purposeKey].forEach(item => {
                if (!existingItems.includes(item)) {
                    this.currentPackingList[trip.id]['essentials'].push({
                        name: item,
                        checked: false,
                        addedAt: new Date().toISOString(),
                        purposeSpecific: true
                    });
                }
            });
        }
    }

    updatePackingCategories() {
        const container = document.getElementById('packing-categories');
        if (!container || !this.currentTripId) return;

        const packingList = this.currentPackingList[this.currentTripId];
        if (!packingList) return;

        container.innerHTML = Object.keys(packingList).map(category => {
            const items = packingList[category];
            const checkedItems = items.filter(item => item.checked).length;
            const progress = items.length > 0 ? Math.round((checkedItems / items.length) * 100) : 0;

            return `
                <div class="category">
                    <div class="category-header">
                        <div>
                            <h3 class="category-title">
                                <i class="${this.getCategoryIcon(category)}" style="margin-right: 12px; color: var(--primary);"></i>
                                ${category.charAt(0).toUpperCase() + category.slice(1)}
                            </h3>
                        </div>
                        <div style="display: flex; align-items: center; gap: 16px;">
                            <span class="category-progress">${checkedItems}/${items.length} • ${progress}%</span>
                            <button class="btn btn--outline btn--sm" onclick="app.addCustomItem('${category}')" title="Add Custom Item">
                                <i class="fas fa-plus"></i>
                            </button>
                        </div>
                    </div>
                    <div class="packing-items">
                        ${items.map((item, index) => `
                            <div class="packing-item ${item.checked ? 'checked' : ''}" 
                                 data-category="${category}" data-index="${index}" onclick="app.toggleItem('${category}', ${index}, event)">
                                <div class="item-checkbox"></div>
                                <span class="item-text">${item.name}</span>
                                ${item.purposeSpecific ? '<i class="fas fa-star" style="color: var(--warning); margin-left: auto;" title="Purpose-specific item"></i>' : ''}
                                ${items.length > this.packingCategories[category]?.length && index >= this.packingCategories[category]?.length ?
                    `<button class="btn btn--sm" onclick="event.stopPropagation(); app.removeCustomItem('${category}', ${index})" style="margin-left: auto; padding: 4px 8px;" title="Remove custom item">
                                        <i class="fas fa-times"></i>
                                    </button>` : ''
                }
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');

        // render small AI quick-toggle above the packing categories so users can open the chat anytime
        try {
            this.renderAIQuickToggle();
        } catch (e) {
            console.warn('Failed to render AI quick toggle', e);
        }

        // Render persistent Save button for packing list
        try {
            this.renderPackingSaveButton();
        } catch (e) { console.warn('Failed to render save button', e); }
    }

    renderPackingSaveButton() {
        // Ensure button exists once per page
        let btn = document.getElementById('packing-save-btn');
        if (btn) return;

        btn = document.createElement('button');
        btn.id = 'packing-save-btn';
        btn.className = 'btn btn--primary';
        btn.style.position = 'fixed';
        btn.style.right = '24px';
        btn.style.bottom = '24px';
        btn.style.zIndex = 9999;
        btn.style.padding = '12px 18px';
        btn.innerHTML = '<i class="fas fa-save" style="margin-right:8px"></i>Save packing list';

        btn.addEventListener('click', async () => {
            try {
                await this.savePackingNow();
                this.showToast('Packing list saved', 'success');
            } catch (e) {
                console.warn('Save packing failed', e);
                this.showToast('Failed to save packing list', 'error');
            }
        });

        document.body.appendChild(btn);
    }

    async savePackingNow() {
        // Persist currentPackingList to per-user storage key if available, otherwise global packing
        try {
            const userId = await this.getCurrentUserId();
            const storageKey = this.getUserStorageKey('packing', userId);
            this.saveToStorage(storageKey, this.currentPackingList || {});
            // Also keep a global backup so anonymous changes are not lost and can be merged
            try { this.saveToStorage('packing', this.currentPackingList || {}); } catch (e) { /* ignore */ }
            // Also call legacy savePackingList for compatibility
            try { this.savePackingList(); } catch (e) { }
            // Optionally attempt to sync checked state to Supabase trips table progress
            if (userId && supabaseClient) {
                // attempt to record checked items per trip (non-blocking)
                const checked = [];
                Object.keys(this.currentPackingList || {}).forEach(cat => {
                    (this.currentPackingList[this.currentTripId] && this.currentPackingList[this.currentTripId][cat] || []).forEach(i => {
                        if (i.checked) checked.push(i.name || i.item || '');
                    });
                });
                const trip = this.trips.find(t => String(t.id) === String(this.currentTripId));
                if (trip) {
                    trip.checkedItems = checked;
                    try { await this.syncTripProgress(trip); } catch (e) { /* ignore sync errors */ }
                }
            }
        } catch (e) {
            console.warn('savePackingNow error', e);
            throw e;
        }
    }

    /* Packing Templates - save / fetch / apply helpers (isolated to templates feature) */
    async savePackingTemplate({ name, description, items } = {}, buttonEl) {
        // Delegate to new canonical saveTemplate() function
        const templateData = { description: description || '' };
        return await this.saveTemplate({ name: name || description, title: name || description, description: description || '', items: items || {}, templateData }, buttonEl);
    }

    async fetchUserPackingTemplates() {
        const userId = this.currentUser && this.currentUser.id ? this.currentUser.id : null;
        if (!supabaseClient || !userId) {
            // local fallback
            const key = userId ? `zipit_app_templates_${userId}` : 'zipit_app_templates_demo';
            const local = this.loadFromStorage(key) || [];
            // Normalize local shape to expected fields (id, name, description, items)
            return (local || []).map(t => ({ id: t.id, name: t.name || t.title || '', description: t.description || (t.template_data && t.template_data.description) || '', items: t.items || (t.template_data && (t.template_data.packingItems || t.template_data.items)) || {}, raw: t.template_data || {} }));
        }

        try {
            const rows = await this.loadTemplates();
            // normalize to previous shape expected by callers
            return (rows || []).map(t => ({ id: t.id, name: t.name || t.title || '', description: t.description || '', items: t.items || (t.template_data && t.template_data.packingItems) || {}, raw: t.template_data }));
        } catch (err) {
            console.error('fetchUserPackingTemplates error', err);
            return [];
        }
    }

    /* --- New canonical template DB functions (app_templates) --- */

    // saveTemplate: inserts into app_templates with required fields
    async saveTemplate({ name = '', title = '', description = '', items = {}, templateData = null } = {}, buttonEl) {
        const btn = buttonEl;
        const origHTML = btn ? btn.innerHTML : null;
        try {
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }

            // Ensure templateData is an object and not null
            templateData = templateData || {};
            // Defensive defaults
            if (templateData === null || typeof templateData !== 'object') templateData = {};

            // Ensure items is an object/array
            items = items || {};

            const userId = this.currentUser && this.currentUser.id ? this.currentUser.id : null;
            if (!supabaseClient || !userId) {
                // Local fallback
                const key = userId ? `zipit_app_templates_${userId}` : 'zipit_app_templates_demo';
                const existing = this.loadFromStorage(key) || [];
                const newTemplate = {
                    id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('local-' + Date.now()),
                    user_id: userId,
                    name: name || title || 'Untitled Template',
                    title: title || name || '',
                    description: description || '',
                    items: items,
                    template_data: templateData,
                    is_public: false,
                    created_at: new Date().toISOString()
                };
                existing.push(newTemplate);
                this.saveToStorage(key, existing);
                if (btn) btn.innerHTML = 'Saved ✓';
                setTimeout(() => { if (btn) { btn.innerHTML = origHTML; btn.disabled = false; } }, 1400);
                this.showToast('Template saved (offline)', 'success');
                return newTemplate;
            }

            // Build payload conforming to app_templates schema
            const payload = {
                name: name || title || 'Untitled Template',
                title: title || name || '',
                description: description || '',
                items: items || {},
                template_data: templateData || {},
                user_id: userId,
                is_public: false
            };

            const { data, error } = await supabaseClient
                .from('app_templates')
                .insert([payload])
                .select();

            if (error) {
                console.error('saveTemplate insert error', error);
                this.showToast('Failed to save template', 'error');
                if (btn) { btn.innerHTML = origHTML; btn.disabled = false; }
                return null;
            }

            if (btn) btn.innerHTML = 'Saved ✓';
            setTimeout(() => { if (btn) { btn.innerHTML = origHTML; btn.disabled = false; } }, 1400);
            this.showToast('Template saved', 'success');
            return Array.isArray(data) ? data[0] : data;
        } catch (err) {
            console.error('saveTemplate error', err);
            this.showToast('Failed to save template', 'error');
            if (btn) { btn.disabled = false; if (origHTML) btn.innerHTML = origHTML; }
            return null;
        }
    }

    // loadTemplates: reads app_templates for user and public templates
    async loadTemplates() {
        const userId = this.currentUser && this.currentUser.id ? this.currentUser.id : null;
        if (!supabaseClient || !userId) {
            const key = userId ? `zipit_app_templates_${userId}` : 'zipit_app_templates_demo';
            const local = this.loadFromStorage(key) || [];
            return (local || []).map(t => ({ id: t.id, name: t.name || t.title || '', title: t.title || t.name || '', description: t.description || '', items: t.items || (t.template_data && t.template_data.packingItems) || {}, template_data: t.template_data || {}, is_public: !!t.is_public, created_at: t.created_at || null }));
        }

        try {
            const orFilter = `user_id.eq.${userId},is_public.eq.true`;
            const { data, error } = await supabaseClient
                .from('app_templates')
                .select('id,name,title,description,items,template_data,is_public,created_at')
                .or(orFilter)
                .order('created_at', { ascending: false });

            if (error) { console.warn('loadTemplates error', error); return []; }
            return (data || []).map(t => ({ id: t.id, name: t.name || t.title || '', title: t.title || t.name || '', description: t.description || '', items: t.items || (t.template_data && t.template_data.packingItems) || {}, template_data: t.template_data || {}, is_public: !!t.is_public, created_at: t.created_at || null }));
        } catch (err) {
            console.error('loadTemplates exception', err);
            return [];
        }
    }

    // loadTemplateById: get a single template
    async loadTemplateById(templateId) {
        if (!templateId) return null;
        const userId = this.currentUser && this.currentUser.id ? this.currentUser.id : null;
        if (!supabaseClient || !userId) {
            const key = userId ? `zipit_app_templates_${userId}` : 'zipit_app_templates_demo';
            const local = this.loadFromStorage(key) || [];
            const found = (local || []).find(t => String(t.id) === String(templateId));
            if (!found) return null;
            return { id: found.id, name: found.name || found.title || '', title: found.title || found.name || '', description: found.description || '', items: found.items || (found.template_data && found.template_data.packingItems) || {}, template_data: found.template_data || {}, is_public: !!found.is_public, created_at: found.created_at || null };
        }

        try {
            const { data, error } = await supabaseClient
                .from('app_templates')
                .select('id,name,title,description,items,template_data,is_public,created_at')
                .eq('id', templateId)
                .single();

            if (error) { console.warn('loadTemplateById error', error); return null; }
            const t = data;
            return { id: t.id, name: t.name || t.title || '', title: t.title || t.name || '', description: t.description || '', items: t.items || (t.template_data && t.template_data.packingItems) || {}, template_data: t.template_data || {}, is_public: !!t.is_public, created_at: t.created_at || null };
        } catch (err) {
            console.error('loadTemplateById exception', err);
            return null;
        }
    }

    // duplicateTemplate: clone an existing template into a new row
    async duplicateTemplate(templateId) {
        if (!templateId) return null;
        const src = await this.loadTemplateById(templateId);
        if (!src) { this.showToast('Template not found', 'error'); return null; }
        const userId = this.currentUser && this.currentUser.id ? this.currentUser.id : null;
        const payload = {
            name: (src.name || src.title || 'Template') + ' (Copy)',
            title: (src.title || src.name || '') + ' (Copy)',
            description: src.description || '',
            items: src.items || (src.template_data && src.template_data.packingItems) || {},
            template_data: src.template_data ? JSON.parse(JSON.stringify(src.template_data)) : {},
            user_id: userId,
            is_public: false
        };
        if (!supabaseClient || !userId) {
            const key = userId ? `zipit_app_templates_${userId}` : 'zipit_app_templates_demo';
            const existing = this.loadFromStorage(key) || [];
            const newTemplate = { id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('local-' + Date.now()), ...payload, created_at: new Date().toISOString() };
            existing.unshift(newTemplate);
            this.saveToStorage(key, existing);
            this.showToast('Template duplicated (offline)', 'success');
            return newTemplate;
        }

        try {
            const { data, error } = await supabaseClient
                .from('app_templates')
                .insert([payload])
                .select();
            if (error) { console.error('duplicateTemplate insert error', error); this.showToast('Failed to duplicate template', 'error'); return null; }
            const created = Array.isArray(data) ? data[0] : data;
            this.showToast('Template duplicated', 'success');
            return created;
        } catch (err) {
            console.error('duplicateTemplate exception', err); this.showToast('Failed to duplicate template', 'error'); return null;
        }
    }

    // deleteTemplate: remove from app_templates (only owner)
    async deleteTemplate(templateId) {
        if (!templateId) return false;
        const userId = this.currentUser && this.currentUser.id ? this.currentUser.id : null;
        if (!supabaseClient || !userId) {
            const key = userId ? `zipit_app_templates_${userId}` : 'zipit_app_templates_demo';
            const existing = this.loadFromStorage(key) || [];
            const filtered = (existing || []).filter(t => String(t.id) !== String(templateId));
            this.saveToStorage(key, filtered);
            this.showToast('Template deleted (offline)', 'success');
            return true;
        }

        try {
            const { data, error } = await supabaseClient
                .from('app_templates')
                .delete()
                .eq('id', templateId)
                .eq('user_id', userId);
            if (error) { console.error('deleteTemplate error', error); this.showToast('Failed to delete template', 'error'); return false; }
            this.showToast('Template deleted', 'success');
            return true;
        } catch (err) {
            console.error('deleteTemplate exception', err); this.showToast('Failed to delete template', 'error'); return false;
        }
    }

    // renderTemplates: loads templates and renders into #templates-grid (keeps markup unchanged)
    async renderTemplates() {
        try {
            const templatesGrid = document.getElementById('templates-grid');
            if (!templatesGrid) return;
            const templates = await this.loadTemplates();
            templatesGrid.innerHTML = (templates || []).map(t => {
                const safeName = t.name ? String(t.name) : (t.title || 'Template');
                const safeDesc = t.description || (t.template_data && t.template_data.description) || '';
                const dataItems = this.escapeHtml(JSON.stringify(t.template_data?.packingItems || t.items || {}));
                return `
                    <div class="template-card" data-template-id="${t.id}" data-template-items='${dataItems}'>
                        <div class="template-header">
                            <h3>${this.escapeHtml(safeName)}</h3>
                            <div style="display:flex; gap:8px; align-items:center;">
                                <button class="btn btn--outline btn--sm duplicate-template-btn" data-template-id="${t.id}" type="button"><i class="fas fa-copy"></i></button>
                                <button class="btn btn--outline btn--sm delete-template-btn" data-template-id="${t.id}" type="button"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>
                        <p>${this.escapeHtml(safeDesc)}</p>
                    </div>
                `;
            }).join('');

            // Wire buttons
            templatesGrid.querySelectorAll('.duplicate-template-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => { e.stopPropagation(); const id = btn.getAttribute('data-template-id'); await this.duplicateTemplate(id); await this.renderTemplates(); });
            });
            templatesGrid.querySelectorAll('.delete-template-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => { e.stopPropagation(); const id = btn.getAttribute('data-template-id'); if (!confirm('Delete this template?')) return; await this.deleteTemplate(id); await this.renderTemplates(); });
            });
        } catch (err) { console.error('renderTemplates error', err); }
    }

    applyPackingTemplateToTrip(tripId, template) {
        if (!tripId || !template) return;
        // Accept templates where `items` is an object mapping categories -> [{name,...}]
        const items = template.items || {};
        // Normalize to internal structure: category -> [ { id, name, checked } ]
        this.currentPackingList[tripId] = this.currentPackingList[tripId] || {};
        Object.keys(items).forEach(cat => {
            const arr = Array.isArray(items[cat]) ? items[cat] : [];
            this.currentPackingList[tripId][cat] = arr.map(it => ({ id: 'tpl-' + (it.id || Math.random()).toString().slice(2), name: it.name || it.item || '', checked: false }));
        });
        // Keep other categories untouched if already present
        this.savePackingList();
        if (!this.currentTripId) this.currentTripId = tripId;
        this.updatePackingCategories();
    }

    getCategoryIcon(category) {
        const icons = {
            essentials: 'fas fa-star',
            clothing: 'fas fa-tshirt',
            toiletries: 'fas fa-soap',
            tech: 'fas fa-laptop',
            health: 'fas fa-heartbeat'
        };
        return icons[category] || 'fas fa-list';
    }

    // Render a small AI assistant toggle above the packing categories
    renderAIQuickToggle() {
        const container = document.getElementById('packing-categories');
        if (!container) return;

        // Check if toggle already exists
        let toggle = document.getElementById('ai-quick-toggle');
        if (toggle) return; // already present

        toggle = document.createElement('div');
        toggle.id = 'ai-quick-toggle';
        toggle.style.display = 'flex';
        toggle.style.justifyContent = 'flex-end';
        toggle.style.margin = '8px 0';
        toggle.innerHTML = `
            <button type="button" class="btn btn--outline" id="ai-open-chat-btn" title="Ask the Pack Assistant">
                <i class="fas fa-robot" style="margin-right:8px"></i>
                Pack Assistant
            </button>
        `;

        container.parentNode.insertBefore(toggle, container);

        document.getElementById('ai-open-chat-btn').addEventListener('click', () => {
            const tripId = this.currentTripId;
            this.openAIQuickChat(tripId);
        });
    }

    // Open a lightweight AI chat panel that can accept text or voice input and modify packing list
    openAIQuickChat(tripId) {
        const trip = this.trips.find(t => t.id === tripId) || {};

        // If an overlay exists, reuse
        let panel = document.getElementById('ai-quick-panel');
        if (panel) panel.remove();

        panel = document.createElement('div');
        panel.id = 'ai-quick-panel';
        panel.className = 'modal show';
        panel.innerHTML = `
            <div class="modal-overlay"></div>
            <div class="modal-content" style="max-width:600px;">
                <div class="modal-header">
                    <h3>Pack Assistant</h3>
                    <button class="modal-close" id="ai-quick-close"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div id="ai-quick-history" style="max-height:240px;overflow:auto;margin-bottom:8px;padding:8px;border-radius:6px;background:var(--surface);"></div>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <input id="ai-quick-input" class="form-control" placeholder="Tell me to add or remove items, or describe changes..." style="flex:1;" />
                        <button id="ai-voice-btn" type="button" class="btn btn--outline" title="Voice input"><i class="fas fa-microphone"></i></button>
                        <button id="ai-send-btn" type="button" class="btn btn--primary">Send</button>
                    </div>
                    <div style="margin-top:8px;color:var(--text-secondary);font-size:13px;">Examples: "Add sunscreen" • "Remove neck pillow" • "Regenerate list" • "Suggest items for beach trip" • "Why should I pack a rain jacket?"</div>
                </div>
            </div>
        `;

        document.body.appendChild(panel);
        document.getElementById('ai-quick-close').addEventListener('click', () => panel.remove());

        const historyEl = document.getElementById('ai-quick-history');
        const inputEl = document.getElementById('ai-quick-input');
        const sendBtn = document.getElementById('ai-send-btn');
        const voiceBtn = document.getElementById('ai-voice-btn');

        const appendHistory = (who, text) => {
            const p = document.createElement('div');
            p.style.margin = '6px 0';
            p.innerHTML = `<strong>${who}:</strong> ${text}`;
            historyEl.appendChild(p);
            historyEl.scrollTop = historyEl.scrollHeight;
        };

        sendBtn.addEventListener('click', async () => {
            const txt = inputEl.value && inputEl.value.trim();
            if (!txt) return;
            appendHistory('You', txt);
            inputEl.value = '';
            try {
                const res = await this.parseAndApplyChatCommand(txt, tripId);
                // res: { reply, actionPerformed, actionType, changes, packingList, errors }
                appendHistory('Assistant', res.reply || 'I updated the packing list.');
                // Always update the packing list and UI after any action
                if (res && res.packingList) {
                    this.currentPackingList[tripId] = res.packingList;
                    this.savePackingList();
                }
                // Force UI refresh regardless of actionPerformed status
                try {
                    this.updatePackingCategories();
                    this.updateTripProgress();
                } catch (e) { console.warn('UI refresh failed', e); }
            } catch (e) {
                console.error('Chat command failed', e);
                appendHistory('Assistant', 'Sorry, something went wrong while processing that.');
            }
        });

        // Voice recognition
        let recognition = null;
        let listening = false;
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
        if (SpeechRec) {
            recognition = new SpeechRec();
            recognition.lang = 'en-US';
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;

            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                inputEl.value = transcript;
            };
            recognition.onerror = (e) => {
                console.warn('Speech recognition error', e);
                appendHistory('Assistant', 'Voice recognition failed or was denied.');
            };
            recognition.onend = () => {
                listening = false;
                voiceBtn.classList.remove('listening');
            };
        } else {
            voiceBtn.disabled = true;
            voiceBtn.title = 'Voice not supported in this browser';
        }

        voiceBtn.addEventListener('click', () => {
            if (!recognition) return;
            if (!listening) {
                try {
                    recognition.start();
                    listening = true;
                    voiceBtn.classList.add('listening');
                } catch (e) {
                    console.warn('Recognition start failed', e);
                }
            } else {
                recognition.stop();
                listening = false;
                voiceBtn.classList.remove('listening');
            }
        });
    }

    // Parse a chat command and apply changes to the packing list
    async parseAndApplyChatCommand(text, tripId) {
        const t = (text || '').toString().trim();
        if (!t) return { reply: 'No input detected.', actionPerformed: false, actionType: null, changes: [], packingList: this.currentPackingList[tripId] || {}, errors: [] };

        // Ensure packing list is initialized for this trip
        if (!this.currentPackingList[tripId]) {
            this.currentPackingList[tripId] = {};
        }

        const snapshot = () => JSON.parse(JSON.stringify(this.currentPackingList[tripId] || {}));

        // Basic intent detection (explicit verbs)
        const lower = t.toLowerCase();

        // Support explicit function-like syntax: add(item1, item2) and remove(item1)
        const parenAddMatch = t.match(/^\s*add\s*\(\s*([^)]+)\s*\)\s*$/i);
        if (parenAddMatch) {
            const raw = parenAddMatch[1] || '';
            const items = raw.split(/,|;|\band\b/).map(s => s.trim()).filter(Boolean);
            if (items.length === 0) return { reply: 'No items to add.', actionPerformed: false, actionType: 'add_item', changes: [], packingList: this.currentPackingList[tripId] || {}, errors: ['No items provided'] };
            const forcedCategory = null;
            const result = await this.performAction('add_item', { items, category: forcedCategory }, tripId);
            this.aiInteractionHistory[tripId] = this.aiInteractionHistory[tripId] || { added: [], removed: [] };
            this.aiInteractionHistory[tripId].added.push(...items);
            try { this.savePackingList(); } catch (e) { }
            const suggestions = this.generateSuggestions ? this.generateSuggestions(tripId, items) : [];
            // Show success if items are in the local packing list, suppress DB errors
            let reply = `Added: ${items.join(', ')}`;
            if (suggestions && suggestions.length) reply += `\nYou might also consider: ${suggestions.join(', ')}`;
            return { reply, actionPerformed: true, actionType: 'add_item', changes: result.changes || [], packingList: this.currentPackingList[tripId] || {}, errors: [] };
        }

        const parenRemoveMatch = t.match(/^\s*remove\s*\(\s*([^)]+)\s*\)\s*$/i);
        if (parenRemoveMatch) {
            const raw = parenRemoveMatch[1] || '';
            const items = raw.split(/,|;|\band\b/).map(s => s.trim()).filter(Boolean);
            if (items.length === 0) return { reply: 'No items to remove.', actionPerformed: false, actionType: 'remove_item', changes: [], packingList: this.currentPackingList[tripId] || {}, errors: ['No items provided'] };
            const result = await this.performAction('remove_item', { targets: items }, tripId);
            this.aiInteractionHistory[tripId] = this.aiInteractionHistory[tripId] || { added: [], removed: [] };
            this.aiInteractionHistory[tripId].removed.push(...items);
            const suggestions = this.generateSuggestions ? this.generateSuggestions(tripId, items) : [];
            // Show success if remove completes, suppress DB errors
            let reply = `Removed: ${items.join(', ')}`;
            if (suggestions && suggestions.length) reply += `\nConsider packing: ${suggestions.join(', ')}`;
            try { this.savePackingList(); } catch (e) { }
            return { reply, actionPerformed: true, actionType: 'remove_item', changes: result.changes || [], packingList: this.currentPackingList[tripId] || {}, errors: [] };
        }

        // REMOVE - Handle both "remove" keyword and natural removal
        if (/\b(remove|delete|take out|drop)\b/.test(lower)) {
            const parts = t.split(/remove\s+|delete\s+|take out\s+|drop\s+/i);
            const items = (parts[1] || parts[0] || '').split(/,|;|\band\b/).map(s => s.trim()).filter(Boolean);
            if (items.length === 0) return { reply: 'Please specify what to remove.', actionPerformed: false, actionType: 'remove_item', changes: [], packingList: this.currentPackingList[tripId] || {}, errors: [] };
            try {
                const result = await this.performAction('remove_item', { targets: items }, tripId);
                // record history
                this.aiInteractionHistory[tripId] = this.aiInteractionHistory[tripId] || { added: [], removed: [] };
                this.aiInteractionHistory[tripId].removed.push(...items);
                // offer suggestions for replacements where sensible
                const suggestions = this.generateSuggestions(tripId, items || []);
                let reply = result.success ? `Removed: ${items.join(', ')}` : `Could not remove some items: ${result.errors.join('; ')}`;
                if (suggestions && suggestions.length) reply += `\nConsider packing: ${suggestions.join(', ')}`;
                try { this.savePackingList(); } catch (e) { }
                return { reply, actionPerformed: result.success, actionType: 'remove_item', changes: result.changes || [], packingList: snapshot(), errors: result.errors || [] };
            } catch (e) {
                console.error('Remove command error:', e);
                return { reply: `Error removing items: ${e.message}`, actionPerformed: false, actionType: 'remove_item', changes: [], packingList: this.currentPackingList[tripId] || {}, errors: [e.message] };
            }
        }

        // MOVE
        if (/\bmove\b/.test(lower) && /\bto\b/.test(lower)) {
            const m = t.match(/move\s+(.+)\s+to\s+(\w+)/i);
            if (m) {
                const item = m[1].trim();
                const target = m[2].trim().toLowerCase();
                const catMap = { documents: 'essentials', electronics: 'tech', misc: 'extras' };
                const targetCat = catMap[target] || target;
                const result = await this.performAction('move_item', { item, targetCategory: targetCat }, tripId);
                const reply = result.success ? `Moved ${item} to ${targetCat}.` : `Could not move ${item}: ${result.errors.join('; ')}`;
                return { reply, actionPerformed: result.success, actionType: 'move_item', changes: result.changes || [], packingList: snapshot(), errors: result.errors || [] };
            }
        }

        // ADD
        if (/\badd\b|\binclude\b|\bput\b/.test(lower)) {
            // try to capture optional category: "add sunscreen to essentials"
            const m = t.match(/(?:add|include|put)\s+(.+?)(?:\s+to\s+([a-zA-Z\s]+))?$/i);
            const itemsText = m ? (m[1] || '') : (t.split(/add\s+|include\s+|put\s+/i)[1] || '');
            const rawItems = (itemsText || '').split(/,|;|\band\b/).map(s => s.trim()).filter(Boolean);
            if (rawItems.length === 0) return { reply: 'Please specify what to add.', actionPerformed: false, actionType: 'add_item', changes: [], packingList: this.currentPackingList[tripId] || {}, errors: [] };
            let forcedCategory = null;
            if (m && m[2]) {
                const catRaw = m[2].trim().toLowerCase();
                const catMap = { documents: 'essentials', document: 'essentials', essentials: 'essentials', clothing: 'clothing', clothes: 'clothing', apparel: 'clothing', toiletries: 'toiletries', toiletries: 'toiletries', tech: 'tech', electronics: 'tech', health: 'health', extras: 'extras' };
                forcedCategory = catMap[catRaw] || catRaw.replace(/\s+/g, '_');
            }
            try {
                const result = await this.performAction('add_item', { items: rawItems, category: forcedCategory }, tripId);
                // record interaction history
                this.aiInteractionHistory[tripId] = this.aiInteractionHistory[tripId] || { added: [], removed: [] };
                this.aiInteractionHistory[tripId].added.push(...rawItems);
                // generate suggestions based on items added and trip context
                const suggestions = this.generateSuggestions(tripId, rawItems || []);
                let reply = result.success ? `Added: ${rawItems.join(', ')}` : `Failed to add items: ${result.errors.join('; ')}`;
                if (suggestions && suggestions.length) reply += `\nYou might also consider: ${suggestions.join(', ')}`;
                // persist packing list after local changes
                try { this.savePackingList(); } catch (e) { }
                // capture snapshot AFTER performAction updates currentPackingList
                const finalSnapshot = snapshot();
                return { reply, actionPerformed: result.success, actionType: 'add_item', changes: result.changes || [], packingList: finalSnapshot, errors: result.errors || [] };
            } catch (e) {
                console.error('Add command error:', e);
                return { reply: `Error adding items: ${e.message}`, actionPerformed: false, actionType: 'add_item', changes: [], packingList: this.currentPackingList[tripId] || {}, errors: [e.message] };
            }
        }

        // REPLACE
        if (/\breplace\b/.test(lower)) {
            const m = t.match(/replace\s+(.+)\s+with\s+(.+)/i);
            if (m) {
                const from = m[1].trim();
                const to = m[2].trim();
                const result = await this.performAction('replace_item', { from, to }, tripId);
                const reply = result.success ? `Replaced ${from} with ${to}.` : `Replace failed: ${result.errors.join('; ')}`;
                return { reply, actionPerformed: result.success, actionType: 'replace_item', changes: result.changes || [], packingList: snapshot(), errors: result.errors || [] };
            }
        }

        // TOGGLE
        if (/\b(check|uncheck|toggle|mark)\b/.test(lower)) {
            const m = t.match(/(?:check|uncheck|toggle|mark)\s+(.+)/i);
            if (m) {
                const item = m[1].trim();
                const result = await this.performAction('toggle_check', { item }, tripId);
                const reply = result.success ? `Toggled ${item}.` : `Toggle failed: ${result.errors.join('; ')}`;
                return { reply, actionPerformed: result.success, actionType: 'toggle_check', changes: result.changes || [], packingList: snapshot(), errors: result.errors || [] };
            }
        }

        // REGENERATE / IMPROVE
        if (/\b(improve this list|revise the packing list|optimize this list|regenerate it|regenerate|revise|optimize|improve|refresh packing list|generate another list)\b/.test(lower)) {
            // Check if user wants to regenerate incorporating previously suggested items
            const wantsSuggested = /\b(suggest|those|with those|with the suggest|suggested items|the suggest)\b/.test(lower);
            const lastSuggested = (this.aiInteractionHistory[tripId] || {}).lastSuggested || [];

            if (wantsSuggested && lastSuggested.length > 0) {
                // Step 1: Add the suggested items to the packing list first
                await this.performAction('add_item', { items: lastSuggested }, tripId);
                // Step 2: Regenerate with a hint that tells OpenAI to keep/build around these items
                const hintWithItems = `${t}. Please keep and build around these items that were just added: ${lastSuggested.join(', ')}.`;
                const result = await this.performAction('regenerate_list', { hint: hintWithItems }, tripId);
                const reply = result.success
                    ? `Added the suggested items and regenerated your list around them:\n• ${lastSuggested.join('\n• ')}`
                    : `Added the suggested items but regeneration had an issue: ${result.errors.join('; ')}`;
                return { reply, actionPerformed: true, actionType: 'regenerate_list', changes: result.changes || [], packingList: snapshot(), errors: result.errors || [] };
            }

            // Normal regenerate
            const result = await this.performAction('regenerate_list', { hint: t }, tripId);
            const reply = result.success ? 'Regenerated your packing list with fresh AI suggestions!' : `Regeneration failed: ${result.errors.join('; ')}`;
            return { reply, actionPerformed: result.success, actionType: 'regenerate_list', changes: result.changes || [], packingList: snapshot(), errors: result.errors || [] };
        }

        // CONTEXT CHANGES (weather / trip type / transport / duration)
        if (/\b(weather|business|beach|adventure|honeymoon|train|car|bus|flight|days?|weeks?)\b/.test(lower)) {
            let updated = false; const trip = this.trips.find(x => x.id === tripId);
            if (trip) {
                const wMatch = t.match(/weather\s+(?:is\s+)?(\w+)/i);
                if (wMatch) { trip.weather = trip.weather || {}; trip.weather.condition = wMatch[1]; updated = true; }
                const pMatch = t.match(/(?:make it for|change to)\s+(?:a\s+)?([\w\s]+)/i);
                if (pMatch && /business|beach|adventure|honeymoon|family|religious|work|conference/.test(pMatch[1].toLowerCase())) { trip.purpose = pMatch[1].trim(); updated = true; }
                const trMatch = t.match(/(?:by|via|on)\s+(car|train|bus|flight|plane|air|taxi|ferry)/i);
                if (trMatch) { trip.transport = trMatch[1].charAt(0).toUpperCase() + trMatch[1].slice(1); updated = true; }
                const dMatch = t.match(/(\d+)\s*(day|days|week|weeks)/i);
                if (dMatch) { const days = parseInt(dMatch[1], 10); if (!isNaN(days)) { trip.duration = days; updated = true; } }
                if (updated) {
                    const result = await this.performAction('regenerate_list', { hint: t }, tripId);
                    const reply = result.success ? 'Updated trip context and adjusted the packing list accordingly.' : `Failed to update context: ${result.errors.join('; ')}`;
                    return { reply, actionPerformed: result.success, actionType: 'update_context', changes: result.changes || [], packingList: snapshot(), errors: result.errors || [] };
                }
            }
        }

        // SUGGEST / RECOMMEND (for packing items only)
        // Skip if it's about snacks, food, places, or restaurants (those use intelligent response)
        if (/\b(suggest|what else|anything else|recommend|recommendations?)\b/.test(lower) &&
            !/\b(snack|food|meal|eat|drink|place|explore|destination|restaurant|cafe|activity|adventure|attraction|thing|do|see)\b/.test(lower)) {
            const tripObj = this.trips.find(x => x.id === tripId) || {};
            const aiCtx = tripObj.aiContext || {};
            const currentItems = [];
            const curList = this.currentPackingList[tripId] || {};
            Object.values(curList).forEach(cat => { if (Array.isArray(cat)) cat.forEach(i => currentItems.push(i.name || i.item || '')); });

            try {
                const suggestPrompt = `You are a smart travel packing assistant. The user is asking for packing suggestions.\n\nUser's request: "${t}"\n\nTrip context:\n- Destination: ${tripObj.destination || 'Unknown'}\n- Duration: ${tripObj.duration || 'Unknown'} days\n- Trip type: ${aiCtx.vibe || tripObj.purpose || 'General travel'}\n- Weather: ${aiCtx.weather || 'Unknown'}\n- Activities: ${aiCtx.activities || 'Unknown'}\n- Accommodation: ${aiCtx.accommodation || 'Unknown'}\n- Packing style: ${aiCtx.pref_packing || 'Unknown'}\n- Already packing: ${currentItems.slice(0, 15).join(', ') || '(nothing yet)'}\n\nSuggest 6-10 specific, practical packing items that are NOT already in the list. Be creative and tailored to the trip context. Return a brief conversational response listing the items with a short reason for each.`;

                const suggestMessages = [
                    { role: 'system', content: 'You are a smart travel packing assistant. You help users create and improve packing lists based on their trip details such as destination, duration, weather, activities, accommodation type, and preferences. You can regenerate packing lists, suggest travel items, and answer packing-related questions.' },
                    { role: 'user', content: suggestPrompt }
                ];

                const suggestResult = await callLLMViaSupabase(suggestMessages);
                let reply = '';
                if (suggestResult && suggestResult.choices && suggestResult.choices[0] && suggestResult.choices[0].message) {
                    reply = suggestResult.choices[0].message.content || '';
                } else if (typeof suggestResult === 'string') { reply = suggestResult; }
                else if (suggestResult && suggestResult.reply) { reply = suggestResult.reply; }

                if (reply) {
                    return { reply, actionPerformed: false, actionType: 'suggest', changes: [], packingList: snapshot(), errors: [] };
                }
            } catch (suggestErr) {
                console.warn('[PackAssistant] AI suggestion failed, using local fallback:', suggestErr);
            }

            // Smart static fallback — detect what the user is asking about from the query itself
            const qt = lower; // the full user query text
            let staticSuggestions = [];

            if (/beach|swim|ocean|coast|snorkel|surf|beaching|seaside/.test(qt)) {
                staticSuggestions = ['Sunscreen SPF50+', 'Swimwear', 'Beach towel', 'Flip flops', 'Waterproof phone case', 'Sunglasses', 'After-sun lotion', 'Reusable water bottle', 'Rash guard', 'Snorkel mask', 'Wet bag for swimwear'];
            } else if (/hik|trek|mountain|camp|outdoor|trail|backpack/.test(qt)) {
                staticSuggestions = ['Hiking boots', 'Trekking poles', 'Hydration bladder', 'Trail snacks', 'First aid kit', 'Rain jacket', 'Headlamp', 'Quick-dry socks', 'Blister plasters', 'Compass / offline maps'];
            } else if (/gadget|tech|electronic|device|camera/.test(qt)) {
                staticSuggestions = ['Power bank (20000mAh)', 'Universal travel adapter', 'Noise-cancelling headphones', 'E-reader / tablet', 'GoPro / action camera', 'Laptop stand', 'Cable organiser pouch', 'Wireless earbuds', 'Portable WiFi hotspot'];
            } else if (/fashion|cloth|outfit|wear|style|trendy|look/.test(qt)) {
                staticSuggestions = ['Versatile neutral tops', 'Lightweight packable scarf', 'Comfortable walking shoes', 'Wrinkle-resistant dress', 'Packable jacket', 'Statement belt', 'Sun hat', 'Crossbody bag', 'Travel-friendly iron'];
            } else if (/essential|basic|must|important|necessit/.test(qt)) {
                staticSuggestions = ['Passport / travel documents', 'Travel insurance card', 'Portable charger', 'First aid kit', 'Reusable water bottle', 'Hand sanitizer', 'Earplugs', 'Eye mask', 'Locks for luggage'];
            } else if (/night|party|nightlife|club|bar/.test(qt)) {
                staticSuggestions = ['Smart casual outfit', 'Heels / dress shoes', 'Small evening bag', 'Portable mirror', 'Breath mints', 'Phone stand for selfies', 'Light jacket for late nights'];
            } else if (/cold|winter|snow|ski|freez/.test(qt)) {
                staticSuggestions = ['Thermal base layers', 'Insulated jacket', 'Wool hat & gloves', 'Warm socks (merino)', 'Hand warmers', 'Lip balm', 'Heavy moisturiser', 'Snow boots', 'Ski goggles'];
            } else {
                // Generic trip-context fallback
                const history = this.aiInteractionHistory[tripId] || { added: [], removed: [] };
                const seeds = history.added.length ? history.added.slice(-4) : [];
                if (tripObj.purpose) seeds.push(tripObj.purpose);
                if (tripObj.destination) seeds.push(tripObj.destination);
                const fallback = this.generateSuggestions(tripId, seeds);
                staticSuggestions = fallback.length ? fallback : ['Reusable water bottle', 'Power bank', 'First aid kit', 'Travel lock', 'Packing cubes', 'Laundry bag'];
            }

            // Filter out items already in the list
            const filtered = staticSuggestions.filter(s => !this.isItemInPackingList(tripId, s));

            // Save these suggestions so regeneration can incorporate them
            this.aiInteractionHistory[tripId] = this.aiInteractionHistory[tripId] || { added: [], removed: [] };
            this.aiInteractionHistory[tripId].lastSuggested = filtered;

            if (filtered.length === 0) {
                return { reply: 'Everything I was going to suggest is already in your list! Try asking about specific categories like "suggest beach items" or "suggest gadgets".', actionPerformed: false, actionType: 'suggest', changes: [], packingList: snapshot(), errors: [] };
            }

            // Build HTML response with buttons
            let reply = `<p style="margin-bottom:10px;">Here are some items I'd suggest:</p>`;
            reply += `<div style="display:flex; flex-wrap:wrap; gap:8px;">`;
            filtered.forEach(item => {
                reply += `
                    <div style="background:var(--surface-alt); padding:6px 10px; border-radius:18px; display:flex; align-items:center; gap:8px; border:1px solid var(--border);">
                        <span>${item}</span>
                        <button onclick="window.app.addSuggestedItem('${item.replace(/'/g, "\\'")}', '${tripId}')" 
                                style="background:var(--primary); color:white; border:none; border-radius:12px; padding:2px 8px; font-size:11px; cursor:pointer; font-weight:600;">
                                Add
                        </button>
                    </div>`;
            });
            reply += `</div>`;
            reply += `<p style="margin-top:12px; font-size:0.9em; color:var(--text-secondary);">Or say "regenerate list with suggested items" to build your whole list around these!</p>`;

            return { reply, actionPerformed: false, actionType: 'suggest', changes: [], packingList: snapshot(), errors: [] };
        }

        // BEACH TRIP PACKING - Match beach-specific queries
        if (/\b(beach|ocean|seaside)\b/.test(lower) || /what.*(pack|bring|pack|wear).*beach/.test(lower)) {
            // Show beach packing suggestions modal
            try {
                await this.showBeachPackingSuggestions(tripId);
                const reply = 'Here are the beach packing essentials! Click items to add them to your list, or use "add(item1, item2)" to add specific items.';
                return { reply, actionPerformed: false, actionType: 'beach_suggestions', changes: [], packingList: snapshot(), errors: [] };
            } catch (e) {
                console.error('Beach suggestions failed:', e);
                // Fallback to direct suggestion list
                const beachItems = [
                    'Sunscreen', 'Swimwear', 'Beach Towel', 'Flip Flops', 'Hat', 'Sunglasses',
                    'Waterproof Bag', 'Light Shirt', 'Shorts', 'After-Sun Lotion', 'Lip Balm with SPF'
                ];
                const reply = `For a beach trip, consider packing: ${beachItems.join(', ')}. Use "add(item)" to add any of these.`;
                return { reply, actionPerformed: false, actionType: 'beach_suggestions', changes: [], packingList: snapshot(), errors: [] };
            }
        }

        // Default - Check if it's a query/request or an item to add
        const isQuery = this.isQueryRequest(t);

        if (isQuery) {
            // Handle as intelligent query/request
            try {
                // Log what's happening for debugging
                if (OPENAI_API_KEY) {
                    console.log('✅ Using OpenAI API for response');
                } else if (HUGGINGFACE_API_KEY) {
                    console.log('✅ Using HuggingFace API for response');
                } else if (GOOGLE_API_KEY) {
                    console.log('✅ Using Google API for response');
                } else {
                    console.log('⚠️ No API key configured - using built-in responses');
                    console.log('💡 To enable AI chatbot, add an API key at the top of app.js');
                }

                const reply = await this.getIntelligentResponse(t, tripId);
                return { reply, actionPerformed: false, actionType: 'query', changes: [], packingList: snapshot(), errors: [] };
            } catch (e) {
                console.error('Intelligent response failed:', e);
                console.log('📝 Falling back to built-in responses');
                return { reply: 'I can help with that! Try asking about specific items or telling me about your trip.', actionPerformed: false, actionType: 'query', changes: [], packingList: snapshot(), errors: [] };
            }
        }

        // Try to add items only if it looks like item names
        const fallbackItems = t.split(/,|;|\band\b/).map(s => s.trim()).filter(Boolean);
        // Only treat as items if they look like potential items (not common words)
        const commonWords = new Set(['how', 'what', 'when', 'where', 'why', 'is', 'are', 'the', 'a', 'an', 'or', 'and', 'can', 'i', 'you', 'me', 'long', 'trip', 'duration', 'for', 'on', 'in', 'at', 'by', 'with', 'as', 'from', 'to', 'my', 'this', 'that', 'be', 'have', 'do', 'should', 'would', 'could', 'will', 'if', 'about', 'snack', 'food', 'suggest']);
        const potentialItems = fallbackItems.filter(item => !commonWords.has(item.toLowerCase()));

        if (potentialItems.length > 0) {
            const result = await this.performAction('add_item', { items: potentialItems }, tripId);
            const reply = result.success ? `Added: ${potentialItems.join(', ')}` : `Failed to add: ${result.errors.join('; ')}`;
            return { reply, actionPerformed: result.success, actionType: 'add_item', changes: result.changes || [], packingList: snapshot(), errors: result.errors || [] };
        }

        return { reply: "I couldn't understand that command. Try:\n• 'add sunscreen' to add items\n• 'remove neck pillow' to remove items\n• 'what can i pack for beach' for suggestions\n• 'suggest snacks' for food recommendations\n• 'regenerate the list' to optimize your packing list", actionPerformed: false, actionType: null, changes: [], packingList: snapshot(), errors: [] };
    }

    _addItemToBestCategory(tripId, itemName) {
        if (!itemName) return null;
        const list = this.currentPackingList[tripId];
        if (!list) return null;
        // naive categorization based on keywords
        const name = itemName.toString().trim();
        const lower = name.toLowerCase();
        let cat = 'extras';
        if (/shirt|pants|dress|shoe|jacket|socks|underwear|swim|beach|flip/.test(lower)) cat = 'clothing';
        else if (/tooth|shampoo|sunscreen|moisturizer|makeup|skincare|soap|razor|deodorant|medic/.test(lower)) cat = 'toiletries';
        else if (/phone|charger|laptop|camera|adapter|tripod|power bank|usb/.test(lower)) cat = 'tech';
        else if (/first aid|medicine|vaccine|thermometer|band-aid|band aid|prescription|allergy/.test(lower)) cat = 'health';

        const entry = { name, checked: false, addedAt: new Date().toISOString(), custom: true };
        list[cat].push(entry);
        return { cat, name };
    }

    _removeItemByName(tripId, itemName) {
        if (!itemName) return false;
        const list = this.currentPackingList[tripId];
        if (!list) return false;
        const lower = itemName.toLowerCase();
        let removed = false;
        Object.keys(list).forEach(cat => {
            const initialLen = list[cat].length;
            list[cat] = list[cat].filter(it => it.name.toLowerCase() !== lower);
            if (list[cat].length < initialLen) removed = true;
        });
        return removed;
    }

    // Helper for "Add" buttons in chat suggestions
    addSuggestedItem(itemName, tripId) {
        if (!itemName || !tripId) return;
        const result = this._addItemToBestCategory(tripId, itemName);
        if (result) {
            this.savePackingList();
            this.updatePackingCategories();
            this.updateTripProgress();
            this.showToast(`Added "${itemName}" to ${result.cat}`, 'success');
        }
    }

    _moveItemToCategory(tripId, itemName, targetCat) {
        if (!itemName || !targetCat) return false;
        const list = this.currentPackingList[tripId];
        if (!list) return false;
        // normalize category name
        const catKeys = Object.keys(list);
        const target = catKeys.includes(targetCat) ? targetCat : (targetCat === 'documents' ? 'essentials' : (targetCat === 'electronics' ? 'tech' : 'extras'));
        let moved = false;
        Object.keys(list).forEach(cat => {
            const remaining = [];
            list[cat].forEach(i => {
                if (!moved && i.name && i.name.toLowerCase().includes(itemName.toLowerCase())) {
                    // move this item
                    if (!list[target]) list[target] = [];
                    list[target].push(i);
                    moved = true;
                } else {
                    remaining.push(i);
                }
            });
            list[cat] = remaining;
        });
        return moved;
    }

    // Normalize text: lowercase, trim, remove punctuation, collapse whitespace, expand common synonyms
    normalizeText(text) {
        if (!text) return '';
        let s = text.toString().toLowerCase().trim();
        // remove punctuation
        s = s.replace(/["'“”‘’.,/#!$%^&*;:{}=()+\[\]<>?@\\|~`:-]/g, ' ');
        // collapse whitespace
        s = s.replace(/\s+/g, ' ').trim();
        // remove polite words and leading articles
        s = s.replace(/\b(please|pls|thanks|thank you|the|a|an)\b/g, '');
        s = s.replace(/\s+/g, ' ').trim();
        // expand common synonyms
        const syn = {
            'coat': 'jacket',
            'hoodie': 'jacket',
            'powerbank': 'power bank',
            'charger cable': 'charger',
            'passport card': 'passport'
        };
        // common misspellings / casual shorthand
        const fixes = {
            'repellant': 'repellent',
            'repelant': 'repellent',
            'mosquito repellant': 'mosquito repellent',
            'mosquito repellent': 'mosquito repellent',
            '\blap\b': 'laptop'
        };
        Object.keys(syn).forEach(k => {
            s = s.replace(new RegExp('\\b' + k + '\\b', 'g'), syn[k]);
        });
        Object.keys(fixes).forEach(k => {
            s = s.replace(new RegExp(k, 'g'), fixes[k]);
        });
        return s;
    }

    // Simple canonicalization using small dictionary; fallback returns normalized text
    canonicalizeItem(text) {
        const n = this.normalizeText(text || '');
        const dict = {
            'passport': { canonical: 'passport', category: 'essentials', keywords: ['passport'] },
            'visa': { canonical: 'visa', category: 'essentials', keywords: ['visa'] },
            'sunscreen': { canonical: 'sunscreen', category: 'toiletries', keywords: ['sunscreen', 'sun screen'] },
            'swimwear': { canonical: 'swimwear', category: 'clothing', keywords: ['swimwear', 'swimsuit'] },
            'laptop': { canonical: 'laptop', category: 'tech', keywords: ['laptop', 'notebook', 'macbook'] },
            'phone charger': { canonical: 'phone charger', category: 'tech', keywords: ['phone charger', 'charger'] },
            'power bank': { canonical: 'power bank', category: 'tech', keywords: ['power bank', 'powerbank'] },
            'toothbrush': { canonical: 'toothbrush', category: 'toiletries', keywords: ['toothbrush'] },
            'first aid kit': { canonical: 'first aid kit', category: 'health', keywords: ['first aid', 'first-aid'] }
            ,
            'mosquito repellent': { canonical: 'mosquito repellent', category: 'toiletries', keywords: ['mosquito repellent', 'mosquito repellant', 'repellent'] },
            'mosquito nets': { canonical: 'mosquito net', category: 'essentials', keywords: ['mosquito net', 'mosquito nets'] }
        };
        if (dict[n]) return dict[n];
        // try partial match
        for (const k in dict) {
            if (n.includes(k)) return dict[k];
        }
        // fallback
        return { canonical: n, category: (n.includes('passport') || n.includes('visa') ? 'essentials' : (n.includes('charger') || n.includes('laptop') ? 'tech' : 'extras')), keywords: [n] };
    }

    // Check if an item (by name) already exists in the packing list for a trip
    isItemInPackingList(tripId, name) {
        if (!tripId || !name) return false;
        const list = this.currentPackingList[tripId] || {};
        const norm = this.normalizeText(name);
        for (const cat of Object.keys(list)) {
            for (const it of list[cat]) {
                const iname = this.normalizeText(it.name || it.item || '');
                if (iname && (iname === norm || iname.includes(norm) || norm.includes(iname))) return true;
            }
        }
        return false;
    }

    // Generate complementary suggestions based on seed items and trip context
    generateSuggestions(tripId, seeds) {
        const suggestions = new Set();
        seeds = Array.isArray(seeds) ? seeds : (seeds ? [seeds] : []);
        const trip = this.trips.find(t => t.id === tripId) || {};

        // Seed-based suggestions
        for (const s of seeds) {
            const c = this.canonicalizeItem(s || '');
            const key = (c && c.canonical) ? c.canonical.toLowerCase() : this.normalizeText(s || '');
            // exact map
            if (this.suggestionMap[key]) {
                this.suggestionMap[key].forEach(x => suggestions.add(x));
            }
            // try partial matches in map keys
            Object.keys(this.suggestionMap).forEach(k => {
                if (key.includes(k) || k.includes(key)) this.suggestionMap[k].forEach(x => suggestions.add(x));
            });
        }

        // Contextual suggestions from trip metadata
        const dest = (trip.destination || '').toLowerCase();
        const weather = ((trip.weather && (trip.weather.condition || trip.weather.main)) || '').toLowerCase();
        const duration = parseInt(trip.duration || 0, 10) || 0;
        if (dest.includes('beach') || /beach|coast|island/.test(dest) || /beach|sunny|hot/.test(weather)) {
            ['beach towel', 'waterproof bag', 'sandals'].forEach(x => suggestions.add(x));
        }
        if (/snow|cold|ski|mountain/.test(dest) || /snow|cold|freezing/.test(weather)) {
            ['thermal layers', 'gloves', 'warm hat', 'insulated jacket'].forEach(x => suggestions.add(x));
        }
        if (duration >= 7) {
            ['extra socks', 'extra underwear', 'laundry bag'].forEach(x => suggestions.add(x));
        }

        // Remove anything already present in the packing list
        const out = Array.from(suggestions).filter(s => !this.isItemInPackingList(tripId, s));
        return out.slice(0, 6);
    }

    // Fetch beach packing suggestions from an API or use predefined list
    async getBeachPackingSuggestions(tripId) {
        // Predefined beach packing essentials
        const beachDefaults = {
            essentials: [
                "Passport",
                "Travel Insurance",
                "Hotel Confirmations",
                "Emergency Contacts",
                "Wallet",
                "Credit/Debit Cards",
                "Phone",
                "Charger"
            ],
            clothing: [
                "Swimwear/Bikini",
                "Beach Cover-up",
                "T-shirts/Tank tops",
                "Shorts",
                "Light Dress",
                "Flip Flops/Sandals",
                "Comfortable Shoes",
                "Light Jacket/Cardigan",
                "Hat/Visor",
                "Sunglasses"
            ],
            toiletries: [
                "Sunscreen (SPF 30+)",
                "After-Sun Lotion",
                "Lip Balm with SPF",
                "Moisturizer",
                "Aloe Vera Gel",
                "Toothbrush",
                "Toothpaste",
                "Deodorant",
                "Body Wash",
                "Hair Conditioner",
                "Waterproof Makeup",
                "Insect Repellent"
            ],
            tech: [
                "Waterproof Phone Case",
                "Camera/GoPro",
                "Power Bank",
                "Portable Speaker",
                "Headphones",
                "USB Cables",
                "Travel Adapter"
            ],
            health: [
                "First Aid Kit",
                "Pain Relievers",
                "Allergy Medicine",
                "Anti-diarrheal Medication",
                "Prescription Medications",
                "Thermometer",
                "Band-aids",
                "Antiseptic Wipes"
            ],
            beach_gear: [
                "Beach Towel",
                "Waterproof Bag",
                "Snorkel Mask",
                "Waterproof Watch",
                "Beach Tote Bag",
                "Picnic Blanket",
                "Rash Guard"
            ]
        };

        // Try to fetch from API if configured
        if (TRAVEL_API_URL && TRAVEL_API_KEY) {
            try {
                const response = await fetch(`${TRAVEL_API_URL}/packing-suggestions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${TRAVEL_API_KEY}`
                    },
                    body: JSON.stringify({
                        tripType: 'beach',
                        destination: this.trips.find(t => t.id === tripId)?.destination || '',
                        duration: this.trips.find(t => t.id === tripId)?.duration || 1
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.suggestions && typeof data.suggestions === 'object') {
                        return { ...beachDefaults, ...data.suggestions };
                    }
                }
            } catch (e) {
                console.warn('Beach suggestions API call failed, using defaults:', e.message);
            }
        }

        // Return predefined suggestions
        return beachDefaults;
    }

    // Display beach packing suggestions modal
    async showBeachPackingSuggestions(tripId) {
        const currentList = this.currentPackingList[tripId] || {};
        const suggestions = await this.getBeachPackingSuggestions(tripId);

        // Remove existing modal if any
        const existing = document.getElementById('beach-suggestions-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'beach-suggestions-modal';
        modal.className = 'modal show';
        modal.innerHTML = `
            <div class="modal-overlay"></div>
            <div class="modal-content" style="max-width:700px; max-height:85vh; overflow-y:auto;">
                <div class="modal-header">
                    <h3>🏖️ Beach Trip Packing Suggestions</h3>
                    <button class="modal-close" id="beach-modal-close"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div style="margin-bottom:16px; padding:12px; background:var(--surface); border-radius:6px; border-left:4px solid #0EA5E9;">
                        <p style="margin:0; color:var(--text-secondary); font-size:13px;">
                            <strong>Tip:</strong> Click items below to add them to your packing list, or use the chat to add/remove items in bulk.
                        </p>
                    </div>
                    
                    <div id="beach-current-items" style="margin-bottom:20px;">
                        <h4 style="margin-top:0;">Current Packing List</h4>
                        <div id="beach-items-list" style="padding:8px; background:var(--surface); border-radius:6px; min-height:60px;">
                            Loading...
                        </div>
                    </div>

                    <div id="beach-categories-container"></div>

                    <div style="margin-top:16px; display:flex; gap:8px;">
                        <button class="btn btn--primary" id="beach-add-all-btn">Add All Suggestion</button>
                        <button class="btn btn--outline" id="beach-modal-close-btn">Done</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close button handlers
        const closeBtn = document.getElementById('beach-modal-close');
        const closeBtnBottom = document.getElementById('beach-modal-close-btn');
        const overlay = modal.querySelector('.modal-overlay');

        const closeModal = () => modal.remove();
        closeBtn.addEventListener('click', closeModal);
        closeBtnBottom.addEventListener('click', closeModal);
        overlay.addEventListener('click', closeModal);

        // Display current items
        const currentItemsList = document.getElementById('beach-items-list');
        const allCurrentItems = [];
        Object.values(currentList).forEach(cat => {
            if (Array.isArray(cat)) {
                cat.forEach(item => {
                    allCurrentItems.push(item.name || item.item || item);
                });
            }
        });

        if (allCurrentItems.length === 0) {
            currentItemsList.innerHTML = '<p style="color:var(--text-secondary); margin:8px 0;">Your packing list is empty. Add items from the suggestions below!</p>';
        } else {
            currentItemsList.innerHTML = '<div style="display:flex; flex-wrap:wrap; gap:6px;">' +
                allCurrentItems.map(item =>
                    `<span style="background:#0EA5E9; color:white; padding:4px 12px; border-radius:16px; font-size:13px;">${item}</span>`
                ).join('') +
                '</div>';
        }

        // Render categories with suggestions
        const container = document.getElementById('beach-categories-container');
        const itemsToAdd = new Set();

        Object.entries(suggestions).forEach(([category, items]) => {
            const categoryDiv = document.createElement('div');
            categoryDiv.style.marginBottom = '16px';

            const categoryTitle = document.createElement('h4');
            categoryTitle.style.marginBottom = '8px';
            categoryTitle.textContent = category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ');
            categoryDiv.appendChild(categoryTitle);

            const itemsDiv = document.createElement('div');
            itemsDiv.style.display = 'flex';
            itemsDiv.style.flexWrap = 'wrap';
            itemsDiv.style.gap = '6px';

            items.forEach(item => {
                const itemBtn = document.createElement('button');
                itemBtn.type = 'button';
                itemBtn.className = 'btn btn--outline';
                itemBtn.style.fontSize = '13px';
                itemBtn.style.padding = '6px 12px';
                itemBtn.textContent = item;

                // Check if item already in list
                const isInList = allCurrentItems.some(existing =>
                    this.normalizeText(existing) === this.normalizeText(item)
                );

                if (isInList) {
                    itemBtn.disabled = true;
                    itemBtn.style.opacity = '0.5';
                    itemBtn.title = 'Already in your packing list';
                } else {
                    itemBtn.addEventListener('click', () => {
                        if (itemsToAdd.has(item)) {
                            itemsToAdd.delete(item);
                            itemBtn.classList.remove('btn--primary');
                            itemBtn.classList.add('btn--outline');
                        } else {
                            itemsToAdd.add(item);
                            itemBtn.classList.remove('btn--outline');
                            itemBtn.classList.add('btn--primary');
                        }
                    });
                }

                itemsDiv.appendChild(itemBtn);
            });

            categoryDiv.appendChild(itemsDiv);
            container.appendChild(categoryDiv);
        });

        // Add all button
        const addAllBtn = document.getElementById('beach-add-all-btn');
        addAllBtn.addEventListener('click', async () => {
            const allItems = [];
            Object.values(suggestions).forEach(items => {
                items.forEach(item => {
                    if (!allCurrentItems.some(existing =>
                        this.normalizeText(existing) === this.normalizeText(item)
                    )) {
                        allItems.push(item);
                    }
                });
            });

            if (allItems.length === 0) {
                alert('All suggestions are already in your packing list!');
                return;
            }

            // Add items via performAction
            const result = await this.performAction('add_item', { items: allItems }, tripId);
            modal.remove();

            // Update UI
            try {
                this.updatePackingCategories();
                this.updateTripProgress();
            } catch (e) {
                console.warn('UI update failed after adding all suggestions', e);
            }
        });
    }

    // Check if a query is a question or request (not an action like add/remove)
    isQueryRequest(text) {
        const lower = (text || '').toLowerCase();
        const actionWords = /\b(add|remove|delete|include|put|take out|drop|replace|check|toggle|mark|move)\b/;
        const questionWords = /\b(how|what|when|where|why|can|could|should|would|do|did|does|is|are|suggest|recommend|snack|food|meal|eat|drink|need|want|help|advice)\b/;

        // If has action words, it's not just a query request
        if (actionWords.test(lower)) return false;
        // If has question/request words, it's a query
        return questionWords.test(lower);
    }

    // Get intelligent response from LLM API or built-in handler
    async getIntelligentResponse(text, tripId) {
        const trip = this.trips.find(t => t.id === tripId) || {};
        const currentListItems = this.currentPackingList[tripId] || {};

        // Primary: use Supabase proxy (retrieves OpenAI key from Supabase secrets)
        try {
            console.log('🔄 Calling LLM via Supabase proxy...');
            return await this.callLLMAPI(text, trip, currentListItems);
        } catch (proxyErr) {
            console.warn('⚠️ Supabase proxy failed:', proxyErr.message);
        }

        // Secondary: direct API keys if configured
        if (OPENAI_API_KEY || HUGGINGFACE_API_KEY || GOOGLE_API_KEY) {
            try {
                console.log('🔄 Calling direct LLM API...');
                return await this.callLLMAPI(text, trip, currentListItems, true);
            } catch (e) {
                console.warn('⚠️ Direct LLM API failed:', e.message);
            }
        }

        // Fallback to built-in responses
        console.log('📼 Using built-in responses');
        return await this.getBuiltInResponse(text, tripId, trip);
    }

    // Call LLM API for intelligent responses (supports Supabase proxy + direct providers)
    async callLLMAPI(text, trip, currentList, directOnly = false) {
        const currentItems = [];
        Object.values(currentList).forEach(cat => {
            if (Array.isArray(cat)) {
                cat.forEach(item => currentItems.push(item.name || item.item || item));
            }
        });

        // Gather extended trip context from aiContext if available
        const aiCtx = trip.aiContext || {};

        const systemPrompt = `You are a smart travel packing assistant.
You help users create and improve packing lists based on their trip details such as destination, duration, weather, activities, accommodation type, and preferences.
You can regenerate packing lists, suggest travel items, and answer packing-related questions.

TRIP DETAILS:
- Destination: ${trip.destination || 'Unknown location'}
- Duration: ${trip.duration || 'Unknown'} days
- Trip Type / Vibe: ${aiCtx.vibe || trip.purpose || 'General travel'}
- Expected Weather: ${aiCtx.weather || 'Unknown'}
- Activities: ${aiCtx.activities || 'General sightseeing'}
- Accommodation: ${aiCtx.accommodation || 'Unknown'}
- Transport: ${aiCtx.transport_type || trip.transport || 'Unknown'}
- Packing Style: ${aiCtx.pref_packing || 'Balanced'}
- Laundry Available: ${aiCtx.laundry || 'Unknown'}
- Special Needs: ${aiCtx.special || 'None'}
- Current packing list: ${currentItems.length > 0 ? currentItems.join(', ') : '(empty)'}

Be specific, practical, and helpful. Keep responses concise (under 200 words) and relevant to the trip context.`;

        try {
            console.log('🤖 Calling LLM API with text:', text);

            // Use Supabase proxy first (unless directOnly mode)
            if (!directOnly) {
                try {
                    const messages = [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: text }
                    ];
                    const result = await callLLMViaSupabase(messages);
                    let reply = '';
                    if (result && result.choices && result.choices[0] && result.choices[0].message) {
                        reply = result.choices[0].message.content || '';
                    } else if (typeof result === 'string') { reply = result; }
                    else if (result && result.reply) { reply = result.reply; }
                    if (reply) { console.log('✅ Got response via Supabase proxy'); return reply; }
                } catch (proxyErr) {
                    console.warn('⚠️ Supabase proxy call failed, trying direct API:', proxyErr.message);
                }
            }

            // Direct API fallback
            if (OPENAI_API_KEY) {
                console.log('📡 Using OpenAI API directly...');
                return await this.callOpenAIAPI(text, systemPrompt);
            } else if (HUGGINGFACE_API_KEY) {
                console.log('📡 Using HuggingFace API...');
                return await this.callHuggingFaceAPI(text, systemPrompt);
            } else if (GOOGLE_API_KEY) {
                console.log('📡 Using Google API...');
                return await this.callGoogleAPI(text, systemPrompt);
            } else {
                console.warn('⚠️ No direct LLM API key configured.');
                throw new Error('No LLM API configured');
            }
        } catch (e) {
            console.error('❌ LLM API call failed:', e);
            throw e;
        }
    }

    // Call OpenAI API (GPT-3.5-turbo or GPT-4)
    async callOpenAIAPI(userText, systemPrompt) {
        if (!OPENAI_API_KEY) {
            throw new Error('OpenAI API key not configured. Please add your key to app.js line 56');
        }

        try {
            console.log('📞 Calling OpenAI API with model:', OPENAI_MODEL);
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: OPENAI_MODEL,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userText }
                    ],
                    max_tokens: 500,
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenAI error ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            if (data.choices && data.choices[0] && data.choices[0].message) {
                const reply = data.choices[0].message.content.trim();
                console.log('✅ Got OpenAI response');
                return reply;
            }
            throw new Error('Invalid OpenAI response format: ' + JSON.stringify(data));
        } catch (e) {
            console.error('❌ OpenAI API error:', e.message);
            throw e;
        }
    }

    // Call HuggingFace Inference API
    async callHuggingFaceAPI(userText, systemPrompt) {
        const model = HUGGINGFACE_MODEL || 'tiiuae/falcon-7b-instruct';
        const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${HUGGINGFACE_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                inputs: `${systemPrompt}\n\nUser: ${userText}\nAssistant:`,
                parameters: {
                    max_new_tokens: 300,
                    temperature: 0.7,
                    top_p: 0.95
                }
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`HuggingFace API error: ${response.status}`);
        }

        const data = await response.json();
        if (Array.isArray(data) && data[0] && data[0].generated_text) {
            let text = data[0].generated_text;
            // Extract just the response part (after "Assistant:")
            if (text.includes('Assistant:')) {
                text = text.split('Assistant:')[1].trim();
            }
            return text.substring(0, 500); // Limit response length
        }
        throw new Error('Invalid HuggingFace response format');
    }

    // Call Google Generative AI
    async callGoogleAPI(userText, systemPrompt) {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GOOGLE_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: {
                    parts: [
                        { text: systemPrompt },
                        { text: userText }
                    ]
                },
                generationConfig: {
                    maxOutputTokens: 300,
                    temperature: 0.7
                }
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Google API error: ${response.status}`);
        }

        const data = await response.json();
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
            return data.candidates[0].content.parts[0].text.trim();
        }
        throw new Error('Invalid Google API response format');
    }

    // Built-in response handler for common queries (when LLM API is not available)
    async getBuiltInResponse(text, tripId, trip) {
        const lower = (text || '').toLowerCase();

        // SNACK/FOOD suggestions
        if (/\b(snack|food|meal|eat|lunch|breakfast|dinner|drink|beverage)\b/.test(lower)) {
            const snackSuggestions = [
                'Protein bars',
                'Nuts and dried fruits',
                'Trail mix',
                'Granola bars',
                'Crackers',
                'Instant noodles',
                'Jerky',
                'Energy gels',
                'Water bottles',
                'Herbal tea bags',
                'Coffee',
                'Electrolyte drinks'
            ];
            // Filter out items already in packing list
            const currentList = this.currentPackingList[tripId] || {};
            const alreadyPacked = [];
            Object.values(currentList).forEach(cat => {
                if (Array.isArray(cat)) {
                    cat.forEach(item => alreadyPacked.push(this.normalizeText(item.name || item.item || item)));
                }
            });

            const recommendations = snackSuggestions.filter(s =>
                !alreadyPacked.some(existing => this.normalizeText(existing) === this.normalizeText(s))
            );

            return `For snacks during your trip, I suggest packing:\n${recommendations.slice(0, 8).join('\n')}\n\nUse "add(item name)" to add any of these to your packing list.`;
        }

        // TRIP DURATION
        if (/\bhow.*(long|many|duration)\b.*\btrip\b/.test(lower) || /\btrip.*\bhow.*(long|many)\b/.test(lower)) {
            const duration = trip.duration || 'unknown';
            if (duration === 'unknown') {
                return `I don't have information about your trip duration yet. You can tell me "The trip is 5 days" and I'll help you prepare appropriately.`;
            }
            return `Your trip is ${duration} days long. Based on this duration, I recommend packing enough clothes and toiletries for the entire stay, plus a few extra items.`;
        }

        // WHAT TO PACK
        if (/\b(what|help|suggest)\b.*\b(pack|bring|wear)\b/.test(lower)) {
            const destination = trip.destination || 'your destination';
            const purpose = trip.purpose || 'general travel';
            return `For your ${purpose} trip to ${destination}, I recommend checking the weather first, then packing:\n• Weather-appropriate clothing\n• Essential documents (passport, visa, travel insurance)\n• Toiletries and medications\n• Electronics and chargers\n• Comfortable walking shoes\n\nTell me the weather or purpose, and I'll give more specific recommendations!`;
        }

        // PLACES/ATTRACTIONS/ACTIVITIES to explore
        if (/\b(place|location|spot|attraction|activity|thing|explore|visit|restaurant|cafe|restaurant|what.*do|where.*go)\b/.test(lower)) {
            const destination = trip.destination || 'the area';
            const purpose = trip.purpose || 'your trip';

            // Generic place suggestions by destination type
            const placeSuggestions = {
                beach: [
                    'Beach for swimming and sunbathing',
                    'Coral reef for snorkeling',
                    'Beachside restaurants and seafood',
                    'Water sports facilities (surfing, jet skiing)',
                    'Beach volleyball courts',
                    'Sunset viewpoints'
                ],
                mountain: [
                    'Mountain hiking trails',
                    'Scenic viewpoints',
                    'Mountain lodges and cafes',
                    'Rock climbing spots',
                    'Forest walks',
                    'Local alpine villages'
                ],
                city: [
                    'Historical monuments and museums',
                    'Local markets and bazaars',
                    'Restaurants and food courts',
                    'Parks and gardens',
                    'Shopping districts',
                    'Nightlife and entertainment venues'
                ],
                default: [
                    'Local museums and cultural sites',
                    'Popular restaurants and cafes',
                    'Parks and natural areas',
                    'Shopping and markets',
                    'Historical landmarks',
                    'Local tours and experiences'
                ]
            };

            // Determine which type of suggestions to show
            let suggestions = placeSuggestions.default;
            if (destination.toLowerCase().includes('beach') || trip.purpose?.toLowerCase().includes('beach')) {
                suggestions = placeSuggestions.beach;
            } else if (destination.toLowerCase().includes('mountain') || destination.toLowerCase().includes('ski')) {
                suggestions = placeSuggestions.mountain;
            } else if (destination.toLowerCase().includes('city') || destination.toLowerCase().includes('new york') || destination.toLowerCase().includes('london') || destination.toLowerCase().includes('paris')) {
                suggestions = placeSuggestions.city;
            }

            return `Here are some great places to explore in ${destination} for your ${purpose}:\n• ${suggestions.join('\n• ')}\n\nMake sure to pack accordingly based on these activities!`;
        }

        // DEFAULT RESPONSE
        return `I understand your question about ${text.substring(0, 30)}...\n\nTry asking about:\n• "suggest snacks" for food recommendations\n• "places to explore" for attractions\n• "add (item)" to add packing items\n• "what should I pack for beach" for destination-specific suggestions\n\nOr tell me about your trip (destination, weather, duration) and I'll help!`;

    }

    // Check whether a column exists in a Supabase table (cache results). Returns boolean.
    // Levenshtein distance
    levenshtein(a, b) {
        if (!a || !b) return (a || b) ? Math.max(a.length, b.length) : 0;
        const m = a.length, n = b.length;
        const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
            }
        }
        return dp[m][n];
    }

    tokenOverlapRatio(a, b) {
        const ta = (a || '').split(/\s+/).filter(Boolean);
        const tb = (b || '').split(/\s+/).filter(Boolean);
        if (!ta.length || !tb.length) return 0;
        const sa = new Set(ta);
        const sb = new Set(tb);
        let inter = 0;
        sa.forEach(x => { if (sb.has(x)) inter++; });
        const union = new Set([...sa, ...sb]).size;
        return inter / union;
    }

    // Find matching items for a trip using Supabase or in-memory lists (case-insensitive)
    async findMatchingItems(tripId, rawText) {
        const normQuery = this.normalizeText(rawText || '');
        let rows = [];
        // Try Supabase if available
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                const userId = await this.getCurrentUserId();
                let query = supabaseClient
                    .from('packing_lists')
                    .select('*')
                    .eq('trip_id', tripId);

                // Add user_id filter for data isolation
                if (userId) {
                    query = query.eq('user_id', userId);
                }

                const { data, error } = await query;
                if (!error && data) {
                    // Normalize Supabase rows: convert 'item' -> 'name' for UI consistency
                    rows = data.map(r => ({
                        ...r,
                        name: r.item || r.item_text || r.name,
                        checked: r.is_checked || r.checked || false
                    }));
                }
            } catch (e) { console.warn('Supabase query failed', e); }
        }
        // Fallback to local
        if (!rows || rows.length === 0) {
            const list = this.currentPackingList[tripId] || {};
            Object.keys(list).forEach(cat => {
                list[cat].forEach(itemObj => rows.push(Object.assign({}, itemObj, { category: cat })));
            });
        }

        const matches = rows.map(r => {
            const text = this.normalizeText(r.name || r.item || r.item_text || '');
            const exact = (text === normQuery) ? 1 : 0;
            const tokenOverlap = this.tokenOverlapRatio(text, normQuery);
            const lev = this.levenshtein(text, normQuery);
            const levScore = 1 - (lev / Math.max(text.length, normQuery.length, 1));
            const score = Math.max(exact, tokenOverlap, levScore * 0.9);
            return { row: r, score };
        }).sort((a, b) => b.score - a.score);

        return matches;
    }

    // Get current authenticated user id (supabase) or this.currentUser fallback
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

    // Perform an action and persist to DB if available. Returns { success, changes }
    async performAction(action, payload, tripId) {
        const userId = await this.getCurrentUserId();
        const changes = [];
        const errors = [];

        // finalize helper: log the action and return the result
        const finalize = async (success) => {
            try {
                const previousState = null; // could capture a snapshot before applying the action
                const newState = this.currentPackingList[tripId] || null;
                if (typeof this.logAction === 'function') await this.logAction(action, payload, tripId, previousState, newState);
            } catch (e) { console.warn('logAction failed', e); }
            // Persist changes to local storage so refresh keeps latest state
            try {
                await this.savePackingNow().catch(() => this.savePackingList());
            } catch (e) { /* ignore save errors */ }
            return { success: success, changes, errors };
        };

        // helper to insert into packing_lists
        const insertItem = async (row) => {
            // row should have: { category, item, is_checked } (local version may use 'name', 'checked')
            const itemText = row.item || row.name || '';
            const cat = row.category || 'extras';
            const id = 'local-' + Date.now() + '-' + Math.random();

            // Always ensure category exists in memory first
            if (!this.currentPackingList[tripId]) this.currentPackingList[tripId] = {};
            if (!this.currentPackingList[tripId][cat]) this.currentPackingList[tripId][cat] = [];

            // Try DB insert if Supabase available, but always add locally as fallback
            if (supabaseClient) {
                try {
                    const dbRow = { trip_id: tripId, user_id: userId || null, category: cat, item: itemText, is_checked: row.is_checked || row.checked || false };
                    const { data, error } = await supabaseClient.from('packing_lists').insert([dbRow]).select().single();
                    if (error) throw error;
                    // Successfully inserted to DB
                    this.currentPackingList[tripId][cat].push({ id: data.id || id, name: data.item || itemText, checked: data.is_checked || false });
                    changes.push({ op: 'insert', table: 'packing_lists', row: data });
                    return data;
                } catch (e) {
                    // DB insert failed, silently fall through to local add (don't record error)
                    console.warn('DB insert failed, adding locally:', e.message);
                }
            }
            // Add to local list (whether DB failed or Supabase not available)
            this.currentPackingList[tripId][cat].push({ id: id, name: itemText, checked: false });
            changes.push({ op: 'insert', table: 'packing_lists', row: { category: cat, item: itemText, is_checked: false } });
            return { id, category: cat, item: itemText, is_checked: false };
        };

        // ADD
        if (action === 'add_item') {
            const items = payload.items || [];
            const forcedCategory = payload.category || null;
            for (const it of items) {
                // determine category: forced -> canonicalize -> fallback extras
                let category = forcedCategory || null;
                if (!category) {
                    try { category = this.canonicalizeItem(it).category || null; } catch (e) { category = null; }
                }
                if (!category) category = 'extras';
                const row = { category: category, item: it, is_checked: false };
                const inserted = await insertItem(row);
            }
            // ensure local persistence: save to canonical per-user key using resolved userId
            try {
                const storageKey = this.getUserStorageKey('packing', userId);
                this.saveToStorage(storageKey, this.currentPackingList);
            } catch (e) { try { this.savePackingList(); } catch (e) { } }
            // update UI if we're currently viewing this trip
            try {
                if (this.currentTripId === tripId) {
                    this.updatePackingCategories();
                    this.updateTripProgress();
                }
            } catch (e) { console.warn('UI update after add_item failed', e); }
            return await finalize(errors.length === 0);
        }

        // REMOVE
        if (action === 'remove_item') {
            const targets = payload.targets || [];
            for (const t of targets) {
                const matches = await this.findMatchingItems(tripId, t);
                if (matches && matches.length) {
                    const best = matches[0];
                    if (best.score >= 0.7) {
                        const row = best.row;
                        const itemText = row.item || row.name || t;
                        // Try DB delete if Supabase available
                        if (supabaseClient && row.id && !String(row.id).startsWith('local-')) {
                            try {
                                const { error } = await supabaseClient.from('packing_lists')
                                    .delete()
                                    .eq('trip_id', tripId)
                                    .eq('user_id', userId)
                                    .ilike('item', itemText);
                                if (error) throw error;
                                changes.push({ op: 'delete', table: 'packing_lists', row });
                            } catch (e) {
                                console.warn('DB delete failed, removing locally:', e.message);
                            }
                        }
                        // Always remove from local list
                        this._removeItemByName(tripId, itemText);
                        changes.push({ op: 'delete', table: 'packing_lists', row });
                    } else {
                        // Don't record as error - silently skip if no confident match
                    }
                }
            }
            try {
                const storageKey = this.getUserStorageKey('packing', userId);
                this.saveToStorage(storageKey, this.currentPackingList);
            } catch (e) { try { this.savePackingList(); } catch (e) { } }
            // update UI
            try {
                if (this.currentTripId === tripId) {
                    this.updatePackingCategories();
                    this.updateTripProgress();
                }
            } catch (e) { console.warn('UI update after remove_item failed', e); }
            return await finalize(true);
        }

        // MOVE
        if (action === 'move_item') {
            const item = payload.item;
            const targetCat = payload.targetCategory;
            const matches = await this.findMatchingItems(tripId, item);
            if (matches && matches.length && matches[0].score >= 0.6) {
                const row = matches[0].row;
                const itemText = row.item || row.name || item;
                if (supabaseClient && row.id && !String(row.id).startsWith('local-')) {
                    try {
                        // Update by trip_id + user_id + case-insensitive item match
                        const { data, error } = await supabaseClient.from('packing_lists')
                            .update({ category: targetCat })
                            .eq('trip_id', tripId)
                            .eq('user_id', userId)
                            .ilike('item', itemText);
                        if (error) throw error;
                        changes.push({ op: 'update', table: 'packing_lists', row: data || row });
                    } catch (e) { errors.push(e.message || String(e)); }
                } else {
                    const moved = this._moveItemToCategory(tripId, item, targetCat);
                    if (moved) changes.push({ op: 'update', table: 'packing_lists', row: { name: itemText, category: targetCat } });
                    else errors.push('Could not move item locally');
                }
            } else {
                errors.push('No matching item found to move');
            }
            return await finalize(errors.length === 0);
        }

        // TOGGLE
        if (action === 'toggle_check') {
            const item = payload.item;
            const matches = await this.findMatchingItems(tripId, item);
            if (matches && matches.length && matches[0].score >= 0.6) {
                const row = matches[0].row;
                const itemText = row.item || row.name || item;
                const newState = !(row.is_checked || row.checked || false);
                if (supabaseClient && row.id && !String(row.id).startsWith('local-')) {
                    try {
                        // Update by trip_id + user_id + case-insensitive item match
                        const { data, error } = await supabaseClient.from('packing_lists')
                            .update({ is_checked: newState })
                            .eq('trip_id', tripId)
                            .eq('user_id', userId)
                            .ilike('item', itemText);
                        if (error) throw error;
                        changes.push({ op: 'update', table: 'packing_lists', row: data || row });
                    } catch (e) { errors.push(e.message || String(e)); }
                } else {
                    // local toggle
                    Object.keys(this.currentPackingList[tripId] || {}).forEach(cat => {
                        if (this.currentPackingList[tripId][cat]) {
                            this.currentPackingList[tripId][cat] = this.currentPackingList[tripId][cat].map(i => {
                                const iText = i.name || i.item || '';
                                if (iText.toLowerCase() === itemText.toLowerCase()) {
                                    i.checked = !i.checked;
                                    changes.push({ op: 'update', table: 'packing_lists', row: i });
                                }
                                return i;
                            });
                        }
                    });
                }
            } else {
                errors.push('No matching item found to toggle');
            }
            return await finalize(errors.length === 0);
        }

        // REPLACE (replace one item with another)
        if (action === 'replace_item') {
            const from = payload.from;
            const to = payload.to;
            const matches = await this.findMatchingItems(tripId, from);
            const results = [];
            if (matches && matches.length && matches[0].score >= 0.6) {
                const row = matches[0].row;
                // delete old and insert new
                const removed = await this.performAction('remove_item', { targets: [from] }, tripId);
                const added = await this.performAction('add_item', { items: [to] }, tripId);
                // merge child changes/errors into parent context for logging
                if (removed && Array.isArray(removed.changes)) changes.push(...removed.changes);
                if (added && Array.isArray(added.changes)) changes.push(...added.changes);
                if (removed && Array.isArray(removed.errors)) errors.push(...removed.errors);
                if (added && Array.isArray(added.errors)) errors.push(...added.errors);
                return await finalize(errors.length === 0);
            }
            errors.push('No matching item to replace');
            return await finalize(false);
        }

        // REGENERATE
        if (action === 'regenerate_list') {
            // Call server-side regenerate if available (edge function), otherwise use local AI pipeline
            try {
                const trip = this.trips.find(x => x.id === tripId) || {};
                // attempt edge function
                if (typeof REGENERATE_EDGE_URL !== 'undefined' && REGENERATE_EDGE_URL) {
                    const token = (supabaseClient && supabaseClient.auth) ? (await supabaseClient.auth.getUser()).data?.user?.id : null;
                    const res = await fetch(REGENERATE_EDGE_URL, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trip, userId })
                    });
                    if (res.ok) {
                        const out = await res.json();
                        // expect out.items: [{category, item}]
                        // atomic replace via supabase transaction is not available client-side; do delete+insert
                        if (supabaseClient) {
                            // delete all existing rows for this trip
                            const { error: delError } = await supabaseClient.from('packing_lists').delete().eq('trip_id', tripId).eq('user_id', userId);
                            if (delError) throw delError;
                            // insert new rows
                            if (Array.isArray(out.items) && out.items.length) {
                                const toInsert = out.items.map(it => ({
                                    trip_id: tripId,
                                    user_id: userId,
                                    category: it.category || 'extras',
                                    item: it.item || it.item_text || '',
                                    is_checked: false
                                }));
                                const toInsertWithUser = toInsert.map(item => ({ ...item, user_id: userId }));
                                const { data, error } = await supabaseClient.from('packing_lists').insert(toInsertWithUser).select();
                                if (error) throw error;
                                changes.push({ op: 'replace', table: 'packing_lists', row: data });
                            }
                        } else {
                            // local replace
                            this.currentPackingList[tripId] = {};
                            out.items.forEach(it => {
                                const c = it.category || 'extras';
                                if (!this.currentPackingList[tripId][c]) this.currentPackingList[tripId][c] = [];
                                this.currentPackingList[tripId][c].push({ id: 'local-' + Date.now() + '-' + Math.random(), name: it.item || it.item_text || '', checked: false });
                            });
                            changes.push({ op: 'replace', table: 'packing_lists', row: this.currentPackingList[tripId] });
                        }
                        // store AI suggestion (if table exists)
                        try {
                            if (supabaseClient) await supabaseClient.from('ai_suggestions').insert({ trip_id: tripId, user_id: userId, suggestion_json: out, created_at: new Date().toISOString() });
                        } catch (e) { /* ignore if ai_suggestions doesn't exist */ }
                        return await finalize(true);
                    }
                }
                // Fallback: use OpenAI via Supabase proxy for regeneration
                try {
                    const aiCtx = trip.aiContext || {};
                    const currentItems = [];
                    const curList = this.currentPackingList[tripId] || {};
                    Object.values(curList).forEach(cat => { if (Array.isArray(cat)) cat.forEach(i => currentItems.push(i.name || i.item || '')); });

                    const regenPrompt = `You are a smart travel packing assistant. Generate a FRESH, DIFFERENT packing list for this trip:\n- Destination: ${trip.destination || 'Unknown'}\n- Duration: ${trip.duration || 'Unknown'} days\n- Trip type: ${aiCtx.vibe || trip.purpose || 'General travel'}\n- Expected weather: ${aiCtx.weather || 'Unknown'}\n- Activities: ${aiCtx.activities || 'General'}\n- Accommodation: ${aiCtx.accommodation || 'Hotel'}\n- Transport: ${aiCtx.transport_type || trip.transport || 'Unknown'}\n- Packing style: ${aiCtx.pref_packing || 'Balanced'}\n- Laundry available: ${aiCtx.laundry || 'Unknown'}\n- Special needs: ${aiCtx.special || 'None'}\n- Previous list items (use for context, but vary the rest): ${currentItems.slice(0, 15).join(', ') || '(none)'}\n- USER HINT (PRIORITY): ${payload.hint || 'Please suggest a fresh variation'}\n\nIMPORTANT: If the user hint mentions specific items to keep, include, or build around, you MUST ensure those items are included in the new JSON list. Vary other items to keep the list fresh.\n\nReturn ONLY valid JSON in this exact structure:\n{"essentials":["item1"],"clothing":["item1"],"toiletries":["item1"],"tech":["item1"],"health":["item1"],"extras":["item1"]}\n\nInclude 6-12 items per category.`;

                    const regenMessages = [
                        { role: 'system', content: 'You are a smart travel packing assistant. You help users create and improve packing lists based on their trip details such as destination, duration, weather, activities, accommodation type, and preferences. You can regenerate packing lists, suggest travel items, and answer packing-related questions. Always respond with valid JSON when asked.' },
                        { role: 'user', content: regenPrompt }
                    ];

                    const regenResult = await callLLMViaSupabase(regenMessages);
                    let rawText = '';
                    if (regenResult && regenResult.choices && regenResult.choices[0] && regenResult.choices[0].message) {
                        rawText = regenResult.choices[0].message.content || '';
                    } else if (typeof regenResult === 'string') { rawText = regenResult; }
                    else if (regenResult && regenResult.reply) { rawText = regenResult.reply; }

                    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);
                        const newList = {};
                        ['essentials', 'clothing', 'toiletries', 'tech', 'health', 'extras'].forEach(cat => {
                            const raw = parsed[cat] || [];
                            newList[cat] = raw.map(name => ({ name: String(name), checked: false, addedAt: new Date().toISOString(), aiGenerated: true }));
                        });
                        this.currentPackingList[tripId] = newList;
                        try { if (this.currentTripId === tripId) { this.updatePackingCategories(); this.updateTripProgress(); } } catch (e) { /* ignore */ }
                        changes.push({ op: 'replace', table: 'packing_lists', row: newList });
                        return await finalize(true);
                    }
                } catch (openAiErr) {
                    console.warn('[PackAssistant] OpenAI regeneration failed, using local fallback:', openAiErr);
                }
                // Final fallback to local augmentation
                await this.applyAIAugmentedPacking(tripId, trip, { freeText: payload.hint || '' });
                changes.push({ op: 'replace', table: 'packing_lists', row: this.currentPackingList[tripId] });
                return await finalize(true);
            } catch (e) {
                errors.push(String(e));
                return await finalize(false);
            }
        }

        errors.push('Unknown action');
        return await finalize(false);
    }

    addCustomItem(category) {
        const itemName = prompt(`Add custom item to ${category}:`);
        if (!itemName || !itemName.trim()) return;

        if (!this.currentPackingList[this.currentTripId]) return;

        const items = this.currentPackingList[this.currentTripId][category];
        const existingNames = items.map(item => item.name.toLowerCase());

        if (existingNames.includes(itemName.toLowerCase())) {
            this.showToast('Item already exists in this category', 'warning');
            return;
        }

        items.push({
            name: itemName.trim(),
            checked: false,
            addedAt: new Date().toISOString(),
            custom: true
        });

        this.updatePackingCategories();
        this.updateTripProgress();
        this.savePackingList();
        this.showToast(`Added "${itemName}" to ${category}`, 'success');
    }

    removeCustomItem(category, index) {
        if (!this.currentPackingList[this.currentTripId]) return;

        const items = this.currentPackingList[this.currentTripId][category];
        const item = items[index];

        if (!item.custom) return; // Only allow removing custom items

        if (confirm(`Remove "${item.name}" from your packing list?`)) {
            items.splice(index, 1);
            this.updatePackingCategories();
            this.updateTripProgress();
            this.savePackingList();
            this.showToast(`Removed "${item.name}"`, 'success');
        }
    }

    toggleItem(category, index, evt) {
        if (!this.currentTripId || !this.currentPackingList[this.currentTripId]) return;

        const item = this.currentPackingList[this.currentTripId][category][index];
        item.checked = !item.checked;
        item.checkedAt = item.checked ? new Date().toISOString() : null;

        // Add satisfying animation. Prefer event.currentTarget, fallback to DOM query.
        const itemElement = (evt && evt.currentTarget) || document.querySelector(`.packing-item[data-category="${category}"][data-index="${index}"]`);
        if (itemElement && item.checked) {
            itemElement.classList.add('checking');
            setTimeout(() => {
                itemElement.classList.remove('checking');
            }, 300);
        }

        // Update progress and save
        this.updateTripProgress();
        this.updatePackingCategories();
        // Persist immediately to per-user storage when possible
        try { this.savePackingNow().catch(() => this.savePackingList()); } catch (e) { try { this.savePackingList(); } catch (e) { } }

        // Show encouraging messages
        if (item.checked) {
            const encouragements = [
                "Great job! 🎉", "One step closer! ✨", "You're on a roll! 🔥",
                "Keep it up! 💪", "Almost there! 🌟"
            ];
            const randomEncouragement = encouragements[Math.floor(Math.random() * encouragements.length)];

            // Only show for every few items to avoid spam
            if (Math.random() < 0.3) {
                this.showToast(randomEncouragement, 'success');
            }
        }
    }

    updateTripProgress() {
        if (!this.currentTripId) return;

        const packingList = this.currentPackingList[this.currentTripId];
        let totalItems = 0;
        let checkedItems = 0;

        Object.values(packingList).forEach(items => {
            totalItems += items.length;
            checkedItems += items.filter(item => item.checked).length;
        });

        const progress = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;

        // Update trip progress
        const trip = this.trips.find(t => t.id === this.currentTripId);
        if (trip) {
            const oldProgress = trip.progress;
            trip.progress = progress;

            // Update progress ring in UI
            this.updateProgressRings(progress);

            // Show milestone celebrations
            this.checkProgressMilestones(oldProgress, progress);

            // Save to storage
            this.saveUserTrips();

            // Sync to Supabase if available
            this.syncTripProgress(trip);
        }
    }

    updateProgressRings(progress) {
        document.querySelectorAll('.progress-ring-fill').forEach(ring => {
            const circumference = 2 * Math.PI * 26;
            const strokeDashoffset = circumference - (progress / 100) * circumference;
            ring.style.strokeDashoffset = strokeDashoffset;
        });

        document.querySelectorAll('.progress-text').forEach(text => {
            text.textContent = `${progress}%`;
        });
    }

    checkProgressMilestones(oldProgress, newProgress) {
        const milestones = [25, 50, 75, 100];

        for (const milestone of milestones) {
            if (oldProgress < milestone && newProgress >= milestone) {
                this.celebrateProgress(milestone);
                break;
            }
        }
    }

    celebrateProgress(milestone) {
        const messages = {
            25: 'Quarter way there! 🎯',
            50: 'Halfway packed! 🎒',
            75: 'Almost ready to go! ✈️',
            100: 'All packed! Ready for adventure! 🎉'
        };

        const message = messages[milestone];
        this.showToast(message, 'success');

        // Add confetti effect for 100%
        if (milestone === 100) {
            this.showConfetti();
        }
    }

    showConfetti() {
        // Simple confetti effect
        const colors = ['#0EA5E9', '#F59E0B', '#10B981', '#EF4444'];
        for (let i = 0; i < 50; i++) {
            setTimeout(() => {
                const confetti = document.createElement('div');
                confetti.style.cssText = `
                    position: fixed;
                    top: -10px;
                    left: ${Math.random() * 100}%;
                    width: 10px;
                    height: 10px;
                    background: ${colors[Math.floor(Math.random() * colors.length)]};
                    animation: confetti 3s ease-out forwards;
                    z-index: 10000;
                    pointer-events: none;
                `;
                document.body.appendChild(confetti);

                setTimeout(() => confetti.remove(), 3000);
            }, i * 50);
        }

        // Add confetti animation styles
        if (!document.getElementById('confetti-styles')) {
            const style = document.createElement('style');
            style.id = 'confetti-styles';
            style.textContent = `
                @keyframes confetti {
                    0% { transform: translateY(0) rotate(0deg); opacity: 1; }
                    100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
    }

    async syncTripProgress(trip) {
        if (!supabaseClient || !this.currentUser || !this.isOnline) return;

        try {
            const { error } = await supabaseClient
                .from('trips')
                .update({
                    packing_progress: trip.progress,
                    checked_items: trip.checkedItems || []
                })
                .eq('id', trip.id);

            if (error) throw error;
        } catch (error) {
            console.error('Sync progress error:', error);
            // Queue for offline sync
            this.queueOfflineAction({
                type: 'update_trip',
                payload: { id: trip.id, progress: trip.progress }
            });
        }
    }

    updateWeatherWidget(trip) {
        const widget = document.getElementById('weather-widget');
        if (!widget) return;

        // Fetch real forecast data
        this.fetchWeatherForecast(trip.destination, trip.startDate, trip.endDate).then(forecastData => {
            if (!forecastData) {
                // Fallback to generated data
                const weather = trip.weather || this.generateWeatherData(trip.destination);
                this.renderWeatherWidget(widget, weather, this.generateForecast(weather));
                return;
            }

            this.renderWeatherWidget(widget, forecastData.current, forecastData.forecast);
        }).catch(err => {
            console.warn('Weather forecast fetch failed, using fallback:', err);
            const weather = trip.weather || this.generateWeatherData(trip.destination);
            this.renderWeatherWidget(widget, weather, this.generateForecast(weather));
        });
    }

    renderWeatherWidget(widget, currentWeather, forecast) {
        const { temp, condition, humidity = 65, windSpeed = 8 } = currentWeather;

        widget.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
                <i class="fas fa-cloud-sun" style="font-size: 1.5rem; color: var(--primary);"></i>
                <h3 style="margin: 0;">Weather Forecast</h3>
            </div>
            <div class="weather-current">
                <i class="weather-icon ${this.getWeatherIcon(condition)}" style="font-size: 3rem; margin-bottom: 16px;"></i>
                <div class="weather-temp">${Math.round(temp)}°C</div>
                <div class="weather-condition">${condition}</div>
                <div style="display: flex; justify-content: space-around; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
                    <div style="text-align: center;">
                        <i class="fas fa-tint" style="color: var(--primary); margin-bottom: 4px;"></i>
                        <div style="font-size: var(--font-size-xs);">${humidity}%</div>
                        <div style="font-size: var(--font-size-xs); color: var(--text-secondary);">Humidity</div>
                    </div>
                    <div style="text-align: center;">
                        <i class="fas fa-wind" style="color: var(--primary); margin-bottom: 4px;"></i>
                        <div style="font-size: var(--font-size-xs);">${windSpeed} mph</div>
                        <div style="font-size: var(--font-size-xs); color: var(--text-secondary);">Wind</div>
                    </div>
                </div>
            </div>
            <div style="margin: 24px 0 16px 0;">
                <h4 style="font-size: var(--font-size-sm); font-weight: 600; margin-bottom: 12px; color: var(--text-primary);">
                    Forecast
                </h4>
            </div>
            <div class="weather-forecast">
                ${forecast.map(day => `
                    <div class="forecast-item">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <i class="${this.getWeatherIcon(day.condition)}" style="width: 20px;"></i>
                            <span style="font-weight: 500;">${day.day}</span>
                        </div>
                        <div style="text-align: right;">
                            <span style="font-weight: 600;">${Math.round(day.temp)}°C</span>
                            <div style="font-size: var(--font-size-xs); color: var(--text-secondary);">${day.condition}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border);">
                <h4 style="font-size: var(--font-size-sm); font-weight: 600; margin-bottom: 8px;">
                    Packing Tips
                </h4>
                <ul style="list-style: none; padding: 0; font-size: var(--font-size-sm); color: var(--text-secondary);">
                    ${this.getWeatherTips(condition).map(tip => `
                        <li style="margin-bottom: 4px;">
                            <i class="fas fa-lightbulb" style="color: var(--warning); margin-right: 8px;"></i>
                            ${tip}
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }

    async fetchWeatherForecast(destination, startDate, endDate) {
        try {
            if (!OPENWEATHERMAP_API_KEY || !destination) {
                if (!OPENWEATHERMAP_API_KEY) {
                    console.error('Missing OpenWeatherMap API key. Configure OPENWEATHER_API_KEY in .env.');
                }
                return null;
            }

            // Geocode destination
            const geoRes = await fetch(
                `${NOMINATIM_URL}?q=${encodeURIComponent(destination)}&format=json&limit=1`,
                { headers: { 'User-Agent': 'ZipIt-App' } }
            );
            if (!geoRes.ok) return null;
            const geoData = await geoRes.json();
            if (!geoData || geoData.length === 0) return null;
            const { lat, lon } = geoData[0];

            // Fetch 5-day forecast
            const forecastRes = await fetch(
                `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${OPENWEATHERMAP_API_KEY}&units=metric`
            );
            if (!forecastRes.ok) return null;
            const forecastData = await forecastRes.json();

            // Process forecast based on trip dates
            const start = new Date(startDate);
            const end = new Date(endDate);
            const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

            let forecast = [];
            if (daysDiff <= 1) {
                // Hourly forecast for single day
                const todayForecast = forecastData.list.slice(0, 8); // Next 24 hours (3-hour intervals)
                forecast = todayForecast.map(item => ({
                    day: new Date(item.dt * 1000).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }),
                    temp: item.main.temp,
                    condition: item.weather[0].main.toLowerCase()
                }));
            } else {
                // Daily forecast
                const dailyData = {};
                forecastData.list.forEach(item => {
                    const date = new Date(item.dt * 1000).toDateString();
                    if (!dailyData[date]) {
                        dailyData[date] = {
                            temps: [],
                            conditions: []
                        };
                    }
                    dailyData[date].temps.push(item.main.temp);
                    dailyData[date].conditions.push(item.weather[0].main.toLowerCase());
                });

                const days = Object.keys(dailyData).slice(0, Math.min(daysDiff + 1, 5));
                forecast = days.map((dateStr, index) => {
                    const data = dailyData[dateStr];
                    const avgTemp = data.temps.reduce((a, b) => a + b, 0) / data.temps.length;
                    const condition = data.conditions[Math.floor(data.conditions.length / 2)]; // Middle condition
                    return {
                        day: index === 0 ? 'Today' : new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long' }),
                        temp: avgTemp,
                        condition: condition
                    };
                });
            }

            // Current weather
            const current = forecastData.list[0];
            const currentWeather = {
                temp: current.main.temp,
                condition: current.weather[0].main.toLowerCase(),
                humidity: current.main.humidity,
                windSpeed: Math.round(current.wind.speed * 2.237) // Convert m/s to mph
            };

            return { current: currentWeather, forecast };
        } catch (err) {
            console.warn('fetchWeatherForecast error:', err);
            return null;
        }
    }

    generateForecast(currentWeather) {
        const conditions = ['sunny', 'cloudy', 'partly cloudy', 'light rain'];
        const days = ['Today', 'Tomorrow', 'Day 3'];

        return days.map((day, index) => ({
            day,
            temp: currentWeather.temp + Math.floor(Math.random() * 6) - 3,
            condition: index === 0 ? currentWeather.condition :
                conditions[Math.floor(Math.random() * conditions.length)]
        }));
    }

    getWeatherTips(condition) {
        const tips = {
            sunny: [
                'Pack sunscreen and sunglasses',
                'Bring light, breathable clothing',
                'Consider a hat for sun protection'
            ],
            cloudy: [
                'Pack layers for temperature changes',
                'Bring a light jacket',
                'No need for heavy sun protection'
            ],
            'partly cloudy': [
                'Pack both sun and light rain gear',
                'Layers are your best friend',
                'Bring versatile clothing'
            ],
            'light rain': [
                'Pack waterproof jacket',
                'Bring an umbrella',
                'Waterproof shoes recommended'
            ],
            rainy: [
                'Pack full rain gear',
                'Waterproof everything',
                'Quick-dry clothing essential'
            ],
            humid: [
                'Light, moisture-wicking fabrics',
                'Extra changes of clothes',
                'Antiperspirant is essential'
            ]
        };
        return tips[condition] || tips.sunny;
    }

    getWeatherIcon(condition) {
        return this.weatherIcons[condition] || 'fas fa-sun';
    }

    async handleLogin(e) {
        e.preventDefault();
        // Top-level guard: if signup is in progress, never run login
        try {
            if (this.signupLoading) {
                console.log('handleLogin: signup in progress — skipping login');
                return;
            }
        } catch (ignore) { }
        // If the form submit originated from the signup button, skip login here
        try {
            const submitter = e?.submitter;
            const submitterId = submitter?.id || (submitter && submitter.getAttribute && submitter.getAttribute('id'));
            if (submitterId === 'signup-btn') {
                console.log('handleLogin: submit originated from signup button — skipping sign-in');
                return;
            }
        } catch (ignore) { }
        const email = document.getElementById('email')?.value?.trim();
        const password = document.getElementById('password')?.value;

        if (!email || !password) {
            this.showToast('Please fill in all fields', 'error');
            return;
        }

        // Show loading state
        const submitBtn = e.target?.querySelector('button[type="submit"]');
        if (!submitBtn) {
            this.showToast('Form element not found', 'error');
            return;
        }

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
                e.target.reset();

                // Reset button
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }, 1500);
            return;
        }

        try {
            // MANDATORY: Attempt sign-in FIRST with existing credentials
            console.log('Attempting sign-in for:', email);
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) {
                // If Supabase returns an auth error (bad credentials), show it.
                const msg = error?.message || String(error);
                console.error('Sign-in error:', msg);

                // If the error indicates the email is not confirmed, offer a magic link resend
                const notConfirmed = String(msg).toLowerCase().includes('email not confirmed') || String(msg).toLowerCase().includes('confirm');
                if (notConfirmed && supabaseClient?.auth?.signInWithOtp) {
                    try {
                        await this.sendMagicLink(email);
                        this.showToast('Email not confirmed — sent a sign-in link to your email.', 'info');
                    } catch (sendErr) {
                        // Handle cooldown and rate-limit cases
                        const msg = String(sendErr?.message || sendErr);
                        if (msg === 'rate_limited') {
                            this.showToast('Too many requests. Please wait a minute before retrying.', 'error');
                        } else if (msg.startsWith('cooldown:')) {
                            const secs = msg.split(':')[1] || '60';
                            this.showToast(`Please wait ${secs}s before resending the link.`, 'info');
                        } else {
                            console.error('Failed to send magic link:', sendErr);
                            this.showToast('Email not confirmed. Please check your inbox or contact support.', 'error');
                        }
                    }

                    // Reset button and return
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                    return;
                }

                this.showToast(msg, 'error');
                // Reset button and return
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
                return;
            }

            const user = data?.user || data?.session?.user;
            if (!user) {
                console.warn('No user data returned from sign-in');
                this.showToast('Signed in, but no user data returned.', 'warning');
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
                return;
            }
            // continue; successful sign-in handled above
        } catch (error) {
            // Network or unexpected error when contacting Supabase.
            const msg = error?.message || String(error);
            console.error('Sign-in network/error:', error);
            this.showToast('Network/auth server error. Trying local fallback...', 'warning');
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }

    // Send a magic sign-in link with cooldown/rate-limit protection
    async sendMagicLink(email) {
        const key = `zipit_magic_${email}`;
        const cooldownSeconds = 60; // prevent immediate resends
        const now = Date.now();
        const last = parseInt(localStorage.getItem(key) || '0', 10);
        if (last && (now - last) < cooldownSeconds * 1000) {
            const wait = Math.ceil((cooldownSeconds * 1000 - (now - last)) / 1000);
            throw new Error(`cooldown:${wait}`);
        }

        try {
            const { data, error } = await supabaseClient.auth.signInWithOtp({ email });
            if (error) {
                const msg = String(error?.message || error).toLowerCase();
                if (msg.includes('too many') || (error.status === 429)) {
                    localStorage.setItem(key, String(now));
                    throw new Error('rate_limited');
                }
                throw error;
            }
            localStorage.setItem(key, String(now));
            return { success: true, data };
        } catch (err) {
            const text = String(err?.message || err).toLowerCase();
            if (text.includes('too many') || text.includes('429')) {
                localStorage.setItem(key, String(now));
                throw new Error('rate_limited');
            }
            throw err;
        }
    }

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

        // Prevent duplicate signup clicks
        if (this.signupLoading) {
            this.showToast('Signup already in progress', 'info');
            return;
        }
        this.signupLoading = true;

        // Cross-tab/in-process guard: prevent concurrent signup attempts for same email
        const inprogressKeyGlobal = `zipit_signup_inprogress_${email}`;
        const alreadyInProgress = localStorage.getItem(inprogressKeyGlobal);
        if (alreadyInProgress) {
            this.showToast('Signup already in progress. Please wait.', 'info');
            this.signupLoading = false;
            return;
        }
        localStorage.setItem(inprogressKeyGlobal, String(Date.now()));

        const signupBtn = document.getElementById('signup-btn');
        const originalText = signupBtn.innerHTML;
        signupBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';
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
                this.signupLoading = false;
            }, 1500);
            return;
        }

        try {
            // Guard: avoid hitting email rate limits by checking last signup timestamp
            const signupCooldownKey = `zipit_signup_${email}`;
            const nowTs = Date.now();
            const last = parseInt(localStorage.getItem(signupCooldownKey) || '0', 10);
            const cooldownMs = 60 * 1000; // 60s
            if (last && (nowTs - last) < cooldownMs) {
                const wait = Math.ceil((cooldownMs - (nowTs - last)) / 1000);
                this.showToast(`Please wait ${wait}s before trying to create an account again.`, 'info');
                return;
            }

            // ONLY attempt signup here (user explicitly clicked Create Account)
            const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
                email: email,
                password: password,
                options: { data: { full_name: email.split('@')[0] } }
            });

            // record signup attempt timestamp to avoid immediate retries
            localStorage.setItem(signupCooldownKey, String(nowTs));

            if (signUpError) {
                const raw = String(signUpError.message || signUpError).toLowerCase();
                // Record timestamp to avoid immediate retries when rate-limited
                if (raw.includes('email rate limit') || raw.includes('rate limit') || raw.includes('too many')) {
                    localStorage.setItem(`zipit_signup_${email}`, String(nowTs));
                    this.showToast('Too many signup attempts. Please wait a minute before retrying.', 'error');
                    return;
                }
                const msg = raw;
                // If user already exists, instruct to sign in instead
                if (msg.includes('already registered') || msg.includes('duplicate') || msg.includes('user exists')) {
                    this.showToast('Account already exists. Please sign in instead.', 'error');
                } else {
                    console.error('Signup failed:', signUpError);
                    this.showToast('Signup failed: ' + (signUpError.message || signUpError), 'error');
                }
                return;
            }

            // Signup initiated successfully.
            const user = signUpData?.user || signUpData?.session?.user;
            // Insert into public.users if we received a user id
            if (user && user.id) {
                try {
                    const insertRes = await supabaseClient.from('users').insert({
                        id: user.id,
                        email: user.email,
                        full_name: user.user_metadata?.full_name || email.split('@')[0]
                    });
                    if (insertRes.error) {
                        const imsg = String(insertRes.error.message || insertRes.error).toLowerCase();
                        if (!imsg.includes('duplicate')) {
                            console.warn('public.users insert error:', insertRes.error);
                        }
                    }
                } catch (insertErr) {
                    console.warn('public.users insert exception:', insertErr);
                }
            }

            // If Supabase returned a session (auto sign-in) or email is already confirmed,
            // treat the user as signed in and continue. Otherwise, ask them to confirm email.
            const sessionUser = signUpData?.session?.user;
            const confirmed = user?.email_confirmed_at;
            if (sessionUser || confirmed) {
                try {
                    await this.setCurrentUser(user || sessionUser);
                    await this.clearOldUserData();
                    await this.loadUserScopedStorage((user || sessionUser).id);
                    await this.loadUserTrips();
                    this.updateLoginState();
                    this.updateDashboard();
                    this.closeModal('login-modal');
                    this.showToast('Account created and signed in! Welcome!', 'success');
                } catch (e) {
                    console.warn('Post-signup sign-in flow failed:', e);
                    this.showToast('Account created. Please sign in.', 'info');
                }
            } else {
                this.showToast('Check your email to confirm your account', 'info');
            }
            document.getElementById('login-form').reset();

        } catch (error) {
            console.error('Signup error:', error);
            this.showToast('Signup error: ' + (error?.message || error), 'error');
        } finally {
            signupBtn.innerHTML = originalText;
            signupBtn.disabled = false;
            this.signupLoading = false;
            // remove cross-tab in-progress flag
            try { localStorage.removeItem(inprogressKeyGlobal); } catch (e) { }
        }
    }

    async handleLogout() {
        const logoutBtn = document.getElementById('logout-btn');
        const originalText = logoutBtn.innerHTML;
        logoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing out...';

        if (supabaseClient) {
            try {
                await supabaseClient.auth.signOut();
            } catch (error) {
                console.error('Logout error:', error);
            }
        } else {
            // Demo logout
            setTimeout(() => {
                this.currentUser = null;
                this.trips = [];
                this.updateLoginState();
                this.updateDashboard();
                this.showToast('Signed out successfully', 'success');

                // Navigate to home
                this.showSection('hero');
                this.updateNavigation('hero');

                logoutBtn.innerHTML = originalText;
            }, 1000);
            return;
        }

        // Close dropdown
        const userDropdownEl = document.querySelector('.user-dropdown');
        if (userDropdownEl) userDropdownEl.classList.remove('show');
        logoutBtn.innerHTML = originalText;
    }


    generateWeatherData(destination) {
        const weatherPatterns = {
            'goa': { temp: 32, condition: 'sunny', humidity: 75, windSpeed: 8 },
            'mumbai': { temp: 28, condition: 'humid', humidity: 85, windSpeed: 12 },
            'delhi': { temp: 25, condition: 'partly cloudy', humidity: 60, windSpeed: 10 },
            'manali': { temp: 15, condition: 'cloudy', humidity: 70, windSpeed: 15 },
            'kerala': { temp: 30, condition: 'partly cloudy', humidity: 80, windSpeed: 6 }
        };

        const destKey = Object.keys(weatherPatterns).find(key =>
            destination.toLowerCase().includes(key)
        );

        const baseWeather = weatherPatterns[destKey] || {
            temp: 25, condition: 'partly cloudy', humidity: 65, windSpeed: 10
        };

        return {
            temp: baseWeather.temp + Math.floor(Math.random() * 6) - 3,
            condition: baseWeather.condition,
            humidity: baseWeather.humidity + Math.floor(Math.random() * 10) - 5,
            windSpeed: baseWeather.windSpeed + Math.floor(Math.random() * 4) - 2,
            forecast: 'Variable conditions expected'
        };
    }

    // Fetch real weather data and apply dynamic background class
    async applyWeatherBackgroundForDestination(destination) {
        try {
            // Step 1: Geocode destination to lat/lon using Nominatim
            if (!destination || typeof destination !== 'string') {
                console.warn('Invalid destination for weather background');
                return;
            }

            const geoRes = await fetch(
                `${NOMINATIM_URL}?q=${encodeURIComponent(destination)}&format=json&limit=1`,
                { headers: { 'User-Agent': 'ZipIt-App' } }
            );

            if (!geoRes.ok) {
                console.warn('Geocoding failed for destination:', destination);
                return;
            }

            const geoData = await geoRes.json();
            if (!geoData || geoData.length === 0) {
                console.warn('No geocoding results for destination:', destination);
                return;
            }

            const { lat, lon } = geoData[0];
            console.log(`Geocoded ${destination} to lat=${lat}, lon=${lon}`);

            // Step 2: Fetch weather if API key is available
            if (!OPENWEATHERMAP_API_KEY || OPENWEATHERMAP_API_KEY.trim() === '') {
                console.error('Missing OpenWeatherMap API key. Please add OPENWEATHER_API_KEY to your .env file and restart the app.');
                // Use fallback based on destination
                this.applyFallbackWeatherBackground(destination);
                return;
            }

            const weatherRes = await fetch(
                `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHERMAP_API_KEY}&units=metric`
            );

            if (!weatherRes.ok) {
                console.warn('Weather fetch failed for coordinates:', { lat, lon });
                this.applyFallbackWeatherBackground(destination);
                return;
            }

            const weatherData = await weatherRes.json();
            console.log('Fetched weather data:', weatherData);

            // Step 3: Map OpenWeatherMap condition to background class
            const mainCondition = (weatherData.weather && weatherData.weather[0] && weatherData.weather[0].main) || 'Clear';
            this.applyWeatherBackgroundClass(mainCondition);
            // Also start canvas animations matching the condition
            try {
                const cond = (mainCondition || 'Clear');
                const map = {
                    'Clear': 'clear',
                    'Sunny': 'clear',
                    'Clouds': 'clouds',
                    'Cloudy': 'clouds',
                    'Overcast': 'clouds',
                    'Rain': 'rain',
                    'Drizzle': 'rain',
                    'Thunderstorm': 'thunderstorm',
                    'Snow': 'snow'
                };
                const mode = map[cond] || 'clouds';
                if (typeof this.setWeatherAnimation === 'function') this.setWeatherAnimation(mode, weatherData);

                // Determine time of day (morning/afternoon/evening/night) using sunrise/sunset if available
                try {
                    const nowTs = (weatherData && weatherData.dt) ? weatherData.dt : Math.floor(Date.now() / 1000);
                    const sunrise = (weatherData && weatherData.sys && weatherData.sys.sunrise) ? weatherData.sys.sunrise : 0;
                    const sunset = (weatherData && weatherData.sys && weatherData.sys.sunset) ? weatherData.sys.sunset : 0;
                    let timeOfDay = 'day';
                    if (sunrise && sunset) {
                        if (nowTs >= sunrise && nowTs < sunset) {
                            const frac = (nowTs - sunrise) / (sunset - sunrise);
                            if (frac < 0.33) timeOfDay = 'morning';
                            else if (frac < 0.66) timeOfDay = 'afternoon';
                            else timeOfDay = 'evening';
                        } else {
                            timeOfDay = 'night';
                        }
                    } else {
                        // Fallback: use local clock
                        const hour = new Date().getHours();
                        if (hour >= 5 && hour < 10) timeOfDay = 'morning';
                        else if (hour >= 10 && hour < 17) timeOfDay = 'afternoon';
                        else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
                        else timeOfDay = 'night';
                    }

                    // If the WeatherAnimations module is available, start the animation engine
                    if (window && window.WeatherAnimations && typeof window.WeatherAnimations.loadWeatherBackground === 'function') {
                        window.WeatherAnimations.loadWeatherBackground(mode, timeOfDay);
                    }

                    // Also update the video-backed weather background (if available)
                    try {
                        let videoCondition = mode;
                        if (timeOfDay === 'night') {
                            if (mode === 'clear') videoCondition = 'night_clear';
                            else if (mode === 'clouds') videoCondition = 'night_clouds';
                        }
                        if (window && typeof window.updateWeatherBackground === 'function') {
                            window.updateWeatherBackground(videoCondition);
                        }
                    } catch (e) {
                        console.warn('Failed to update video weather background', e);
                    }
                } catch (err) {
                    console.warn('Failed to start WeatherAnimations module', err);
                }
            } catch (err) {
                console.warn('Failed to start weather animation', err);
            }

        } catch (err) {
            console.warn('applyWeatherBackgroundForDestination error:', err);
            // Fallback to local patterns
            this.applyFallbackWeatherBackground(destination);
        }
    }

    // Fallback: use local weather patterns based on destination name
    applyFallbackWeatherBackground(destination) {
        try {
            const weatherData = this.generateWeatherData(destination);
            const condition = (weatherData.condition || 'partly cloudy').toLowerCase();

            // Map condition to CSS class
            if (condition.includes('sunny') || condition.includes('clear')) {
                this.applyWeatherBackgroundClass('Clear');
                if (typeof this.setWeatherAnimation === 'function') this.setWeatherAnimation('clear');
                if (window && typeof window.updateWeatherBackground === 'function') window.updateWeatherBackground('clear');
            } else if (condition.includes('rain')) {
                this.applyWeatherBackgroundClass('Rain');
                if (typeof this.setWeatherAnimation === 'function') this.setWeatherAnimation('rain');
                if (window && typeof window.updateWeatherBackground === 'function') window.updateWeatherBackground('rain');
            } else if (condition.includes('snow')) {
                this.applyWeatherBackgroundClass('Snow');
                if (typeof this.setWeatherAnimation === 'function') this.setWeatherAnimation('snow');
                if (window && typeof window.updateWeatherBackground === 'function') window.updateWeatherBackground('snow');
            } else if (condition.includes('cloud')) {
                this.applyWeatherBackgroundClass('Clouds');
                if (typeof this.setWeatherAnimation === 'function') this.setWeatherAnimation('clouds');
                if (window && typeof window.updateWeatherBackground === 'function') window.updateWeatherBackground('clouds');
            } else if (condition.includes('thunder') || condition.includes('storm')) {
                this.applyWeatherBackgroundClass('Thunderstorm');
                if (typeof this.setWeatherAnimation === 'function') this.setWeatherAnimation('thunderstorm');
                if (window && typeof window.updateWeatherBackground === 'function') window.updateWeatherBackground('thunderstorm');
            } else {
                this.applyWeatherBackgroundClass('Clouds');
                if (typeof this.setWeatherAnimation === 'function') this.setWeatherAnimation('clouds');
                if (window && typeof window.updateWeatherBackground === 'function') window.updateWeatherBackground('clouds');
            }
        } catch (err) {
            console.warn('applyFallbackWeatherBackground error:', err);
        }
    }

    // Apply Apple-style gradient background based on weather condition
    applyWeatherBackgroundClass(mainCondition) {
        try {
            const body = document.body;

            // Remove existing weather styles
            body.style.background = '';
            body.style.backgroundImage = '';
            body.style.animation = '';

            // Define Apple-style gradients and animations
            const weatherStyles = {
                'Clear': {
                    gradient: 'linear-gradient(135deg, #87CEEB 0%, #E0F6FF 50%, #B0E0E6 100%)',
                    animation: 'weather-clear 20s ease-in-out infinite alternate'
                },
                'Sunny': {
                    gradient: 'linear-gradient(135deg, #FFD700 0%, #FFA500 30%, #87CEEB 70%, #E0F6FF 100%)',
                    animation: 'weather-sunny 15s ease-in-out infinite alternate'
                },
                'Clouds': {
                    gradient: 'linear-gradient(135deg, #D3D3D3 0%, #A9A9A9 50%, #778899 100%)',
                    animation: 'weather-clouds 25s ease-in-out infinite alternate'
                },
                'Rain': {
                    gradient: 'linear-gradient(135deg, #4682B4 0%, #2F4F4F 50%, #191970 100%)',
                    animation: 'weather-rain 10s ease-in-out infinite alternate'
                },
                'Thunderstorm': {
                    gradient: 'linear-gradient(135deg, #2F4F4F 0%, #000000 50%, #191970 100%)',
                    animation: 'weather-thunder 8s ease-in-out infinite alternate'
                },
                'Snow': {
                    gradient: 'linear-gradient(135deg, #F0F8FF 0%, #E6E6FA 50%, #B0C4DE 100%)',
                    animation: 'weather-snow 30s ease-in-out infinite alternate'
                }
            };

            const style = weatherStyles[mainCondition] || weatherStyles['Clouds'];
            body.style.background = style.gradient;
            body.style.backgroundSize = '400% 400%';
            body.style.animation = style.animation;

            // Add CSS animations if not already present
            if (!document.getElementById('weather-bg-styles')) {
                const styleEl = document.createElement('style');
                styleEl.id = 'weather-bg-styles';
                styleEl.textContent = `
                    @keyframes weather-clear {
                        0% { background-position: 0% 50%; }
                        100% { background-position: 100% 50%; }
                    }
                    @keyframes weather-sunny {
                        0% { background-position: 0% 50%; }
                        100% { background-position: 100% 50%; }
                    }
                    @keyframes weather-clouds {
                        0% { background-position: 0% 50%; }
                        100% { background-position: 100% 50%; }
                    }
                    @keyframes weather-rain {
                        0% { background-position: 0% 50%; }
                        100% { background-position: 100% 50%; }
                    }
                    @keyframes weather-thunder {
                        0% { background-position: 0% 50%; }
                        50% { background-position: 50% 0%; }
                        100% { background-position: 100% 50%; }
                    }
                    @keyframes weather-snow {
                        0% { background-position: 0% 50%; }
                        100% { background-position: 100% 50%; }
                    }
                `;
                document.head.appendChild(styleEl);
            }

            console.log(`Applied Apple-style weather background for: ${mainCondition}`);

        } catch (err) {
            console.warn('applyWeatherBackgroundClass error:', err);
        }
    }

    editTrip(tripId) {
        // Normalize comparison to string to handle numeric vs string ids
        const trip = this.trips.find(t => String(t.id) === String(tripId));
        if (!trip) return;

        // Pre-fill the form with existing data
        document.getElementById('trip-title').value = trip.title;
        document.getElementById('destination').value = trip.destination;
        document.getElementById('start-date').value = trip.startDate;
        document.getElementById('end-date').value = trip.endDate;
        document.getElementById('purpose').value = trip.purpose;
        document.getElementById('transport').value = trip.transport;
        document.getElementById('start-location').value = trip.startLocation || '';

        // Trigger transport change to show/hide start location field
        const transportInput = document.getElementById('transport');
        if (transportInput) {
            transportInput.dispatchEvent(new Event('input'));
        }

        // Change form title and button
        document.querySelector('#trip-modal .modal-header h2').textContent = 'Edit Trip';
        // Store selected trip so update handler can access it reliably
        this.selectedTrip = trip;

        const createBtn = document.getElementById('create-trip-submit');
        const updateBtn = document.getElementById('updateTripBtn');
        if (createBtn) createBtn.style.display = 'none';
        if (updateBtn) {
            updateBtn.style.display = '';
            updateBtn.innerHTML = `<i class="fas fa-save"></i> Update Trip`;
        }

        // Store the trip ID for update
        this.editingTripId = tripId;

        this.openModal('trip-modal');
    }

    // Save the edited trip (RLS-safe update + local update)
    // NOTE: This method is no longer used since we reuse handleTripCreation for both create and edit
    // Keeping for reference but it can be removed in future cleanup

    async deleteTrip(tripId) {
        console.log('[deleteTrip] Called with tripId:', tripId, 'type:', typeof tripId);

        // Determine storage key (user-scoped if signed in)
        const userId = this.currentUser ? this.currentUser.id : null;
        const storageKey = this.getUserStorageKey('trips', userId);

        // Load authoritative trips from storage
        const storedTrips = this.loadFromStorage(storageKey) || [];
        console.log('[deleteTrip] Loaded trips from storage count=', storedTrips.length);

        // Find trip in stored list
        const trip = storedTrips.find(t => String(t.id) === String(tripId));
        if (!trip) {
            console.warn('[deleteTrip] Trip not found in storage. Aborting delete.', { tripId, storageKey });
            return;
        }

        if (!confirm(`Are you sure you want to delete "${trip.title}"? This action cannot be undone.`)) {
            console.log('[deleteTrip] Delete cancelled by user');
            return;
        }

        // Attempt cloud delete only if we have a UUID id and Supabase client available
        let cloudDeleteFailed = false;
        try {
            if (supabaseClient && this.currentUser && this.isValidUUID(tripId)) {
                console.log('[deleteTrip] Attempting cloud delete for trip id:', tripId);
                const { error } = await supabaseClient
                    .from('trips')
                    .delete()
                    .eq('id', tripId);

                if (error) {
                    cloudDeleteFailed = true;
                    console.error('Delete trip cloud error:', error);
                }
            } else if (supabaseClient && this.currentUser) {
                console.log('[deleteTrip] Skipping cloud delete because id is not a valid UUID:', tripId);
            }
        } catch (error) {
            cloudDeleteFailed = true;
            console.error('Delete trip error:', error);
        }

        // Filter out the deleted trip from storage-backed list
        const filtered = storedTrips.filter(t => String(t.id) !== String(tripId));

        // Save filtered list back to storage (user-scoped and global key)
        try {
            this.saveToStorage(storageKey, filtered);
            // Also update canonical global key (no user) so any UI reading base key stays consistent
            this.saveToStorage(this.getUserStorageKey('trips'), filtered);
            // Reload in-memory trips from storage to ensure consistency
            this.trips = this.loadFromStorage(storageKey) || [];
        } catch (e) {
            console.error('[deleteTrip] Error saving storage after deletion', e);
        }

        // Remove packing list entry from storage as well
        try {
            const packKey = this.getUserStorageKey('packing', userId);
            const packs = this.loadFromStorage(packKey) || {};
            if (packs && Object.keys(packs).length) {
                if (packs.hasOwnProperty(String(tripId))) delete packs[String(tripId)];
                this.saveToStorage(packKey, packs);
                // Also update in-memory packing list
                this.currentPackingList = packs;
            }
        } catch (e) {
            console.warn('[deleteTrip] Failed to remove packing list for trip', e);
        }

        // Update UI: refresh trips grid and stats from authoritative storage-backed this.trips
        try {
            // Reload from Supabase and local storage to ensure we show canonical data
            if (this.currentUser && supabaseClient) {
                try {
                    await this.loadUserTrips();
                    // Merge any local-only trips that might not be uploaded yet
                    const userKey = this.getUserStorageKey('trips', this.currentUser.id);
                    const local = this.loadFromStorage(userKey) || [];
                    const existingIds = new Set((this.trips || []).map(t => String(t.id)));
                    const toAdd = local.filter(t => !existingIds.has(String(t.id)));
                    if (toAdd.length) {
                        this.trips = [...toAdd, ...(this.trips || [])];
                        this.saveUserTrips();
                    }
                } catch (err) {
                    console.warn('[deleteTrip] reload from Supabase failed, falling back to local storage', err);
                    this.trips = this.loadFromStorage(this.currentUser ? this.getUserStorageKey('trips', this.currentUser.id) : this.getUserStorageKey('trips')) || [];
                }
            } else {
                this.trips = this.loadFromStorage(this.getUserStorageKey('trips')) || [];
            }

            this.updateTripsGrid();
            this.updateStats();
        } catch (e) {
            console.warn('[deleteTrip] Failed to update UI grids, calling updateDashboard as fallback', e);
            this.updateDashboard();
        }

        // Show appropriate message
        if (cloudDeleteFailed) {
            this.showToast(`"${trip.title}" deleted locally. Will sync to server when online.`, 'warning');
        } else {
            this.showToast(`"${trip.title}" deleted successfully`, 'success');
        }

        // If we're currently viewing this trip's packing list, go back to dashboard
        if (String(this.currentTripId) === String(tripId)) {
            console.log('[deleteTrip] Currently viewing deleted trip, redirecting to dashboard');
            this.showSection('dashboard');
            this.updateNavigation('dashboard');
        }

        console.log('[deleteTrip] Complete. Remaining trips:', this.trips.length);
    }

    queueOfflineAction(action) {
        this.offlineQueue.push({
            ...action,
            timestamp: new Date().toISOString()
        });
        this.saveToStorage('zipit_offline_queue', this.offlineQueue);
    }

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('show');

            // Focus management
            const firstInput = modal.querySelector('input, button');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 100);
            }

            // Trap focus in modal
            this.trapFocus(modal);
            // If opening trip modal, populate saved templates selector and wire toggle
            if (modalId === 'trip-modal') {
                try {
                    const useTplCheckbox = document.getElementById('use-saved-templates');
                    const tplWrap = document.getElementById('template-select-wrap');
                    const tplSelect = document.getElementById('template-select');

                    const populateTemplates = async () => {
                        if (!tplSelect) return;
                        // Clear existing options except placeholder
                        tplSelect.innerHTML = '<option value="">Select a saved template...</option>';
                        const templates = await this.fetchUserPackingTemplates();
                        templates.forEach(t => {
                            const opt = document.createElement('option');
                            opt.value = t.id || (t.name + '::' + (Math.random() * 1000));
                            opt.textContent = t.name || t.title || 'Template';
                            // store serialized items on option for quick apply
                            opt.dataset.items = JSON.stringify(t.items || {});
                            tplSelect.appendChild(opt);
                        });
                    };

                    if (useTplCheckbox) {
                        useTplCheckbox.checked = false;
                        useTplCheckbox.addEventListener('change', async (e) => {
                            if (e.target.checked) {
                                if (tplWrap) tplWrap.style.display = '';
                                await populateTemplates();
                            } else {
                                if (tplWrap) tplWrap.style.display = 'none';
                            }
                        });
                    }

                    // Also populate once when modal opens (but leave select hidden until toggled)
                    populateTemplates().catch(err => console.warn('populateTemplates failed', err));
                } catch (err) {
                    console.warn('Trip modal template init failed', err);
                }
            }
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('show');

            // Reset editing state
            if (modalId === 'trip-modal') {
                this.editingTripId = null;
                this.selectedTrip = null;
                document.querySelector('#trip-modal .modal-header h2').textContent = 'Create New Trip';
                // restore buttons: show create, hide update if present
                const createBtn = document.getElementById('create-trip-submit');
                const updateBtn = document.getElementById('updateTripBtn');
                if (createBtn) {
                    createBtn.style.display = '';
                    createBtn.innerHTML = `<i class="fas fa-plus"></i> Create Trip`;
                }
                if (updateBtn) updateBtn.style.display = 'none';
                document.getElementById('trip-form').reset();
            }
        }
    }

    trapFocus(modal) {
        const focusableElements = modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                if (e.shiftKey) {
                    if (document.activeElement === firstElement) {
                        lastElement.focus();
                        e.preventDefault();
                    }
                } else {
                    if (document.activeElement === lastElement) {
                        firstElement.focus();
                        e.preventDefault();
                    }
                }
            }
        });
    }

    showToast(message, type = 'info', duration = 4000) {
        // Create toast container if it doesn't exist
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.style.cssText = `
                position: fixed;
                top: 80px;
                right: 20px;
                z-index: 10000;
                display: flex;
                flex-direction: column;
                gap: 12px;
                max-width: 400px;
            `;
            document.body.appendChild(container);
        }

        // Create toast
        const toastId = `toast-${Date.now()}`;
        const toast = document.createElement('div');
        toast.id = toastId;
        toast.style.cssText = `
            background: var(--surface);
            border: 1px solid var(--border);
            border-left: 4px solid ${type === 'success' ? 'var(--success)' :
                type === 'error' ? 'var(--error)' :
                    type === 'warning' ? 'var(--warning)' : 'var(--primary)'};
            border-radius: var(--radius-lg);
            padding: 16px 20px;
            box-shadow: var(--shadow-xl);
            transform: translateX(100%);
            transition: transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
            backdrop-filter: blur(10px);
        `;

        const iconClass = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        }[type] || 'fa-info-circle';

        const iconColor = {
            success: 'var(--success)',
            error: 'var(--error)',
            warning: 'var(--warning)',
            info: 'var(--primary)'
        }[type] || 'var(--primary)';

        toast.innerHTML = `
            <div style="display: flex; align-items: flex-start; gap: 12px;">
                <i class="fas ${iconClass}" style="color: ${iconColor}; margin-top: 2px; flex-shrink: 0;"></i>
                <div style="flex: 1;">
                    <div style="font-weight: 600; margin-bottom: 2px;">${message}</div>
                </div>
                <button onclick="app.dismissToast('${toastId}')" 
                        style="background: none; border: none; color: var(--text-secondary); 
                               cursor: pointer; padding: 0; margin-left: 8px; font-size: 14px;"
                        title="Dismiss">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        container.appendChild(toast);

        // Animate in
        setTimeout(() => {
            toast.style.transform = 'translateX(0)';
        }, 100);

        // Auto remove
        setTimeout(() => {
            this.dismissToast(toastId);
        }, duration);
    }

    dismissToast(toastId) {
        const toast = document.getElementById(toastId);
        if (toast) {
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }
    }

    saveToStorage(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.error('Storage error:', e);
            this.showToast('Storage is full. Please clear some data.', 'warning');
        }
    }

    loadFromStorage(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('Storage error:', e);
            return null;
        }
    }

    savePackingList() {
        const key = this.getUserStorageKey('packing');
        this.saveToStorage(key, this.currentPackingList);
    }

    // Get user-namespaced storage key.
    // Trips keys MUST use the exact format: `trips_${userId}` when a userId is present.
    // For anonymous (no user) trips, the global key is `trips`.
    getUserStorageKey(baseKey, userId = null) {
        if (!userId) userId = this.currentUser ? this.currentUser.id : null;
        const keyBase = String(baseKey || '').toLowerCase();
        if (keyBase.includes('trip')) {
            return userId ? `trips_${userId}` : 'trips';
        }
        if (keyBase.includes('packing')) {
            return userId ? `packing_${userId}` : 'packing';
        }
        // fallback conservative format
        return userId ? `${baseKey}_${userId}` : baseKey;
    }

    // Clear old user data from localStorage before switching users
    // This prevents cross-user data leakage when users log in/out
    async clearOldUserData() {
        try {
            // NOTE: automatic clearing of trips and packing data disabled to avoid accidental data loss.
            // The previous implementation removed per-user `trips_<userId>` keys here which caused
            // user-created trips to disappear unexpectedly. Intentionally no-op now.
            // Legacy keys are intentionally left untouched; explicit logout logic should handle
            // user-scoped data lifecycle when required.
            // If you need to clear specific keys manually, call code that explicitly requests it.
        } catch (e) {
            console.error('Error clearing old user data:', e);
        }
    }

    // Load trips using the canonical per-user storage key. Always returns an array.
    // If `userId` is provided it uses that id; otherwise it fetches current user id.
    async loadTrips(userId = null) {
        try {
            if (!userId) userId = await this.getCurrentUserId();
            const key = userId ? `trips_${userId}` : 'trips';
            const raw = localStorage.getItem(key);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.error('[loadTrips] Failed to load trips from storage', e);
            return [];
        }
    }

    // Save trips array to the canonical per-user storage key.
    async saveTrips(trips, userId = null) {
        try {
            if (!userId) userId = await this.getCurrentUserId();
            const key = userId ? `trips_${userId}` : 'trips';
            localStorage.setItem(key, JSON.stringify(Array.isArray(trips) ? trips : []));
        } catch (e) {
            console.error('[saveTrips] Failed to save trips to storage', e);
        }
    }

    // Load per-user storage after login/signup
    async loadUserScopedStorage(userId) {
        try {
            console.log('Loading user-scoped storage for user:', userId);
            if (!userId) return;

            const userTripsKey = this.getUserStorageKey('trips', userId);
            const userPackingKey = this.getUserStorageKey('packing', userId);

            // Load trips via helper (ensures canonical key and array return)
            this.trips = await this.loadTrips(userId);
            // Prefer per-user saved packing; if empty, fall back to global anonymous packing and persist to user key
            const userPacking = this.loadFromStorage(userPackingKey) || {};
            if (userPacking && Object.keys(userPacking).length > 0) {
                this.currentPackingList = userPacking;
            } else {
                const globalPacking = this.loadFromStorage('packing') || {};
                this.currentPackingList = globalPacking || {};
                // persist merged/fallback into user key for future logins
                try { this.saveToStorage(userPackingKey, this.currentPackingList); } catch (e) { /* ignore */ }
            }
            console.log('Loaded', this.trips.length, 'trips for user', userId);
            // Ensure we clean invalid trip IDs immediately after loading
            this.cleanupLocalTrips(userId).catch(e => console.warn('cleanupLocalTrips failed in loadUserScopedStorage', e));
        } catch (e) {
            console.error('Error loading user-scoped storage:', e);
        }
    }

    // Cleanup: remove any Supabase trips whose id is not a valid UUID
    async cleanupInvalidSupabaseTripIds() {
        if (!supabaseClient || !this.currentUser) {
            console.log('[cleanup] Skipping cleanup: no authenticated user');
            return;
        }
        try {
            console.log('[cleanup] Fetching trips to scan for invalid IDs');
            const { data, error } = await supabaseClient.from('trips').select('id');
            if (error) {
                console.warn('[cleanup] Could not fetch trips:', error);
                return;
            }
            const invalid = (data || []).map(r => r.id).filter(id => !this.isValidUUID(String(id)));
            if (invalid.length === 0) {
                console.log('[cleanup] No invalid trip ids found');
                return;
            }
            console.log('[cleanup] Found invalid trip ids:', invalid.length);
            const { error: delErr } = await supabaseClient.from('trips').delete().in('id', invalid);
            if (delErr) {
                console.error('[cleanup] Failed to delete invalid trips:', delErr);
            } else {
                console.log('[cleanup] Deleted invalid trips successfully:', invalid.length);
            }
        } catch (e) {
            console.error('[cleanup] Error during cleanupInvalidSupabaseTripIds', e);
        }
    }

    // Cleanup localStorage trips for invalid IDs before rendering
    // Rules: remove trip if id does NOT match /^[0-9a-fA-F-]{36}$/ OR id is numeric OR id length !== 36
    async cleanupLocalTrips(userId = null) {
        try {
            const key = this.getUserStorageKey('trips', userId);
            const stored = this.loadFromStorage(key);
            if (!Array.isArray(stored) || stored.length === 0) return;
            const pattern = /^[0-9a-fA-F-]{36}$/;
            const cleaned = stored.filter(t => {
                const id = t && t.id;
                if (id === null || id === undefined) return false;
                const sid = String(id);
                // numeric ids
                if (/^[0-9]+$/.test(sid)) return false;
                if (sid.length !== 36) return false;
                if (!pattern.test(sid)) return false;
                return true;
            });
            if (cleaned.length !== stored.length) {
                console.log(`[cleanupLocalTrips] Removed ${stored.length - cleaned.length} invalid local trips for key=${key}`);
                this.saveToStorage(key, cleaned);
            }
            // Ensure in-memory reflects storage
            this.trips = this.loadFromStorage(key) || [];
        } catch (e) {
            console.error('[cleanupLocalTrips] Error cleaning local trips', e);
        }
    }

    // Save trips using per-user namespaced key
    saveUserTrips() {
        const userId = this.currentUser ? this.currentUser.id : null;
        if (userId) {
            const key = this.getUserStorageKey('trips', userId);
            this.saveToStorage(key, this.trips);
            // Ensure in-memory trips reflect what's in storage (storage is source-of-truth)
            this.trips = this.loadFromStorage(key) || [];
        } else {
            const key = this.getUserStorageKey('trips');
            this.saveToStorage(key, this.trips);
            this.trips = this.loadFromStorage(key) || [];
        }
    }

    // Local account fallback (for demo/offline when Supabase is unreachable)
    getLocalAccounts() {
        try {
            const data = localStorage.getItem('zipit_local_accounts');
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('Failed to read local accounts', e);
            return [];
        }
    }

    saveLocalAccount(email, password) {
        const accounts = this.getLocalAccounts();
        // Overwrite existing account with same email
        const filtered = accounts.filter(a => a.email !== email);
        filtered.push({ email, password, createdAt: new Date().toISOString() });
        this.saveToStorage('zipit_local_accounts', filtered);
    }

    findLocalAccount(email, password) {
        const accounts = this.getLocalAccounts();
        return accounts.find(a => a.email === email && a.password === password) || null;
    }

    // Additional utility methods
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

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    getTimeUntilTrip(startDate) {
        const now = new Date();
        const start = new Date(startDate);
        const diff = start - now;

        if (diff < 0) return 'Started';

        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        if (days === 0) return 'Today!';
        if (days === 1) return 'Tomorrow';
        return `${days} days`;
    }
}

// Global functions for inline event handlers
window.openModal = (modalId) => app.openModal(modalId);
window.closeModal = (modalId) => app.closeModal(modalId);

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ZipItApp();


    // Safe global shim: some inline handlers or third-party code may call
    // `showTransportSuggestions(...)` as a global function. Map that call
    // to the app instance method when available to avoid runtime errors
    // like "this.showTransportSuggestions is not a function".
    window.showTransportSuggestions = (...args) => {
        if (window.app && typeof window.app.showTransportSuggestions === 'function') {
            return window.app.showTransportSuggestions(...args);
        }
        console.warn('showTransportSuggestions called before app ready', args);
        return null;
    };

    // Safe global shim for openGoogleMapsRoute to avoid errors when called before app is ready.
    window.openGoogleMapsRoute = (...args) => {
        if (window.app && typeof window.app.openGoogleMapsRoute === 'function') {
            return window.app.openGoogleMapsRoute(...args);
        }
        console.warn('openGoogleMapsRoute called before app ready', args);
        return null;
    };
});

// Additional CSS for status badges and enhancements
const additionalStyles = `
<style>
.status-badge {
    font-size: var(--font-size-xs);
    font-weight: 600;
    padding: 4px 8px;
    border-radius: var(--radius-full);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.status-badge.upcoming {
    background: rgba(14, 165, 233, 0.15);
    color: var(--primary);
    border: 1px solid rgba(14, 165, 233, 0.3);
}

.status-badge.ongoing {
    background: rgba(16, 185, 129, 0.15);
    color: var(--success);
    border: 1px solid rgba(16, 185, 129, 0.3);
    animation: pulse 2s ease-in-out infinite;
}

.status-badge.completed {
    background: rgba(107, 114, 128, 0.15);
    color: var(--text-secondary);
    border: 1px solid rgba(107, 114, 128, 0.3);
}

.packing-item.checking {
    transform: scale(1.05);
    background: rgba(16, 185, 129, 0.2);
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
}

/* Enhanced focus styles */
.btn:focus-visible,
.form-control:focus-visible,
.packing-item:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
}

/* Mobile improvements */
@media (max-width: 640px) {
    .toast-container {
        right: 10px;
        left: 10px;
        max-width: none;
    }

    .floating-elements {
        display: none;
    }
}
</style>
`;

// Inject additional styles
document.head.insertAdjacentHTML('beforeend', additionalStyles);
