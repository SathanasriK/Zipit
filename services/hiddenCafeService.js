// services/hiddenCafeService.js
// Uses the Google Maps JavaScript API (PlacesService + Geocoder) to avoid CORS.
// Requires: <script src="https://maps.googleapis.com/maps/api/js?libraries=places,geometry">
// loaded in index.html BEFORE this file.

class HiddenCafeService {

    // -------------------------------------------------------------------------
    // Chain names to exclude so results feel like genuine hidden gems
    // -------------------------------------------------------------------------
    _isBigChain(name) {
        var chains = [
            'starbucks', 'mcdonald', 'costa', 'cafe coffee day', 'ccd',
            'barista', 'dunkin', 'tim horton', 'peet\'s', 'caribou',
            'second cup', 'lavazza', 'mccafe', 'subway', 'kfc', 'burger king',
            'domino', 'pizza hut', 'nescafe', 'caffe nero', 'theobroma',
            'chaayos', 'chai point', 'wow! momo'
        ];
        var lower = (name || '').toLowerCase();
        return chains.some(function (chain) { return lower.includes(chain); });
    }

    // -------------------------------------------------------------------------
    // Step 1: Geocode destination → {lat, lng}   (uses google.maps.Geocoder)
    // -------------------------------------------------------------------------
    _geocode(destination) {
        return new Promise(function (resolve, reject) {
            if (typeof google === 'undefined' || !google.maps || !google.maps.Geocoder) {
                reject(new Error('Google Maps JS API not loaded'));
                return;
            }
            var geocoder = new google.maps.Geocoder();
            geocoder.geocode({ address: destination }, function (results, status) {
                if (status === google.maps.GeocoderStatus.OK && results && results.length > 0) {
                    var loc = results[0].geometry.location;
                    resolve({ lat: loc.lat(), lng: loc.lng() });
                } else {
                    reject(new Error('Geocoding failed: ' + status));
                }
            });
        });
    }

    // -------------------------------------------------------------------------
    // Step 2: Nearby Search for cafes within 5 km  (uses PlacesService)
    // PlacesService requires a map or a DOM node to attach to – we use a
    // hidden div so we never render a visible map.
    // -------------------------------------------------------------------------
    _nearbySearch(lat, lng) {
        return new Promise(function (resolve, reject) {
            if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
                reject(new Error('Google Maps Places library not loaded'));
                return;
            }
            // PlacesService needs a map or HTMLElement
            var fakeDiv = document.createElement('div');
            var service = new google.maps.places.PlacesService(fakeDiv);

            var request = {
                location: new google.maps.LatLng(lat, lng),
                radius: 5000,           // 5 km
                type: 'cafe'
            };

            service.nearbySearch(request, function (results, status) {
                if (
                    status === google.maps.places.PlacesServiceStatus.OK ||
                    status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS
                ) {
                    resolve(results || []);
                } else {
                    reject(new Error('PlacesService nearbySearch failed: ' + status));
                }
            });
        });
    }

    // -------------------------------------------------------------------------
    // Public: main entry point
    // -------------------------------------------------------------------------
    async getHiddenCafes(destination) {
        if (!destination) throw new Error('Destination is required');

        try {
            // --- Geocode the destination string ---
            var coords = await this._geocode(destination);

            // --- Fetch nearby cafes with the JS Places Library ---
            var places = await this._nearbySearch(coords.lat, coords.lng);

            var self = this;

            // --- Map to the internal shape NearbyHiddenCafes.js expects ---
            var allCafes = places.map(function (place) {
                var loc = place.geometry && place.geometry.location;
                return {
                    id: place.place_id,
                    name: place.name,           // exact name from Google Places
                    rating: typeof place.rating === 'number' ? place.rating : 0,
                    userRatingsTotal: typeof place.user_ratings_total === 'number'
                        ? place.user_ratings_total : 0,
                    address: place.vicinity || 'Address not available',
                    lat: loc ? loc.lat() : null,
                    lng: loc ? loc.lng() : null,
                    isMock: false
                };
            });

            // --- Hidden gem filter ---
            //   rating >= 4.2
            //   10 <= reviews <= 500  (avoids both unknowns and very famous chains)
            //   not a big brand chain
            var hiddenGems = allCafes.filter(function (c) {
                return c.rating >= 4.2
                    && c.userRatingsTotal >= 10
                    && c.userRatingsTotal <= 500
                    && !self._isBigChain(c.name);
            });

            // Sort by rating desc, take top 8
            hiddenGems.sort(function (a, b) { return b.rating - a.rating; });

            // Relaxed fallback if strict filter yields < 3 results
            if (hiddenGems.length < 3) {
                var relaxed = allCafes
                    .filter(function (c) {
                        return c.rating >= 4.0
                            && c.userRatingsTotal <= 1000
                            && !self._isBigChain(c.name);
                    })
                    .sort(function (a, b) { return b.rating - a.rating; })
                    .slice(0, 6);

                return relaxed.length ? relaxed : allCafes.slice(0, 6);
            }

            return hiddenGems.slice(0, 8);

        } catch (error) {
            // API unavailable (Maps JS not loaded, key invalid, etc.) → demo data
            console.warn(
                'HiddenCafeService: Falling back to demo data. Reason:', error.message || error
            );
            return this._getMockCafes(destination);
        }
    }

    // -------------------------------------------------------------------------
    // Demo data – clearly labelled so users know these are not real results
    // -------------------------------------------------------------------------
    _getMockCafes(destination) {
        return [
            { id: 'demo-1', name: 'The Quiet Brew – Demo Data', rating: 4.6, userRatingsTotal: 87, address: '12 Cobblestone Lane, ' + destination, lat: null, lng: null, isMock: true },
            { id: 'demo-2', name: 'Morning Light Café – Demo Data', rating: 4.8, userRatingsTotal: 54, address: '3 Sunrise Alley, ' + destination, lat: null, lng: null, isMock: true },
            { id: 'demo-3', name: 'Hidden Roast – Demo Data', rating: 4.5, userRatingsTotal: 130, address: 'Old Market Quarter, ' + destination, lat: null, lng: null, isMock: true },
            { id: 'demo-4', name: 'Bookshelves & Beans – Demo Data', rating: 4.7, userRatingsTotal: 68, address: '7 Library Row, ' + destination, lat: null, lng: null, isMock: true },
            { id: 'demo-5', name: 'The Artisan Corner – Demo Data', rating: 4.4, userRatingsTotal: 110, address: 'Arts District, ' + destination, lat: null, lng: null, isMock: true },
            { id: 'demo-6', name: 'Courtyard Espresso – Demo Data', rating: 4.9, userRatingsTotal: 42, address: 'Inner Courtyard, ' + destination, lat: null, lng: null, isMock: true },
        ];
    }
}

// Make accessible globally
window.hiddenCafeService = new HiddenCafeService();
