# Transport Suggestions Setup Guide

This document explains how to set up live transport API integrations for the ZipIt app.

## Overview

The app uses the following APIs for transport suggestions:

- **Flights**: Amadeus, Skyscanner, or Kiwi (Tequila)
- **Trains (India)**: IndianRail API
- **Buses (India)**: RedBus API
- **Routes (Car/Bike/Ferry)**: Google Maps Directions API
- **Fallback (Multimodal)**: Rome2rio

## Getting Started

### 1. Set API Keys in Environment Variables

Create a `.env` file (or `.env.local` for development) in the project root with your API keys:

```env
# Flights (choose one)
AMADEUS_CLIENT_ID=your-amadeus-client-id
AMADEUS_CLIENT_SECRET=your-amadeus-client-secret
SKYSCANNER_API_KEY=your-skyscanner-api-key
KIWI_API_KEY=your-kiwi-api-key

# Trains (India)
INDIAN_RAIL_API_KEY=your-indian-rail-api-key

# Buses (India)
REDBUS_API_KEY=your-redbus-api-key

# Routes
GOOGLE_MAPS_API_KEY=your-google-maps-api-key

# Fallback (Multimodal)
ROME2RIO_API_KEY=your-rome2rio-api-key
```

### 2. Deploy Serverless Proxy

For production, deploy the proxy function (`api/proxyTransport.example.js`) to a serverless platform:

#### Netlify Functions

1. Copy `api/proxyTransport.example.js` to `functions/proxyTransport.js`
2. Add environment variables in Netlify dashboard under Settings → Environment
3. Redeploy: `netlify deploy`

#### Vercel

1. Copy `api/proxyTransport.example.js` to `api/proxyTransport.js`
2. Add environment variables in Vercel project settings
3. Redeploy: `vercel deploy`

#### Custom Express Backend

```javascript
// server.js or routes/transport.js
app.get('/api/proxyTransport/flights', async (req, res) => {
    const apiKey = process.env.SKYSCANNER_API_KEY;
    const result = await fetch('https://api.skyscanner.com/v3/...', {
        headers: { 'X-API-Key': apiKey }
    });
    res.json(await result.json());
});
```

### 3. Test Each API

#### Test Flights
```javascript
window.transportSuggestions.getSuggestions({
    mode: 'flight',
    origin: 'Delhi, India',
    destination: 'Mumbai, India',
    startDate: '2025-12-25'
})
```

#### Test Trains
```javascript
window.transportSuggestions.getSuggestions({
    mode: 'train',
    origin: 'Delhi',
    destination: 'Mumbai',
    startDate: '2025-12-25'
})
```

#### Test Buses
```javascript
window.transportSuggestions.getSuggestions({
    mode: 'bus',
    origin: 'Delhi',
    destination: 'Bangalore',
    startDate: '2025-12-25'
})
```

#### Test Routes
```javascript
window.transportSuggestions.getSuggestions({
    mode: 'car',
    origin: 'Delhi, India',
    destination: 'Jaipur, India',
    startDate: '2025-12-25'
})
```

## API Reference

### Flights

#### Skyscanner
- **URL**: https://rapidapi.com/skyscanner/api/skyscanner-flight-search
- **Authentication**: API Key header
- **Rate**: $0.01 - $1 per request (RapidAPI)

#### Kiwi (Tequila)
- **URL**: https://tequila-api.kiwi.com/
- **Authentication**: API Key in query param
- **Rate**: Free tier available, ~100 requests/month

#### Amadeus
- **URL**: https://developers.amadeus.com/
- **Authentication**: OAuth2 (requires backend)
- **Rate**: Free tier for testing, pricing on scale

### Trains (India)

#### IndianRail API
- **URL**: https://www.indianrailapi.com/
- **Authentication**: API Key
- **Rate**: Varies by plan

### Buses (India)

#### RedBus API
- **URL**: https://www.redbus.in/api/
- **Authentication**: Bearer token
- **Rate**: Enterprise pricing

### Routes

#### Google Maps Directions API
- **URL**: https://developers.google.com/maps/documentation/directions
- **Authentication**: API Key
- **Rate**: $5 per 1000 requests after free tier

### Fallback / Multimodal

#### Rome2rio
- **URL**: https://www.rome2rio.com/api
- **Authentication**: API Key
- **Rate**: Free for basic usage

## Caching Strategy

The service caches results for 60 seconds to reduce API calls. To adjust:

```javascript
// In TransportSuggestionsService constructor:
this.cacheTimeout = 60000; // in milliseconds
```

## Fallback Behavior

If an API key is missing or the API fails, the service automatically falls back to:

1. Next configured API (e.g., if Skyscanner fails, try Kiwi)
2. Rome2rio for multimodal suggestions
3. Mock data (demo suggestions)

## Debugging

Enable console logs to debug API calls:

```javascript
// Check if service is loaded
console.log(window.transportSuggestions);

// Check cached results
console.log(window.transportSuggestions.cache);

// Clear cache
window.transportSuggestions.cache.clear();
```

## Production Checklist

- [ ] All API keys are in environment variables (not hardcoded)
- [ ] Proxy endpoint is deployed and accessible
- [ ] Each API type has been tested end-to-end
- [ ] Fallback behavior tested (remove one API key and verify fallback works)
- [ ] Rate limits are understood and monitored
- [ ] CORS is configured correctly for proxy endpoints
- [ ] Error messages are user-friendly
- [ ] Caching is appropriate for use case

## Troubleshooting

### "API key not configured"
- Check that API keys are in `.env` file
- Verify environment variables are loaded in deployment
- Restart the server/app

### "CORS error"
- Ensure proxy endpoint is being used (not direct API call from client)
- Verify proxy has correct CORS headers

### "No results returned"
- Check API is returning data (test via curl/Postman)
- Verify origin/destination format matches API requirements
- Check date format (should be YYYY-MM-DD)

### "Slow suggestions"
- Check API response time (may be slow API, not app)
- Verify caching is working
- Consider upgrading API tier

## Support

For issues with specific APIs, refer to their official documentation:
- Skyscanner: https://rapidapi.com/skyscanner/api/skyscanner-flight-search
- Kiwi: https://www.kiwi.com/api/
- Amadeus: https://developers.amadeus.com/
- IndianRail: https://www.indianrailapi.com/
- RedBus: https://www.redbus.in/
- Rome2rio: https://www.rome2rio.com/api
- Google Maps: https://developers.google.com/maps/
