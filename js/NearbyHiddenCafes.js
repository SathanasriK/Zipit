// js/NearbyHiddenCafes.js
class NearbyHiddenCafes {
    constructor(containerId) {
        this.containerId = containerId || 'nearby-hidden-cafes-section';
    }

    render(parentElementSelector) {
        // Create container if it doesn't exist
        let container = document.getElementById(this.containerId);

        if (!container) {
            container = document.createElement('div');
            container.id = this.containerId;
            container.className = 'hidden-cafes-container';
            // Match the existing look without touching the shared CSS file
            container.style.marginTop = '2rem';
            container.style.padding = '1.5rem';
            container.style.background = 'var(--surface)';
            container.style.borderRadius = '12px';
            container.style.boxShadow = 'var(--shadow-md)';

            container.innerHTML = [
                '<div class="section-header" style="margin-bottom: 1.5rem;">',
                '    <h2 class="section-title" style="margin: 0; display: flex; align-items: center; gap: 0.5rem; font-size: 1.5rem;">',
                '        ☕ Hidden Gems – Underrated Cafés',
                '    </h2>',
                '    <p style="margin: 0.5rem 0 0; color: var(--text-secondary); font-size: 0.9rem;">Discover charming, lesser-known cafés loved by locals</p>',
                '</div>',
                '<div id="hidden-cafes-content" class="hidden-cafes-content"></div>'
            ].join('');

            const parentElement = document.querySelector(parentElementSelector);
            if (parentElement) {
                parentElement.appendChild(container);
            } else {
                console.error('NearbyHiddenCafes: Parent element not found:', parentElementSelector);
                return;
            }
        } else {
            // Reset content div for a fresh load
            var contentDiv = document.getElementById('hidden-cafes-content');
            if (contentDiv) contentDiv.innerHTML = '';
        }
    }

    async loadCafes(destination) {
        var contentDiv = document.getElementById('hidden-cafes-content');
        if (!contentDiv) return;

        // Loading State
        contentDiv.innerHTML = [
            '<div class="loading-state" style="text-align: center; padding: 2rem;">',
            '    <i class="fas fa-spinner fa-spin fa-2x" style="color: var(--primary);"></i>',
            '    <p style="margin-top: 1rem; color: var(--text-secondary);">Scouting hidden gem cafés in ' + destination + '...</p>',
            '</div>'
        ].join('');

        try {
            var cafes = await window.hiddenCafeService.getHiddenCafes(destination);

            if (!cafes || cafes.length === 0) {
                // Empty State
                contentDiv.innerHTML = [
                    '<div class="empty-state" style="text-align: center; padding: 2rem;">',
                    '    <i class="fas fa-search fa-2x" style="color: var(--text-secondary); margin-bottom: 1rem;"></i>',
                    '    <p style="color: var(--text-secondary);">No hidden gem cafés found for this destination. Try exploring locally!</p>',
                    '</div>'
                ].join('');
                return;
            }

            // Check if we are showing demo data so we can show a notice banner
            var allMock = cafes.every(function (c) { return c.isMock; });
            var demoBanner = allMock
                ? '<p style="text-align:center; margin-bottom: 1rem; padding: 0.5rem 1rem; background: rgba(245,158,11,0.12); border-radius: 8px; color: #92400e; font-size: 0.85rem;">'
                + '<i class="fas fa-exclamation-circle" style="margin-right: 0.4rem;"></i>'
                + '<strong>Demo data</strong> – Live API unavailable. These are sample cafés, not real results.</p>'
                : '';

            // Render grid
            var gridParts = [
                demoBanner,
                '<div class="cafes-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem;">'
            ];

            cafes.forEach(function (cafe) {
                // ---------------------------------------------------------------
                // Map link:
                //   Real data  → query=LAT,LNG&query_place_id=PLACE_ID  (exact pin)
                //   Demo data  → text search on name + address
                // ---------------------------------------------------------------
                var mapLink;
                if (cafe.lat && cafe.lng && !cafe.isMock) {
                    mapLink = 'https://www.google.com/maps/search/?api=1'
                        + '&query=' + cafe.lat + ',' + cafe.lng
                        + '&query_place_id=' + encodeURIComponent(cafe.id || '');
                } else {
                    mapLink = 'https://www.google.com/maps/search/?api=1'
                        + '&query=' + encodeURIComponent((cafe.name || '') + ' ' + (cafe.address || ''));
                }

                // The name is used exactly as returned by the API (or the demo label)
                var cafeName = cafe.name || 'Unknown Café';
                var cafeAddress = cafe.address || 'Address not available';
                var cafeRating = typeof cafe.rating === 'number' ? cafe.rating.toFixed(1) : cafe.rating;

                var reviewCountHtml = typeof cafe.userRatingsTotal === 'number'
                    ? '<span style="margin-left: 0.5rem; color: var(--text-muted); font-size: 0.8rem; font-weight: normal;">• ' + cafe.userRatingsTotal + ' reviews</span>'
                    : '';

                // Optional demo badge per card
                var demoBadgeHtml = cafe.isMock
                    ? '<span style="font-size: 0.7rem; background: #fef3c7; color: #92400e; border-radius: 4px; padding: 1px 6px; margin-left: 0.4rem; vertical-align: middle; font-weight: 600;">DEMO</span>'
                    : '';

                gridParts.push([
                    '<div class="template-card" style="display: flex; flex-direction: column; height: 100%; border: 1px solid var(--border); border-radius: 8px; padding: 1rem; background: var(--bg-primary);">',
                    '    <div class="template-header" style="align-items: flex-start; flex-direction: column; gap: 0.5rem; border-bottom: none; padding-bottom: 0;">',
                    '        <h3 style="margin: 0; font-size: 1.1rem; color: var(--text-primary); line-height: 1.3;">☕ ' + cafeName + demoBadgeHtml + '</h3>',
                    '        <div style="display: flex; align-items: center; gap: 0.25rem; color: #f59e0b; font-size: 0.9rem;">',
                    '            <i class="fas fa-star"></i>',
                    '            <span style="font-weight: 600; color: var(--text-secondary);">' + cafeRating + '</span>',
                    reviewCountHtml,
                    '        </div>',
                    '    </div>',
                    '    <p style="margin: 0.75rem 0; color: var(--text-secondary); font-size: 0.9rem; flex-grow: 1; display: flex; align-items: flex-start; gap: 0.5rem;">',
                    '        <i class="fas fa-map-marker-alt" style="margin-top: 3px; color: var(--primary);"></i>',
                    '        <span>' + cafeAddress + '</span>',
                    '    </p>',
                    '    <a href="' + mapLink + '" target="_blank" class="btn btn--outline btn--sm" style="text-align: center; width: 100%; margin-top: auto; text-decoration: none;">',
                    '        <i class="fas fa-external-link-alt"></i> View on Map',
                    '    </a>',
                    '</div>'
                ].join(''));
            });

            gridParts.push('</div>');
            contentDiv.innerHTML = gridParts.join('');

        } catch (error) {
            // Error State
            contentDiv.innerHTML = [
                '<div class="error-state" style="text-align: center; padding: 2rem; background: rgba(239, 68, 68, 0.1); border-radius: 8px;">',
                '    <i class="fas fa-exclamation-triangle fa-2x" style="color: var(--error); margin-bottom: 1rem;"></i>',
                '    <p style="color: var(--text-primary); font-weight: 500;">Failed to load hidden gem cafés.</p>',
                '    <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 0.5rem;">Please check your internet connection or API key.</p>',
                '</div>'
            ].join('');
        }
    }

    static init(parentElementSelector, destination) {
        var widget = new NearbyHiddenCafes();
        widget.render(parentElementSelector);
        if (destination) {
            widget.loadCafes(destination);
        }
        return widget;
    }
}

// Make accessible globally
window.NearbyHiddenCafes = NearbyHiddenCafes;
