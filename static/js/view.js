// =========================================
// SEWANEE TRANSIT — Rider Live Map
// static/js/view.js
//
// Polls /api/shuttles/live + /api/shuttles/nearest every 5 seconds.
// Renders shuttle markers, the user's GPS location, and a floating
// bottom bar showing the nearest shuttle with distance/walking time/ETA.
// =========================================

// ---------- CONFIG ----------
const POLL_INTERVAL_MS = 2000;
const CAMPUS_CENTER    = [35.2034, -85.9210];

// ---------- MAP SETUP ----------
const map = L.map('map', {
    zoomControl: false,
    attributionControl: false
}).setView(CAMPUS_CENTER, 16);

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 20
}).addTo(map);

L.control.attribution({ position: 'bottomleft', prefix: false })
    .addAttribution('© OpenStreetMap · © CARTO').addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);

// ---------- STATE ----------
let userMarker = null;
let userCircle = null;
let userLatLng = null;       // [lat, lng] of the rider, or null
let shuttleMarkers = {};     // shuttle_id → L.marker
let pollTimer = null;

// ---------- ICONS ----------
const stopIcon = L.divIcon({
    className: 'stop-marker-wrapper',
    html: `
        <svg width="24" height="32" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z"
                  fill="#582C83" stroke="white" stroke-width="2"/>
            <circle cx="12" cy="12" r="4" fill="white"/>
        </svg>
    `,
    iconSize: [24, 32],
    iconAnchor: [12, 32],
    popupAnchor: [0, -30]
});

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

const userIcon = L.divIcon({
    className: 'user-marker-wrapper',
    html: `<div class="my-location-dot">
               <div class="my-location-pulse"></div>
               <div class="my-location-center"></div>
           </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
});

// ---------- LOAD STOPS (one-time, on page load) ----------
async function loadStops() {
    try {
        const res = await fetch('/api/stops');
        if (!res.ok) return;
        const stops = await res.json();
        stops.forEach(s => {
            L.marker([s.latitude, s.longitude], { icon: stopIcon })
                .addTo(map)
                .bindPopup(`
                    <div class="stop-popup">
                        <div class="stop-popup-name">${s.stop_name}</div>
                        <div class="stop-popup-meta">Shuttle Stop</div>
                    </div>
                `);
        });
    } catch (err) {
        console.error('Could not load stops:', err);
    }
}

// ---------- POLL LIVE SHUTTLES ----------
async function pollShuttles() {
    try {
        const res = await fetch('/api/shuttles/live');
        if (!res.ok) return;
        const shuttles = await res.json();
        renderShuttles(shuttles);
        renderShuttleSidebar(shuttles);
    } catch (err) {
        console.error('Shuttle poll failed:', err);
    }

    // Also fetch nearest shuttle if we know where the user is
    if (userLatLng) {
        try {
            const res = await fetch(`/api/shuttles/nearest?lat=${userLatLng[0]}&lng=${userLatLng[1]}`);
            if (res.ok) {
                const data = await res.json();
                updateNearestBar(data);
            }
        } catch (err) {
            console.error('Nearest fetch failed:', err);
            updateNearestBar({nearest: null, count: 0});
        }
    } else {
        // No user GPS yet — hide the bar
        updateNearestBar({nearest: null, count: 0});
    }
}

function renderShuttles(shuttles) {
    const seenIds = new Set();
    shuttles.forEach(s => {
        seenIds.add(s.shuttle_id);
        const latlng = [s.latitude, s.longitude];
        if (shuttleMarkers[s.shuttle_id]) {
            shuttleMarkers[s.shuttle_id].setLatLng(latlng);
        } else {
            const marker = L.marker(latlng, { icon: shuttleIcon })
                .addTo(map)
                .bindPopup(`
                    <div class="stop-popup">
                        <div class="stop-popup-name">${s.shuttle_name}</div>
                        <div class="stop-popup-meta">${s.route_name} · ${s.driver}</div>
                    </div>
                `);
            shuttleMarkers[s.shuttle_id] = marker;
        }
    });
    // Remove markers for shuttles that are no longer live
    Object.keys(shuttleMarkers).forEach(id => {
        if (!seenIds.has(parseInt(id))) {
            map.removeLayer(shuttleMarkers[id]);
            delete shuttleMarkers[id];
        }
    });
}

function renderShuttleSidebar(shuttles) {
    const list  = document.getElementById('liveShuttlesList');
    const empty = document.getElementById('noShuttlesState');
    const count = document.getElementById('shuttleCount');

    count.textContent = shuttles.length;

    if (shuttles.length === 0) {
        list.classList.add('hidden');
        empty.classList.remove('hidden');
        return;
    }
    list.classList.remove('hidden');
    empty.classList.add('hidden');

    list.innerHTML = '';
    shuttles.forEach(s => {
        const item = document.createElement('div');
        item.className = 'p-3 rounded-xl bg-white border border-gray-200 hover:border-[#C8A051] cursor-pointer transition';
        item.innerHTML = `
            <div class="flex items-center justify-between">
                <div>
                    <p class="text-sm font-bold text-gray-900">${s.shuttle_name}</p>
                    <p class="text-xs text-gray-400">${s.route_name}</p>
                    <p class="text-[10px] text-gray-400 mt-0.5">Driver: ${s.driver}</p>
                </div>
                <div class="text-right">
                    <span class="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse mb-1"></span>
                    <p class="text-[10px] text-gray-400 font-mono">${s.seconds_ago}s ago</p>
                </div>
            </div>
        `;
        item.addEventListener('click', () => {
            map.setView([s.latitude, s.longitude], 18);
            shuttleMarkers[s.shuttle_id]?.openPopup();
        });
        list.appendChild(item);
    });
}

function updateNearestBar(data) {
    const bar = document.getElementById('nearestBar');

    if (!data.nearest) {
        // Clear stale text so a re-show doesn't briefly flash old data
        document.getElementById('nearestDistance').textContent = '—';
        document.getElementById('nearestShuttle').textContent  = '—';
        document.getElementById('nearestRoute').textContent    = '—';
        document.getElementById('nearestDriver').textContent   = '—';
        document.getElementById('walkingTime').textContent     = '—';
        document.getElementById('shuttleEta').textContent      = '—';
        document.getElementById('nearestUpdate').textContent   = '—';
        bar.classList.add('hidden');
        return;
    }
    bar.classList.remove('hidden');

    const n = data.nearest;
    const distText = n.distance_miles < 0.2
        ? `${n.distance_feet} ft`
        : `${n.distance_miles} mi`;
    document.getElementById('nearestDistance').textContent = distText;
    document.getElementById('nearestShuttle').textContent  = n.shuttle_name;
    document.getElementById('nearestRoute').textContent    = n.route_name;
    document.getElementById('nearestDriver').textContent   = `Driver: ${n.driver}`;
    document.getElementById('walkingTime').textContent     = `${n.walking_minutes} min`;
    document.getElementById('shuttleEta').textContent      = n.shuttle_eta_minutes
        ? `${n.shuttle_eta_minutes} min`
        : 'Stopped';
    document.getElementById('nearestUpdate').textContent   = `${n.seconds_ago}s ago`;
    document.getElementById('directionArrow').style.transform = `rotate(${n.bearing}deg)`;
}

// ---------- USER GPS ----------
function startUserTracking() {
    if (!navigator.geolocation) {
        setBadge('error', '✗ No GPS');
        document.getElementById('locationName').textContent = 'GPS not supported';
        return;
    }
    navigator.geolocation.watchPosition(
        onUserLocation,
        onUserLocationError,
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
}

function onUserLocation(pos) {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const acc = Math.round(pos.coords.accuracy);
    userLatLng = [lat, lng];

    if (userMarker) {
        userMarker.setLatLng(userLatLng);
        userCircle.setLatLng(userLatLng).setRadius(acc);
    } else {
        userMarker = L.marker(userLatLng, { icon: userIcon })
            .addTo(map)
            .bindPopup('<div class="stop-popup"><div class="stop-popup-name">📍 You are here</div></div>');
        userCircle = L.circle(userLatLng, {
            radius: acc, color: '#C8A051', fillColor: '#C8A051',
            fillOpacity: 0.08, weight: 1.5, dashArray: '5,5'
        }).addTo(map);
        map.setView(userLatLng, 17);
    }

    document.getElementById('locationName').textContent    = 'Live Tracking';
    document.getElementById('coordsDisplay').textContent   = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    document.getElementById('accuracyDisplay').textContent = acc;
    document.getElementById('lastUpdate').textContent      = 'Updated ' + new Date().toLocaleTimeString();

    if (acc > 500) setBadge('warn', `⚠️ Low accuracy (${acc}m)`);
    else           setBadge('ok', '✓ GPS Active');
}

function onUserLocationError(error) {
    let msg = 'GPS Error';
    if (error.code === 1)      msg = '✗ Permission Denied';
    else if (error.code === 2) msg = '✗ Position Unavailable';
    else if (error.code === 3) msg = '✗ GPS Timeout';
    setBadge('error', msg);
    document.getElementById('locationName').textContent = 'Cannot locate';
}

function setBadge(state, text) {
    const badge = document.getElementById('gpsBadge');
    badge.textContent = text;
    const base = 'px-3 py-1 border font-bold text-xs rounded-full uppercase tracking-wide';
    if (state === 'ok')    badge.className = `${base} bg-green-500/20  border-green-400/30  text-green-300`;
    if (state === 'warn')  badge.className = `${base} bg-yellow-500/20 border-yellow-400/30 text-yellow-300`;
    if (state === 'error') badge.className = `${base} bg-red-500/20    border-red-400/30    text-red-300`;
}

// ---------- BUTTONS ----------
function centerOnMe() {
    if (userMarker) map.setView(userMarker.getLatLng(), 17);
}

function centerOnNearest() {
    // Find the nearest shuttle marker on the map and center on it
    const ids = Object.keys(shuttleMarkers);
    if (ids.length === 0) {
        alert('No shuttles in service right now.');
        return;
    }
    if (!userLatLng) {
        // No user location → just center on the first shuttle
        const m = shuttleMarkers[ids[0]];
        map.setView(m.getLatLng(), 17);
        m.openPopup();
        return;
    }
    let bestId = null, bestDist = Infinity;
    ids.forEach(id => {
        const ll = shuttleMarkers[id].getLatLng();
        const d = haversine(userLatLng[0], userLatLng[1], ll.lat, ll.lng);
        if (d < bestDist) { bestDist = d; bestId = id; }
    });
    const m = shuttleMarkers[bestId];
    map.setView(m.getLatLng(), 17);
    m.openPopup();
}

function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dp/2)**2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2)**2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Expose to window so HTML onclick handlers can find them
window.centerOnMe = centerOnMe;
window.centerOnNearest = centerOnNearest;

// ---------- BOOT ----------
setTimeout(() => map.invalidateSize(), 200);
loadStops();
startUserTracking();
pollShuttles();                                  // fire immediately
pollTimer = setInterval(pollShuttles, POLL_INTERVAL_MS);