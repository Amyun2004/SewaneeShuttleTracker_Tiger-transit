// =========================================
// SEWANEE TRANSIT — Live Map Logic
// static/js/view.js
// =========================================

// 1. Initialize map centered on Sewanee
const map = L.map('map', {
    zoomControl: false
}).setView([35.2034, -85.9210], 15);

// 2. OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
}).addTo(map);

// 3. Zoom control bottom right
L.control.zoom({ position: 'bottomright' }).addTo(map);

// 4. Shuttle stop markers
const stops = [
    { name: "McClurg Dining Hall",  lat: 35.2048, lng: -85.9198 },
    { name: "Fowler Center",        lat: 35.2071, lng: -85.9241 },
    { name: "The SPO / Bookstore",  lat: 35.2032, lng: -85.9187 },
    { name: "All Saints' Chapel",   lat: 35.2027, lng: -85.9220 },
    { name: "Wellness Commons",     lat: 35.2055, lng: -85.9165 },
    { name: "The BC",               lat: 35.2018, lng: -85.9175 },
    { name: "Humphreys",            lat: 35.2010, lng: -85.9200 },
];

const stopIcon = L.divIcon({
    className: '',
    html: `<div style="
        width:14px;height:14px;
        background:#582C83;
        border:3px solid white;
        border-radius:50%;
        box-shadow:0 2px 8px rgba(88,44,131,0.4);
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
});

stops.forEach(stop => {
    L.marker([stop.lat, stop.lng], { icon: stopIcon })
     .addTo(map)
     .bindPopup(`<b style="color:#582C83">${stop.name}</b><br><small>Shuttle Stop</small>`);
});

// 5. User location state
let userMarker = null;
let userCircle = null;
let watchId    = null;

const userIcon = L.divIcon({
    className: '',
    html: `<div class="my-location-dot">
               <div class="my-location-pulse"></div>
               <div class="my-location-center"></div>
           </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
});

// 6. Start GPS tracking
function startTracking() {
    if (!navigator.geolocation) {
        document.getElementById('locationName').textContent = 'GPS not supported';
        document.getElementById('gpsBadge').textContent = '✗ No GPS';
        document.getElementById('gpsBadge').className = 'px-3 py-1 bg-red-500/20 border border-red-400/30 text-red-300 font-bold text-xs rounded-full uppercase tracking-wide';
        return;
    }

    watchId = navigator.geolocation.watchPosition(
        onLocationSuccess,
        onLocationError,
        {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 15000
        }
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
            .bindPopup('<b style="color:#C8A051">📍 You are here</b>');

        userCircle = L.circle(latlng, {
            radius: accuracy,
            color: '#582C83',
            fillColor: '#582C83',
            fillOpacity: 0.08,
            weight: 1,
            dashArray: '4'
        }).addTo(map);

        map.setView(latlng, 16);
    }

    document.getElementById('locationName').textContent    = 'Live Tracking';
    document.getElementById('coordsDisplay').textContent   = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    document.getElementById('accuracyDisplay').textContent = accuracy;
    document.getElementById('lastUpdate').textContent      = 'Updated ' + new Date().toLocaleTimeString();

    const badge = document.getElementById('gpsBadge');
    if (accuracy > 500) {
        badge.textContent  = `⚠️ Low accuracy (${accuracy}m) — use on mobile`;
        badge.className    = 'px-3 py-1 bg-yellow-500/20 border border-yellow-400/30 text-yellow-300 font-bold text-xs rounded-full uppercase tracking-wide';
    } else {
        badge.textContent  = '✓ GPS Active';
        badge.className    = 'px-3 py-1 bg-green-500/20 border border-green-400/30 text-green-300 font-bold text-xs rounded-full uppercase tracking-wide';
    }
}

function onLocationError(error) {
    const badge = document.getElementById('gpsBadge');
    let msg = 'GPS Error';
    if (error.code === 1)      msg = '✗ Permission Denied';
    else if (error.code === 2) msg = '✗ Position Unavailable';
    else if (error.code === 3) msg = '✗ GPS Timeout';

    badge.textContent  = msg;
    badge.className    = 'px-3 py-1 bg-red-500/20 border border-red-400/30 text-red-300 font-bold text-xs rounded-full uppercase tracking-wide';
    document.getElementById('locationName').textContent  = 'Cannot locate';
    document.getElementById('coordsDisplay').textContent = error.message;
}

function centerOnMe() {
    if (userMarker) map.setView(userMarker.getLatLng(), 17);
}

// Fix Leaflet rendering on mobile
setTimeout(() => { map.invalidateSize(); }, 300);

startTracking();