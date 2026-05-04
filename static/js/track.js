// =========================================
// SEWANEE TRANSIT — Driver Dashboard Logic
// static/js/track.js
//
// Responsibilities:
//   - Initialize Leaflet map centered on Sewanee
//   - Watch driver's GPS, draw a marker that = the shuttle
//   - Start/End trip via /api/trips/start and /api/trips/<id>/end
//   - Stream GPS pings to /api/trips/<id>/ping every 5 seconds while a trip is active
//   - Auto-detect "on shift" via a 150m geofence around McClurg
//   - Conflict rules: manual always wins; auto-detect defers to recent manual actions
// =========================================

// ---------- CONFIG ----------
const PING_INTERVAL_MS  = 2000;      // POST a ping every 5s

// Sewanee campus center (fallback view if no GPS yet)
const CAMPUS_CENTER = [35.2034, -85.9210];

// ---------- STATE ----------
let map;
let driverMarker = null;
let trailPolyline = null;
let trailCoords = [];
let routeStopMarkers = [];
let routePolyline = null;

let currentTripId = window.DRIVER_CTX.activeTripId;
let currentRouteId = window.DRIVER_CTX.activeRouteId;
let pingTimer = null;
let elapsedTimer = null;
let pingCount = 0;
let lastManualActionAt = 0;

let lastKnownLat = null;
let lastKnownLng = null;
let lastKnownAccuracy = null;

// ---------- MAP SETUP ----------
function initMap() {
    map = L.map('map', {
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


    setTimeout(() => map.invalidateSize(), 200);
}

// ---------- DRIVER MARKER (= the shuttle) ----------
const driverIcon = L.divIcon({
    className: 'driver-marker-wrapper',
    html: `
        <div class="driver-marker">
            <div class="driver-pulse"></div>
            <div class="driver-body">🚐</div>
        </div>
    `,
    iconSize: [52, 52],
    iconAnchor: [26, 26],
    popupAnchor: [0, -26]
});

function updateDriverMarker(lat, lng) {
    const latlng = [lat, lng];
    if (driverMarker) {
        driverMarker.setLatLng(latlng);
    } else {
        driverMarker = L.marker(latlng, { icon: driverIcon })
            .addTo(map)
            .bindPopup('<div class="stop-popup"><div class="stop-popup-name">🚐 You (the shuttle)</div></div>');
        map.setView(latlng, 17);
    }
}

// Trail of where the driver has been during this trip
function appendToTrail(lat, lng) {
    trailCoords.push([lat, lng]);
    if (!trailPolyline) {
        trailPolyline = L.polyline(trailCoords, {
            color: '#C8A051',
            weight: 4,
            opacity: 0.8,
            dashArray: null
        }).addTo(map);
    } else {
        trailPolyline.setLatLngs(trailCoords);
    }
}

function clearTrail() {
    trailCoords = [];
    if (trailPolyline) {
        map.removeLayer(trailPolyline);
        trailPolyline = null;
    }
}

// ---------- ROUTE STOPS + PLANNED PATH ----------
async function loadRoute(routeId) {
    if (!routeId) return;
    try {
        const res = await fetch(`/api/routes/${routeId}`);
        if (!res.ok) throw new Error('Route fetch failed');
        const route = await res.json();
        renderRouteStops(route.stops);
        renderRoutePath(route.stops);
    } catch (err) {
        console.error('Could not load route:', err);
    }
}

function renderRouteStops(stops) {
    // Clear any existing stop markers
    routeStopMarkers.forEach(m => map.removeLayer(m));
    routeStopMarkers = [];

    const sidebarList = document.getElementById('stopsList');
    sidebarList.innerHTML = '';

    stops.forEach((s, idx) => {
        // Map marker
        const icon = L.divIcon({
            className: 'stop-marker-wrapper',
            html: `
                <div class="route-stop-pin">
                    <span class="route-stop-num">${s.sequence_number}</span>
                </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -30]
        });
        const m = L.marker([s.latitude, s.longitude], { icon })
            .addTo(map)
            .bindPopup(`
                <div class="stop-popup">
                    <div class="stop-popup-name">${s.stop_name}</div>
                    <div class="stop-popup-meta">Stop #${s.sequence_number} · ${s.expected_min_from_start} min from start</div>
                </div>
            `);
        routeStopMarkers.push(m);

        // Sidebar list item
        const item = document.createElement('div');
        item.className = 'flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition cursor-pointer';
        item.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-[#582C83] flex items-center justify-center text-white font-bold text-xs font-mono shrink-0">
                ${s.sequence_number.toString().padStart(2, '0')}
            </div>
            <div class="flex-grow min-w-0">
                <p class="text-sm font-semibold text-gray-900 truncate">${s.stop_name}</p>
                <p class="text-[10px] text-gray-400 uppercase tracking-wider">${s.expected_min_from_start} min</p>
            </div>
        `;
        item.addEventListener('click', () => {
            map.setView([s.latitude, s.longitude], 18);
            m.openPopup();
        });
        sidebarList.appendChild(item);
    });
}

function renderRoutePath(stops) {
    if (routePolyline) {
        map.removeLayer(routePolyline);
    }
    if (stops.length < 2) return;
    const coords = stops.map(s => [s.latitude, s.longitude]);
    routePolyline = L.polyline(coords, {
        color: '#582C83',
        weight: 3,
        opacity: 0.45,
        dashArray: '8,8'
    }).addTo(map);
}

// ---------- GPS WATCH ----------
function startGpsWatch() {
    if (!navigator.geolocation) {
        setLocationStatus('error', '✗', 'GPS not supported by browser');
        return;
    }
    navigator.geolocation.watchPosition(
        onPositionUpdate,
        onPositionError,
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
}

function onPositionUpdate(pos) {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const acc = pos.coords.accuracy;
    lastKnownLat = lat;
    lastKnownLng = lng;
    lastKnownAccuracy = Math.round(acc);

    updateDriverMarker(lat, lng);
    setLocationStatus('ok', '✓', `Tracking · ±${lastKnownAccuracy}m`);

    // If trip is active, append to trail
    if (currentTripId) {
        appendToTrail(lat, lng);
    }
}

function onPositionError(err) {
    let msg = 'GPS error';
    if (err.code === 1) msg = 'Permission denied';
    else if (err.code === 2) msg = 'Position unavailable';
    else if (err.code === 3) msg = 'Timeout';
    setLocationStatus('error', '✗', msg);
}

function setLocationStatus(state, icon, text) {
    document.getElementById('locationStatusIcon').textContent = icon;
    document.getElementById('locationStatusText').textContent = text;
    const root = document.getElementById('locationStatus');
    root.className = 'text-xs mt-2 text-center font-medium ' +
        (state === 'ok'    ? 'text-green-600' :
         state === 'hint'  ? 'text-[#582C83]' :
         state === 'error' ? 'text-red-500'   :
                             'text-gray-400');
}

function autoDetectEnabled() {
    const t = document.getElementById('autoDetectToggle');
    return t && t.checked;
}

// ---------- TRIP CONTROLS ----------
async function startTrip() {
    if (currentTripId) {
        alert('A trip is already in progress.');
        return;
    }
    const routeId   = document.getElementById('routeSelect').value;
    const shuttleId = document.getElementById('shuttleSelect').value;
    if (!routeId || !shuttleId) {
        alert('Pick a route and a shuttle first.');
        return;
    }
    lastManualActionAt = Date.now();

    const fd = new FormData();
    fd.append('route_id',   routeId);
    fd.append('shuttle_id', shuttleId);

    try {
        const res = await fetch('/api/trips/start', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) {
            alert(data.error || 'Could not start trip.');
            return;
        }
        currentTripId = data.trip_id;
        currentRouteId = parseInt(routeId);
        clearTrail();
        pingCount = 0;
        document.getElementById('pingCount').textContent = '0';
        toggleTripUI(true);
        await loadRoute(currentRouteId);
        startPingLoop();
        startElapsedTimer(new Date().toISOString());

        // Update labels in the active panel
        const routeOpt = document.getElementById('routeSelect').selectedOptions[0];
        const shuttleOpt = document.getElementById('shuttleSelect').selectedOptions[0];
        document.getElementById('activeRouteName').textContent   = routeOpt.textContent;
        document.getElementById('activeShuttleName').textContent = shuttleOpt.textContent;
        document.getElementById('tripStartTime').textContent = new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
    } catch (err) {
        console.error(err);
        alert('Network error starting trip.');
    }
}

async function endTrip() {
    if (!currentTripId) return;
    if (!confirm('End the current trip?')) return;
    lastManualActionAt = Date.now();

    try {
        const res = await fetch(`/api/trips/${currentTripId}/end`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) {
            alert(data.error || 'Could not end trip.');
            return;
        }
        currentTripId = null;
        currentRouteId = null;
        stopPingLoop();
        stopElapsedTimer();
        toggleTripUI(false);
    } catch (err) {
        console.error(err);
        alert('Network error ending trip.');
    }
}

function toggleTripUI(active) {
    const startPanel  = document.getElementById('startTripPanel');
    const activePanel = document.getElementById('activeTripPanel');
    const endBtn      = document.getElementById('endTripBtn');
    const tripStatus  = document.getElementById('tripStatus');

    if (active) {
        startPanel.classList.add('hidden');
        activePanel.classList.remove('hidden');
        endBtn.classList.remove('hidden');
        tripStatus.innerHTML = '<span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span><span class="text-green-300 font-semibold">Trip in progress</span>';
    } else {
        startPanel.classList.remove('hidden');
        activePanel.classList.add('hidden');
        endBtn.classList.add('hidden');
        tripStatus.innerHTML = '<span class="w-2 h-2 rounded-full bg-gray-500"></span><span class="text-white/50 font-semibold">Off shift</span>';
        clearTrail();
        // Clear stops list
        document.getElementById('stopsList').innerHTML = '<p class="text-xs text-gray-400">Start a trip to see stops.</p>';
        // Clear route polyline + stop markers
        if (routePolyline) { map.removeLayer(routePolyline); routePolyline = null; }
        routeStopMarkers.forEach(m => map.removeLayer(m));
        routeStopMarkers = [];
    }
}

// ---------- PING LOOP ----------
function startPingLoop() {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(sendPing, PING_INTERVAL_MS);
}
function stopPingLoop() {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
}

async function sendPing() {
    if (!currentTripId || lastKnownLat === null) return;
    const fd = new FormData();
    fd.append('latitude',  lastKnownLat);
    fd.append('longitude', lastKnownLng);
    if (lastKnownAccuracy !== null) fd.append('accuracy', lastKnownAccuracy);

    try {
        const res = await fetch(`/api/trips/${currentTripId}/ping`, { method: 'POST', body: fd });
        if (res.ok) {
            pingCount++;
            document.getElementById('pingCount').textContent = pingCount;
            setConnectionBadge('ok');
        } else {
            setConnectionBadge('warn');
        }
    } catch {
        setConnectionBadge('error');
    }
}

function setConnectionBadge(state) {
    const b = document.getElementById('connectionBadge');
    if (state === 'ok') {
        b.textContent = '● Streaming';
        b.className = 'px-2 py-0.5 bg-green-500/20 border border-green-400/30 text-green-300 text-[10px] font-bold rounded-full uppercase tracking-wider';
    } else if (state === 'warn') {
        b.textContent = '⚠ Server error';
        b.className = 'px-2 py-0.5 bg-yellow-500/20 border border-yellow-400/30 text-yellow-300 text-[10px] font-bold rounded-full uppercase tracking-wider';
    } else {
        b.textContent = '✗ Offline';
        b.className = 'px-2 py-0.5 bg-red-500/20 border border-red-400/30 text-red-300 text-[10px] font-bold rounded-full uppercase tracking-wider';
    }
}

// ---------- ELAPSED TIMER ----------
function startElapsedTimer(startIso) {
    const start = new Date(startIso);
    function tick() {
        const diffSec = Math.floor((Date.now() - start.getTime()) / 1000);
        const m = Math.floor(diffSec / 60);
        const s = diffSec % 60;
        document.getElementById('tripElapsed').textContent = `${m}m ${s.toString().padStart(2, '0')}s`;
    }
    tick();
    if (elapsedTimer) clearInterval(elapsedTimer);
    elapsedTimer = setInterval(tick, 1000);
}
function stopElapsedTimer() {
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
    document.getElementById('tripElapsed').textContent = '—';
}

// ---------- UTILS ----------
function haversineMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dp/2)**2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2)**2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ---------- BOOT ----------
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    startGpsWatch();

    document.getElementById('startTripBtn').addEventListener('click', startTrip);
    document.getElementById('endTripBtn').addEventListener('click', endTrip);

    // If there's already an active trip (page resumed), set up everything
    if (currentTripId) {
        toggleTripUI(true);
        loadRoute(currentRouteId);
        startPingLoop();
        if (window.DRIVER_CTX.activeStartIso) {
            startElapsedTimer(window.DRIVER_CTX.activeStartIso);
        }
    } else {
        // Show empty state in stops list
        document.getElementById('stopsList').innerHTML = '<p class="text-xs text-gray-400">Start a trip to see stops.</p>';
    }
});