// js/NearbyHotels.js
class NearbyHotels {
    constructor(containerId) {
        this.containerId = containerId || 'nearby-hotels-section';
    }

    render(parentElementSelector) {
        // Create container if it doesn't exist
        let container = document.getElementById(this.containerId);

        if (!container) {
            container = document.createElement('div');
            container.id = this.containerId;
            container.className = 'hotels-container';
            // Match the required look without touching the existing CSS file
            container.style.marginTop = '2rem';
            container.style.padding = '1.5rem';
            container.style.background = 'var(--surface)';
            container.style.borderRadius = '12px';
            container.style.boxShadow = 'var(--shadow-md)';

            container.innerHTML = [
                '<div class="section-header" style="margin-bottom: 1.5rem;">',
                '    <h2 class="section-title" style="margin: 0; display: flex; align-items: center; gap: 0.5rem; font-size: 1.5rem;">',
                '        <i class="fas fa-bed"></i> Nearby Hotels',
                '    </h2>',
                '</div>',
                '<div id="hotels-content" class="hotels-content"></div>'
            ].join('');

            const parentElement = document.querySelector(parentElementSelector);
            if (parentElement) {
                parentElement.appendChild(container);
            } else {
                console.error('NearbyHotels: Parent element not found:', parentElementSelector);
                return;
            }
        } else {
            // Reset content div for fresh load
            var contentDiv = document.getElementById('hotels-content');
            if (contentDiv) contentDiv.innerHTML = '';
        }
    }

    async loadHotels(destination) {
        var contentDiv = document.getElementById('hotels-content');
        if (!contentDiv) return;

        // Loading State
        contentDiv.innerHTML = [
            '<div class="loading-state" style="text-align: center; padding: 2rem;">',
            '    <i class="fas fa-spinner fa-spin fa-2x" style="color: var(--primary);"></i>',
            '    <p style="margin-top: 1rem; color: var(--text-secondary);">Finding the best places to stay in ' + destination + '...</p>',
            '</div>'
        ].join('');

        try {
            var hotels = await window.hotelService.getNearbyHotels(destination);

            if (!hotels || hotels.length === 0) {
                // Empty State
                contentDiv.innerHTML = [
                    '<div class="empty-state" style="text-align: center; padding: 2rem;">',
                    '    <i class="fas fa-search fa-2x" style="color: var(--text-secondary); margin-bottom: 1rem;"></i>',
                    '    <p style="color: var(--text-secondary);">No hotels found for this destination. Try checking popular booking sites!</p>',
                    '</div>'
                ].join('');
                return;
            }

            // Render grid
            var gridParts = ['<div class="hotels-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem;">'];

            hotels.forEach(function (hotel) {
                var mapLink = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(hotel.name + ' ' + hotel.address);
                var distanceHtml = hotel.distance
                    ? '<span style="margin-left: 0.5rem; color: var(--text-muted); font-size: 0.8rem; font-weight: normal;">• ' + hotel.distance + '</span>'
                    : '';

                gridParts.push([
                    '<div class="template-card" style="display: flex; flex-direction: column; height: 100%; border: 1px solid var(--border); border-radius: 8px; padding: 1rem; background: var(--bg-primary);">',
                    '    <div class="template-header" style="align-items: flex-start; flex-direction: column; gap: 0.5rem; border-bottom: none; padding-bottom: 0;">',
                    '        <h3 style="margin: 0; font-size: 1.1rem; color: var(--text-primary); line-height: 1.3;">' + hotel.name + '</h3>',
                    '        <div style="display: flex; align-items: center; gap: 0.25rem; color: #f59e0b; font-size: 0.9rem;">',
                    '            <i class="fas fa-star"></i>',
                    '            <span style="font-weight: 600; color: var(--text-secondary);">' + hotel.rating + '</span>',
                    distanceHtml,
                    '        </div>',
                    '    </div>',
                    '    <p style="margin: 0.75rem 0; color: var(--text-secondary); font-size: 0.9rem; flex-grow: 1; display: flex; align-items: flex-start; gap: 0.5rem;">',
                    '        <i class="fas fa-map-marker-alt" style="margin-top: 3px; color: var(--primary);"></i>',
                    '        <span>' + hotel.address + '</span>',
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
                '    <p style="color: var(--text-primary); font-weight: 500;">Failed to load hotels.</p>',
                '    <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 0.5rem;">Please check your internet connection or API key.</p>',
                '</div>'
            ].join('');
        }
    }

    static init(parentElementSelector, destination) {
        var widget = new NearbyHotels();
        widget.render(parentElementSelector);
        if (destination) {
            widget.loadHotels(destination);
        }
        return widget;
    }
}

// Make accessible globally
window.NearbyHotels = NearbyHotels;
