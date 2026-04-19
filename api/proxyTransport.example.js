/**
 * Serverless Proxy Configuration
 * This file documents how to set up secure API proxies for transport suggestions.
 * 
 * Deploy this to a serverless platform (Netlify, Vercel, etc.) to keep API keys secret.
 */

// Example for Netlify Functions (functions/proxyTransport.js)
// This is a template; adjust based on your platform

exports.handler = async (event, context) => {
    const path = event.path.replace('/.netlify/functions/proxyTransport', '');
    const method = event.httpMethod;
    const headers = event.headers;

    try {
        // Route to appropriate proxy based on path
        if (path.includes('/skyscanner/')) {
            return await proxySkyscanner(event);
        } else if (path.includes('/indianRail/')) {
            return await proxyIndianRail(event);
        } else if (path.includes('/redBus/')) {
            return await proxyRedBus(event);
        } else if (path.includes('/rome2rio/')) {
            return await proxyRome2rio(event);
        } else if (path.includes('/googleMaps/')) {
            return await proxyGoogleMaps(event);
        } else {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'Proxy endpoint not found' })
            };
        }
    } catch (error) {
        console.error('Proxy error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};

/**
 * Proxy Skyscanner API calls
 */
async function proxySkyscanner(event) {
    const apiKey = process.env.SKYSCANNER_API_KEY;
    if (!apiKey) {
        return {
            statusCode: 401,
            body: JSON.stringify({ error: 'Skyscanner API key not configured' })
        };
    }

    const searchParams = new URLSearchParams(event.queryStringParameters);
    const url = `https://api.skyscanner.com/v3/flights/search?${searchParams}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-API-Key': apiKey,
                'Accept': 'application/json'
            }
        });

        const data = await response.json();
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
}

/**
 * Proxy Indian Rail API calls
 */
async function proxyIndianRail(event) {
    const apiKey = process.env.INDIAN_RAIL_API_KEY;
    if (!apiKey) {
        return {
            statusCode: 401,
            body: JSON.stringify({ error: 'Indian Rail API key not configured' })
        };
    }

    const { from, to, date } = event.queryStringParameters;
    const url = `https://indianrailapi.com/api/trains?from=${from}&to=${to}&date=${date}&apikey=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
}

/**
 * Proxy RedBus API calls
 */
async function proxyRedBus(event) {
    const apiKey = process.env.REDBUS_API_KEY;
    if (!apiKey) {
        return {
            statusCode: 401,
            body: JSON.stringify({ error: 'RedBus API key not configured' })
        };
    }

    const { from, to, date } = event.queryStringParameters;
    const url = `https://www.redbus.in/api/buses?from=${from}&to=${to}&date=${date}`;

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });

        const data = await response.json();
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
}

/**
 * Proxy Rome2rio API calls
 */
async function proxyRome2rio(event) {
    const apiKey = process.env.ROME2RIO_API_KEY;
    if (!apiKey) {
        return {
            statusCode: 401,
            body: JSON.stringify({ error: 'Rome2rio API key not configured' })
        };
    }

    const { from, to, date } = event.queryStringParameters;
    const url = `https://api.rome2rio.com/v2/routes?from=${from}&to=${to}&date=${date}&key=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
}

/**
 * Proxy Google Maps Directions API
 */
async function proxyGoogleMaps(event) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
        return {
            statusCode: 401,
            body: JSON.stringify({ error: 'Google Maps API key not configured' })
        };
    }

    const { origin, destination, mode, alternatives } = event.queryStringParameters;
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=${mode}&alternatives=${alternatives}&key=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
}

/**
 * SETUP INSTRUCTIONS:
 * 
 * 1. Create a `.env.local` file with your API keys:
 *    SKYSCANNER_API_KEY=your-key
 *    INDIAN_RAIL_API_KEY=your-key
 *    REDBUS_API_KEY=your-key
 *    ROME2RIO_API_KEY=your-key
 *    GOOGLE_MAPS_API_KEY=your-key
 * 
 * 2. Deploy this function to your serverless platform:
 *    - Netlify: Place in functions/ folder
 *    - Vercel: Place in api/ folder
 *    - AWS Lambda: Deploy with appropriate handler
 * 
 * 3. Update TransportSuggestionsService.js to point to your proxy:
 *    Example: `/api/proxyTransport/skyscanner/flights?...`
 * 
 * 4. API Resources:
 *    - Skyscanner: https://rapidapi.com/skyscanner/api/skyscanner-flight-search
 *    - Indian Railways: https://www.indianrailapi.com/
 *    - RedBus: https://www.redbus.in/api/
 *    - Rome2rio: https://www.rome2rio.com/api
 *    - Google Maps: https://developers.google.com/maps/documentation/directions
 */
