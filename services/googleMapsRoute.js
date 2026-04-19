/**
 * Google Maps Route Handler
 * Manages route rendering for car, bike, and ferry modes
 */

class GoogleMapsRouteHandler {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.map = null;
        this.directionsService = null;
        this.directionsRenderer = null;
        this.isInitialized = false;
        this.loadPromise = null;
    }

    /**
     * Initialize Google Maps API if not already loaded (service only, no map)
     */
    async initializeServiceOnly() {
        if (this.isInitialized) return true;

        // Check if Google Maps is already loaded
        if (window.google && window.google.maps) {
            console.debug('Google Maps API already loaded');
            this._setupServiceOnly();
            this.isInitialized = true;
            return true;
        }

        // Load Google Maps asynchronously
        if (!this.loadPromise) {
            this.loadPromise = new Promise((resolve, reject) => {
                if (!this.apiKey) {
                    console.warn('Google Maps API key not configured');
                    reject(new Error('Google Maps API key missing'));
                    return;
                }

                const script = document.createElement('script');
                script.src = `https://maps.googleapis.com/maps/api/js?key=${this.apiKey}&libraries=places,routes`;
                script.async = true;
                script.defer = true;

                script.onload = () => {
                    console.debug('Google Maps API loaded');
                    this._setupServiceOnly();
                    this.isInitialized = true;
                    resolve(true);
                };

                script.onerror = () => {
                    console.error('Failed to load Google Maps API');
                    reject(new Error('Google Maps API failed to load'));
                };

                document.head.appendChild(script);
            });
        }

        return this.loadPromise;
    }

    /**
     * Setup directions service only (no map rendering)
     */
    _setupServiceOnly() {
        // Initialize services only
        this.directionsService = new window.google.maps.DirectionsService();
        console.debug('Google Maps DirectionsService initialized');
    }

    /**
     * Setup map instance and services
     */
    _setupMapsInstance(containerElementId) {
        const container = document.getElementById(containerElementId);
        if (!container) {
            console.warn(`Map container not found: ${containerElementId}`);
            return;
        }

        // Create map centered on India
        this.map = new window.google.maps.Map(container, {
            center: { lat: 20.5937, lng: 78.9629 },
            zoom: 5,
            mapTypeId: 'roadmap'
        });

        // Initialize services
        this.directionsService = new window.google.maps.DirectionsService();
        this.directionsRenderer = new window.google.maps.DirectionsRenderer({
            map: this.map,
            polylineOptions: {
                strokeColor: '#0EA5E9',
                strokeWeight: 4,
                strokeOpacity: 0.8
            }
        });

        console.debug('Google Maps instances initialized');
    }

    /**
     * Calculate and render route on map
     * @param {string} origin - Starting location
     * @param {string} destination - Destination location
     * @param {string} travelMode - DRIVING, BICYCLING, WALKING, TRANSIT
     * @returns {Promise<Object>} Route result with distance and duration
     */
    async renderRoute(origin, destination, travelMode = 'DRIVING') {
        if (!this.isInitialized) {
            throw new Error('Google Maps not initialized');
        }

        return new Promise((resolve, reject) => {
            const request = {
                origin: origin,
                destination: destination,
                travelMode: travelMode,
                alternatives: true, // Get alternative routes
                region: 'IN' // Region bias for India
            };

            this.directionsService.route(request, (result, status) => {
                if (status === window.google.maps.DirectionsStatus.OK) {
                    // Find shortest route
                    let shortestRoute = result.routes[0];
                    let shortestDistance = this._calculateDistance(shortestRoute);

                    result.routes.forEach(route => {
                        const distance = this._calculateDistance(route);
                        if (distance < shortestDistance) {
                            shortestDistance = distance;
                            shortestRoute = route;
                        }
                    });

                    // Render the shortest route
                    this.directionsRenderer.setDirections(result);
                    this.directionsRenderer.setRouteIndex(result.routes.indexOf(shortestRoute));

                    // Extract route info
                    const leg = shortestRoute.legs[0];
                    const duration = this._calculateDuration(shortestRoute);

                    resolve({
                        success: true,
                        distance: `${(shortestDistance / 1000).toFixed(1)} km`,
                        distanceMeters: shortestDistance,
                        duration: duration,
                        durationSeconds: this._calculateDurationSeconds(shortestRoute),
                        route: shortestRoute,
                        startAddress: leg.start_address,
                        endAddress: leg.end_address
                    });
                } else {
                    console.error('Directions request failed:', status);
                    reject(new Error(`Directions request failed: ${status}`));
                }
            });
        });
    }

    /**
     * Calculate route without rendering (for background calculations)
     * @param {string} origin - Starting location
     * @param {string} destination - Destination location
     * @param {string} travelMode - DRIVING, BICYCLING, WALKING, TRANSIT
     * @returns {Promise<Object>} Route result with distance and duration
     */
    async calculateRoute(origin, destination, travelMode = 'DRIVING') {
        if (!this.isInitialized) {
            await this.initializeServiceOnly();
        }

        return new Promise((resolve, reject) => {
            const request = {
                origin: origin,
                destination: destination,
                travelMode: travelMode,
                alternatives: true, // Get alternative routes to find shortest
                region: 'IN' // Region bias for India
            };

            this.directionsService.route(request, (result, status) => {
                if (status === window.google.maps.DirectionsStatus.OK) {
                    // Find shortest route
                    let shortestRoute = result.routes[0];
                    let shortestDistance = this._calculateDistance(shortestRoute);

                    result.routes.forEach(route => {
                        const distance = this._calculateDistance(route);
                        if (distance < shortestDistance) {
                            shortestDistance = distance;
                            shortestRoute = route;
                        }
                    });

                    // Extract route info
                    const leg = shortestRoute.legs[0];
                    const duration = this._calculateDuration(shortestRoute);

                    resolve({
                        success: true,
                        distance: `${(shortestDistance / 1000).toFixed(1)} km`,
                        distanceMeters: shortestDistance,
                        duration: duration,
                        durationSeconds: this._calculateDurationSeconds(shortestRoute),
                        overviewPolyline: shortestRoute.overview_polyline,
                        route: shortestRoute,
                        startAddress: leg.start_address,
                        endAddress: leg.end_address
                    });
                } else {
                    console.error('Directions request failed:', status);
                    reject(new Error(`Directions request failed: ${status}`));
                }
            });
        });
    }

    /**
     * Calculate total distance of route in meters
     */
    _calculateDistance(route) {
        return route.legs.reduce((sum, leg) => sum + leg.distance.value, 0);
    }

    /**
     * Calculate total duration of route in seconds
     */
    _calculateDurationSeconds(route) {
        return route.legs.reduce((sum, leg) => sum + leg.duration.value, 0);
    }

    /**
     * Format duration for display
     */
    _calculateDuration(route) {
        const seconds = this._calculateDurationSeconds(route);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }
}

// Export for use
if (typeof window !== 'undefined') {
    window.GoogleMapsRouteHandler = GoogleMapsRouteHandler;
}
