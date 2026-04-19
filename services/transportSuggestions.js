/**
 * Transport Suggestions Service
 * Fetches live suggestions from real APIs for flights, trains, buses, and routes
 * Falls back to mocked data if APIs fail or keys are missing
 */

class TransportSuggestionsService {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 60000; // 60 seconds
        this.debounceTimers = new Map();
        
        // API Configuration
        this.config = {
            amadeus: {
                clientId: process.env.AMADEUS_CLIENT_ID || '',
                clientSecret: process.env.AMADEUS_CLIENT_SECRET || '',
                baseUrl: 'https://api.amadeus.com/v2'
            },
            skyscanner: {
                apiKey: process.env.SKYSCANNER_API_KEY || '',
                baseUrl: 'https://api.skyscanner.com/v3'
            },
            kiwi: {
                apiKey: process.env.KIWI_API_KEY || '',
                baseUrl: 'https://tequila-api.kiwi.com'
            },
            rome2rio: {
                apiKey: process.env.ROME2RIO_API_KEY || '',
                baseUrl: 'https://api.rome2rio.com/v2'
            },
            indianRail: {
                apiKey: process.env.INDIAN_RAIL_API_KEY || '',
                baseUrl: 'https://indianrailapi.com/api'
            },
            redBus: {
                apiKey: process.env.REDBUS_API_KEY || '',
                baseUrl: 'https://www.redbus.in/api'
            },
            googleMaps: {
                apiKey: process.env.GOOGLE_MAPS_API_KEY || '',
                baseUrl: 'https://maps.googleapis.com/maps/api'
            }
        };
    }

    /**
     * Get transport suggestions based on mode and route
     * @param {Object} params - { mode, origin, destination, startDate, endDate }
     * @returns {Promise<Array>} Array of suggestions
     */
    async getSuggestions(params) {
        const { mode, origin, destination, startDate, endDate } = params;
        
        if (!mode || !origin || !destination) {
            console.warn('Invalid parameters for transport suggestions', params);
            return this._getMockSuggestions(mode, destination, startDate, endDate);
        }

        const cacheKey = `${mode}:${origin}:${destination}:${startDate}`;
        
        // Check cache
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                console.debug('Using cached transport suggestions for', cacheKey);
                return cached.data;
            }
        }

        try {
            let suggestions = [];
            
            switch (mode.toLowerCase()) {
                case 'flight':
                    suggestions = await this._getFlightSuggestions(origin, destination, startDate, endDate);
                    break;
                case 'train':
                    suggestions = await this._getTrainSuggestions(origin, destination, startDate);
                    break;
                case 'bus':
                    suggestions = await this._getBusSuggestions(origin, destination, startDate);
                    break;
                case 'car':
                case 'bike':
                case 'motorcycle':
                case 'ferry':
                    suggestions = await this._getRouteSuggestions(mode, origin, destination);
                    break;
                default:
                    suggestions = await this._getMultimodalSuggestions(origin, destination, startDate);
            }

            // Cache the results
            if (suggestions && suggestions.length > 0) {
                this.cache.set(cacheKey, {
                    data: suggestions,
                    timestamp: Date.now()
                });
            }

            return suggestions;
        } catch (error) {
            console.error('Error fetching transport suggestions:', error);
            // Fallback to mocked suggestions
            return this._getMockSuggestions(mode, destination, startDate, endDate);
        }
    }

    /**
     * Get flight suggestions from Amadeus, Skyscanner, or Kiwi API
     */
    async _getFlightSuggestions(origin, destination, startDate, endDate) {
        console.debug('Fetching flight suggestions from', origin, 'to', destination);
        
        try {
            // Try Amadeus API first (most reliable for India routes)
            if (this.config.amadeus.clientId && this.config.amadeus.clientSecret) {
                return await this._amadeusFlightSearch(origin, destination, startDate, endDate);
            }
            
            // Fallback to Skyscanner
            if (this.config.skyscanner.apiKey) {
                return await this._skyscannerFlightSearch(origin, destination, startDate, endDate);
            }
            
            // Fallback to Kiwi/Tequila
            if (this.config.kiwi.apiKey) {
                return await this._kiwiFlightSearch(origin, destination, startDate, endDate);
            }
        } catch (error) {
            console.error('Flight API error:', error);
        }

        // Ultimate fallback: mocked data
        return this._getMockFlightSuggestions(origin, destination, startDate);
    }

    /**
     * Amadeus Flight Offers Search
     */
    async _amadeusFlightSearch(origin, destination, startDate, endDate) {
        // Note: Amadeus requires backend proxy for auth token
        // For now, return empty array to trigger fallback
        console.debug('Amadeus flight search not configured (requires backend proxy)');
        return [];
    }

    /**
     * Skyscanner Flight Search
     */
    async _skyscannerFlightSearch(origin, destination, startDate, endDate) {
        console.debug('Searching Skyscanner for flights');
        
        try {
            const response = await fetch(
                `/api/proxyTransport/skyscanner/flights?origin=${origin}&destination=${destination}&startDate=${startDate}&endDate=${endDate}`,
                { headers: { 'X-API-Key': this.config.skyscanner.apiKey } }
            );
            
            if (!response.ok) throw new Error(`Skyscanner API error: ${response.status}`);
            
            const data = await response.json();
            return this._mapSkyscannerResults(data);
        } catch (error) {
            console.error('Skyscanner error:', error);
            return [];
        }
    }

    /**
     * Kiwi/Tequila Flight Search
     */
    async _kiwiFlightSearch(origin, destination, startDate, endDate) {
        console.debug('Searching Kiwi for flights');
        
        try {
            const params = new URLSearchParams({
                fly_from: this._getLocationCode(origin),
                fly_to: this._getLocationCode(destination),
                date_from: startDate,
                date_to: endDate,
                sort: 'price',
                limit: 5
            });
            
            const response = await fetch(
                `${this.config.kiwi.baseUrl}/search?${params}&apikey=${this.config.kiwi.apiKey}`,
                { mode: 'cors' }
            );
            
            if (!response.ok) throw new Error(`Kiwi API error: ${response.status}`);
            
            const data = await response.json();
            return this._mapKiwiResults(data);
        } catch (error) {
            console.error('Kiwi error:', error);
            return [];
        }
    }

    /**
     * Get train suggestions (India)
     */
    async _getTrainSuggestions(origin, destination, startDate) {
        console.debug('Fetching train suggestions for', origin, 'to', destination);
        
        try {
            if (this.config.indianRail.apiKey) {
                return await this._indianRailSearch(origin, destination, startDate);
            }
        } catch (error) {
            console.error('Train API error:', error);
        }

        return this._getMockTrainSuggestions(origin, destination);
    }

    /**
     * Indian Rail API Search
     */
    async _indianRailSearch(origin, destination, startDate) {
        console.debug('Searching Indian Railways');
        
        try {
            const response = await fetch(
                `/api/proxyTransport/indianRail/trains?from=${origin}&to=${destination}&date=${startDate}`,
                { headers: { 'X-API-Key': this.config.indianRail.apiKey } }
            );
            
            if (!response.ok) throw new Error(`IndianRail API error: ${response.status}`);
            
            const data = await response.json();
            return this._mapIndianRailResults(data);
        } catch (error) {
            console.error('IndianRail error:', error);
            return [];
        }
    }

    /**
     * Get bus suggestions (India)
     */
    async _getBusSuggestions(origin, destination, startDate) {
        console.debug('Fetching bus suggestions for', origin, 'to', destination);
        
        try {
            if (this.config.redBus.apiKey) {
                return await this._redBusSearch(origin, destination, startDate);
            }
        } catch (error) {
            console.error('Bus API error:', error);
        }

        return this._getMockBusSuggestions(origin, destination);
    }

    /**
     * RedBus API Search
     */
    async _redBusSearch(origin, destination, startDate) {
        console.debug('Searching RedBus');
        
        try {
            const response = await fetch(
                `/api/proxyTransport/redBus/buses?from=${origin}&to=${destination}&date=${startDate}`,
                { headers: { 'X-API-Key': this.config.redBus.apiKey } }
            );
            
            if (!response.ok) throw new Error(`RedBus API error: ${response.status}`);
            
            const data = await response.json();
            return this._mapRedBusResults(data);
        } catch (error) {
            console.error('RedBus error:', error);
            return [];
        }
    }

    /**
     * Get route suggestions for car, bike, ferry (Google Maps)
     */
    async _getRouteSuggestions(mode, origin, destination) {
        console.debug('Fetching route for', mode, 'from', origin, 'to', destination);
        
        try {
            if (this.config.googleMaps.apiKey) {
                return await this._googleMapsRoute(mode, origin, destination);
            }
        } catch (error) {
            console.error('Route API error:', error);
        }

        return this._getMockRouteSuggestions(mode, origin, destination);
    }

    /**
     * Google Maps Directions API
     */
    async _googleMapsRoute(mode, origin, destination) {
        console.debug('Querying Google Maps Directions');
        
        try {
            // Map mode to travel mode for Google Maps
            const travelModes = {
                'car': 'DRIVING',
                'bike': 'BICYCLING',
                'motorcycle': 'DRIVING', // Use DRIVING for motorcycle
                'ferry': 'TRANSIT' // Use TRANSIT for ferry
            };
            
            const travelMode = travelModes[mode.toLowerCase()] || 'DRIVING';
            
            const response = await fetch(
                `/api/proxyTransport/googleMaps/directions?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=${travelMode}&alternatives=true`,
                { headers: { 'X-API-Key': this.config.googleMaps.apiKey } }
            );
            
            if (!response.ok) throw new Error(`Google Maps API error: ${response.status}`);
            
            const data = await response.json();
            return this._mapGoogleMapsResults(data, mode);
        } catch (error) {
            console.error('Google Maps error:', error);
            return [];
        }
    }

    /**
     * Get multimodal suggestions (Rome2rio fallback)
     */
    async _getMultimodalSuggestions(origin, destination, startDate) {
        console.debug('Fetching multimodal suggestions from Rome2rio');
        
        try {
            if (this.config.rome2rio.apiKey) {
                return await this._rome2rioSearch(origin, destination, startDate);
            }
        } catch (error) {
            console.error('Rome2rio error:', error);
        }

        return this._getMockSuggestions('multimodal', destination, startDate);
    }

    /**
     * Rome2rio API Search
     */
    async _rome2rioSearch(origin, destination, startDate) {
        console.debug('Searching Rome2rio');
        
        try {
            const response = await fetch(
                `/api/proxyTransport/rome2rio/routes?from=${origin}&to=${destination}&date=${startDate}`,
                { headers: { 'X-API-Key': this.config.rome2rio.apiKey } }
            );
            
            if (!response.ok) throw new Error(`Rome2rio API error: ${response.status}`);
            
            const data = await response.json();
            return this._mapRome2rioResults(data);
        } catch (error) {
            console.error('Rome2rio error:', error);
            return [];
        }
    }

    /**
     * Map Skyscanner results to app schema
     */
    _mapSkyscannerResults(data) {
        if (!data || !data.itineraries) return [];
        
        return data.itineraries.slice(0, 5).map((item, idx) => ({
            id: `skyscanner-${idx}`,
            mode: 'flight',
            provider: data.legs?.[0]?.operatingCarrier?.name || 'Skyscanner Flight',
            title: data.legs?.[0]?.operatingCarrier?.name || 'Flight Offer',
            depart: item.outbound?.[0]?.departureTime || 'TBD',
            arrive: item.outbound?.[0]?.arrivalTime || 'TBD',
            duration: item.outbound?.[0]?.duration || '0',
            price: item.pricingOptions?.[0]?.price?.amount || 'N/A',
            bookingUrl: item.pricingOptions?.[0]?.agents?.[0] || null
        }));
    }

    /**
     * Map Kiwi results to app schema
     */
    _mapKiwiResults(data) {
        if (!data || !data.data) return [];
        
        return data.data.slice(0, 5).map((flight, idx) => ({
            id: `kiwi-${idx}`,
            mode: 'flight',
            provider: flight.airlines?.join(', ') || 'Kiwi Flight',
            title: `${flight.airlines?.join(', ') || 'Flight'} - ${flight.route?.map(r => r.airline).join(', ')}`,
            depart: new Date(flight.dTime * 1000).toLocaleString(),
            arrive: new Date(flight.aTime * 1000).toLocaleString(),
            duration: `${Math.floor(flight.fly_duration / 3600)}h ${Math.floor((flight.fly_duration % 3600) / 60)}m`,
            price: `₹${flight.price || 'N/A'}`,
            bookingUrl: flight.deep_link || null
        }));
    }

    /**
     * Map IndianRail results to app schema
     */
    _mapIndianRailResults(data) {
        if (!data || !data.trains) return [];
        
        return data.trains.slice(0, 5).map((train, idx) => ({
            id: `indianrail-${idx}`,
            mode: 'train',
            provider: train.trainName || `Train ${train.trainNumber}`,
            title: `${train.trainNumber} - ${train.trainName}`,
            depart: train.departureTime || 'TBD',
            arrive: train.arrivalTime || 'TBD',
            duration: train.duration || '0',
            price: `₹${train.price || 'N/A'}`,
            availability: train.availableSeats || 'Check'
        }));
    }

    /**
     * Map RedBus results to app schema
     */
    _mapRedBusResults(data) {
        if (!data || !data.buses) return [];
        
        return data.buses.slice(0, 5).map((bus, idx) => ({
            id: `redbus-${idx}`,
            mode: 'bus',
            provider: bus.operatorName || 'Bus Operator',
            title: bus.operatorName || 'Bus Service',
            depart: bus.departureTime || 'TBD',
            arrive: bus.arrivalTime || 'TBD',
            duration: bus.duration || '0',
            price: `₹${bus.price || 'N/A'}`,
            availableSeats: bus.availableSeats || 'Check',
            bookingUrl: bus.bookingUrl || null
        }));
    }

    /**
     * Map Google Maps results to app schema
     */
    _mapGoogleMapsResults(data, mode) {
        if (!data || !data.routes) return [];
        
        // Pick the shortest route by distance
        const shortestRoute = data.routes.reduce((min, route) => {
            const distance = route.legs.reduce((sum, leg) => sum + leg.distance.value, 0);
            const minDistance = min.legs.reduce((sum, leg) => sum + leg.distance.value, 0);
            return distance < minDistance ? route : min;
        });
        
        return [{
            id: 'google-maps-route',
            mode: mode,
            provider: `Google Maps ${mode.charAt(0).toUpperCase() + mode.slice(1)} Route`,
            title: `Shortest ${mode} Route`,
            depart: 'Now',
            arrive: this._addMinutesToTime(new Date(), shortestRoute.legs[0]?.duration?.value || 0),
            duration: this._formatDuration(shortestRoute.legs.reduce((sum, leg) => sum + leg.duration.value, 0)),
            distance: `${(shortestRoute.legs.reduce((sum, leg) => sum + leg.distance.value, 0) / 1000).toFixed(1)} km`,
            routeData: shortestRoute,
            isRoute: true
        }];
    }

    /**
     * Map Rome2rio results to app schema
     */
    _mapRome2rioResults(data) {
        if (!data || !data.routes) return [];
        
        return data.routes.slice(0, 5).map((route, idx) => ({
            id: `rome2rio-${idx}`,
            mode: route.segments?.[0]?.kind || 'multimodal',
            provider: route.name || 'Rome2rio Route',
            title: route.name || 'Multimodal Route',
            depart: route.departureTime || 'TBD',
            arrive: route.arrivalTime || 'TBD',
            duration: route.totalDuration || '0',
            price: `${route.distance || 'N/A'} km`,
            bookingUrl: route.bookingUrl || null
        }));
    }

    /**
     * Mock suggestions (fallback)
     */
    _getMockSuggestions(mode, destination, startDate, endDate) {
        const modeType = mode?.toLowerCase() || 'flight';
        
        if (modeType === 'flight') {
            return this._getMockFlightSuggestions(destination, destination, startDate);
        } else if (modeType === 'train') {
            return this._getMockTrainSuggestions(destination, destination);
        } else if (modeType === 'bus') {
            return this._getMockBusSuggestions(destination, destination);
        } else if (['car', 'bike', 'motorcycle', 'ferry'].includes(modeType)) {
            return this._getMockRouteSuggestions(modeType, destination, destination);
        }
        
        return [];
    }

    _getMockFlightSuggestions(origin, destination, startDate) {
        return [
            {
                id: 'mock-flight-1',
                mode: 'flight',
                provider: 'IndiGo',
                title: 'IndiGo Flight',
                depart: '10:00 AM',
                arrive: '12:30 PM',
                duration: '2h 30m',
                price: '₹5,999'
            },
            {
                id: 'mock-flight-2',
                mode: 'flight',
                provider: 'Air India',
                title: 'Air India Flight',
                depart: '02:15 PM',
                arrive: '04:45 PM',
                duration: '2h 30m',
                price: '₹7,499'
            }
        ];
    }

    _getMockTrainSuggestions(origin, destination) {
        return [
            {
                id: 'mock-train-1',
                mode: 'train',
                provider: 'Express 1234',
                title: 'Rajdhani Express',
                depart: '06:00 PM',
                arrive: '08:30 AM +1',
                duration: '14h 30m',
                price: '₹2,500',
                availability: 'Available'
            }
        ];
    }

    _getMockBusSuggestions(origin, destination) {
        return [
            {
                id: 'mock-bus-1',
                mode: 'bus',
                provider: 'RedBus Services',
                title: 'RedBus AC Service',
                depart: '11:00 PM',
                arrive: '06:00 AM +1',
                duration: '7h',
                price: '₹800',
                availableSeats: '15 Seats'
            }
        ];
    }

    _getMockRouteSuggestions(mode, origin, destination) {
        return [
            {
                id: 'mock-route-1',
                mode: mode,
                provider: `${mode.charAt(0).toUpperCase() + mode.slice(1)} Route`,
                title: `${mode.charAt(0).toUpperCase() + mode.slice(1)} via shortest path`,
                depart: 'Now',
                arrive: 'In ~2h 15m',
                duration: '2h 15m',
                distance: '180 km'
            }
        ];
    }

    /**
     * Utility: Get IATA code or location code from city name
     */
    _getLocationCode(location) {
        // Simple mapping of common cities to IATA codes
        const codeMap = {
            'mumbai': 'BOM',
            'delhi': 'DEL',
            'bangalore': 'BLR',
            'hyderabad': 'HYD',
            'goa': 'GOI',
            'pune': 'PNQ',
            'kolkata': 'CCU',
            'chennai': 'MAA',
            'jaipur': 'JAI',
            'lucknow': 'LKO'
        };
        
        const key = location.toLowerCase().split(',')[0].trim();
        return codeMap[key] || location;
    }

    /**
     * Utility: Format duration in milliseconds
     */
    _formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    }

    /**
     * Utility: Add minutes to time
     */
    _addMinutesToTime(date, seconds) {
        const newDate = new Date(date.getTime() + seconds * 1000);
        return newDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.transportSuggestions = new TransportSuggestionsService();
}
