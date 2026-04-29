// =========================================
// SEWANEE TRANSIT — Live Map Logic
// static/js/view.js
//
// Stack:
//   - Leaflet 1.9.4 for the map engine
//   - CARTO Voyager tiles for a clean, modern look
//     (free, no API key, retina-ready)
//   - Custom SVG markers for stops, shuttles, and user
// =========================================

// 1. Initialize map centered on Sewanee
const map = L.map('map', {
    zoomControl: false,
    attributionControl: false   // we'll add a smaller, custom one below
}).setView([35.2034, -85.9210], 16);

// 2. CARTO Voyager tiles — much cleaner than default OSM.
//    Soft pastel base, well-balanced labels, retina-ready.
//    Free for non-commercial use, no API key required.
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 20
}).addTo(map);

// 3. Compact attribution in the corner (required by tile licenses)
L.control.attribution({
    position: 'bottomleft',
    prefix: false
}).addAttribution('© OpenStreetMap · © CARTO').addTo(map);

// 4. Zoom control bottom right
L.control.zoom({ position: 'bottomright' }).addTo(map);

// =========================================================================
// SHUTTLE STOP MARKERS
// =========================================================================
const stops = [
    { name: "McClurg Dining Hall",  lat: 35.2048, lng: -85.9198 },
    { name: "Fowler Center",        lat: 35.2071, lng: -85.9241 },
    { name: "The SPO / Bookstore",  lat: 35.2032, lng: -85.9187 },
    { name: "All Saints' Chapel",   lat: 35.2027, lng: -85.9220 },
    { name: "Wellness Commons",     lat: 35.2055, lng: -85.9165 },
    { name: "The BC",               lat: 35.2018, lng: -85.9175 },
    { name: "Humphreys",            lat: 35.2010, lng: -85.9200 },
];

// Stop marker: small purple pin with white border + soft shadow.
// Uses inline SVG so it scales crisply on retina displays.
const stopIcon = L.divIcon({
    className: 'stop-marker-wrapper',
    html: `
        <svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <filter id="stopShadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.35"/>
                </filter>
            </defs>
            <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.3 21.7 0 14 0z"
                  fill="#582C83" stroke="white" stroke-width="2.5" filter="url(#stopShadow)"/>
            <circle cx="14" cy="14" r="4.5" fill="white"/>
        </svg>
    `,
    iconSize: [28, 36],
    iconAnchor: [14, 36],     // anchor at the tip of the pin
    popupAnchor: [0, -34]
});

stops.forEach(stop => {
    L.marker([stop.lat, stop.lng], { icon: stopIcon })
     .addTo(map)
     .bindPopup(`
        <div class="stop-popup">
            <div class="stop-popup-name">${stop.name}</div>
            <div class="stop-popup-meta">Shuttle Stop</div>
        </div>
     `);
});

// =========================================================================
// SHUTTLE LIVE MARKER (animated, gold)
// (Hooked up to /api/shuttles/live in the next milestone — for now,
//  we just render one demo shuttle so the marker shows on the map.)
// =========================================================================
const shuttleIcon = L.divIcon({
    className: 'shuttle-marker-wrapper',
    html: `
        <div class="shuttle-marker">
            <div class="shuttle-pulse"></div>
            <div class="shuttle-body">🚐</div>
        </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22]
});

let shuttleMarker = L.marker([35.2040, -85.9210], { icon: shuttleIcon })
    .addTo(map)
    .bindPopup(`
        <div class="stop-popup">
            <div class="stop-popup-name">Tiger-1</div>
            <div class="stop-popup-meta">Driver: Paulo Garcia · Daytime Loop</div>
        </div>
    `);

// =========================================================================
// USER LOCATION (GPS)
// =========================================================================
let userMarker = null;
let userCircle = null;
let watchId    = null;

const userIcon = L.divIcon({
    className: 'user-marker-wrapper',
    html: `<div class="my-location-dot">
               <div class="my-location-pulse"></div>
               <div class="my-location-center"></div>
           </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
});

function startTracking() {
    if (!navigator.geolocation) {
        document.getElementById('locationName').textContent = 'GPS not supported';
        setBadge('error', '✗ No GPS');
        return;
    }

    watchId = navigator.geolocation.watchPosition(
        onLocationSuccess,
        onLocationError,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
}

function onLocationSuccess(position) {
    const lat      = position.coords.latitude;
    const lng      = position.coords.longitude;
    const accuracy = Math.round(position.coords.accuracy);
    const latlng   = [lat, lng];

    if (userMarker) {
        userMarker.setLatLng(latlng);
        userCircle.setLatLng(latlng).setRadius(accuracy);
    } else {
        userMarker = L.marker(latlng, { icon: userIcon })
            .addTo(map)
            .bindPopup('<div class="stop-popup"><div class="stop-popup-name">📍 You are here</div></div>');

        userCircle = L.circle(latlng, {
            radius: accuracy,
            color: '#C8A051',
            fillColor: '#C8A051',
            fillOpacity: 0.08,
            weight: 1.5,
            dashArray: '5,5'
        }).addTo(map);

        map.setView(latlng, 17);
    }

    document.getElementById('locationName').textContent    = 'Live Tracking';
    document.getElementById('coordsDisplay').textContent   = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    document.getElementById('accuracyDisplay').textContent = accuracy;
    document.getElementById('lastUpdate').textContent      = 'Updated ' + new Date().toLocaleTimeString();

    if (accuracy > 500) {
        setBadge('warn', `⚠️ Low accuracy (${accuracy}m)`);
    } else {
        setBadge('ok', '✓ GPS Active');
    }
}

function onLocationError(error) {
    let msg = 'GPS Error';
    if (error.code === 1)      msg = '✗ Permission Denied';
    else if (error.code === 2) msg = '✗ Position Unavailable';
    else if (error.code === 3) msg = '✗ GPS Timeout';

    setBadge('error', msg);
    document.getElementById('locationName').textContent  = 'Cannot locate';
    document.getElementById('coordsDisplay').textContent = error.message;
}

// Helper to swap the GPS badge color/text without repeating the long class strings
function setBadge(state, text) {
    const badge = document.getElementById('gpsBadge');
    badge.textContent = text;
    const base = 'px-3 py-1 border font-bold text-xs rounded-full uppercase tracking-wide';
    if (state === 'ok')    badge.className = `${base} bg-green-500/20  border-green-400/30  text-green-300`;
    if (state === 'warn')  badge.className = `${base} bg-yellow-500/20 border-yellow-400/30 text-yellow-300`;
    if (state === 'error') badge.className = `${base} bg-red-500/20    border-red-400/30    text-red-300`;
}

function centerOnMe() {
    if (userMarker) map.setView(userMarker.getLatLng(), 17);
}

// Fix Leaflet rendering on mobile (it sometimes mismeasures the container)
setTimeout(() => { map.invalidateSize(); }, 300);

startTracking();