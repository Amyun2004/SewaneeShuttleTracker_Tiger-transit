// =========================================
// SEWANEE TRANSIT — History Page Logic
// static/js/history.js
//
// Fetches /api/history with optional filters, draws trip GPS traces
// as colored polylines (one color per route), and lets the user
// drill into a specific trip from the sidebar list.
// =========================================

const CAMPUS_CENTER = [35.2034, -85.9210];
const ROUTE_COLORS = ['#582C83', '#C8A051', '#2E7D32', '#0277BD', '#C62828', '#6A1B9A', '#EF6C00', '#00838F'];

let map;
let allTrips = [];
let tripPolylines = {};      // trip_id -> L.polyline
let routeColorMap = {};      // route_id -> hex color
let highlightedTripId = null;

let filterDays = 7;
let filterRouteId = '';
let filterShuttleId = '';

// ---------- MAP ----------
function initMap() {
    map = L.map('map', {
        zoomControl: false,
        attributionControl: false
    }).setView(CAMPUS_CENTER, 16);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd', maxZoom: 20
    }).addTo(map);

    L.control.attribution({ position: 'bottomleft', prefix: false })
        .addAttribution('© OpenStreetMap · © CARTO').addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    setTimeout(() => map.invalidateSize(), 200);
}

// ---------- DATA FETCH ----------
async function loadHistory() {
    setStats('—', '—', '—');
    document.getElementById('tripList').innerHTML = '<p class="text-xs text-gray-400">Loading trips…</p>';
    document.getElementById('historySubtitle').textContent = `Last ${filterDays} day${filterDays === 1 ? '' : 's'} · loading…`;

    const params = new URLSearchParams({ days: filterDays });
    if (filterRouteId)   params.set('route_id',   filterRouteId);
    if (filterShuttleId) params.set('shuttle_id', filterShuttleId);

    try {
        const res = await fetch(`/api/history?${params}`);
        if (!res.ok) throw new Error('History fetch failed');
        const data = await res.json();
        allTrips = data.trips || [];
        populateFilterDropdowns(data.routes || [], data.shuttles || []);
        assignRouteColors(data.routes || []);
        renderTrips();
        renderStats();
    } catch (err) {
        console.error(err);
        document.getElementById('tripList').innerHTML = '<p class="text-xs text-red-500">Could not load history.</p>';
    }
}

function populateFilterDropdowns(routes, shuttles) {
    const routeSel = document.getElementById('routeFilter');
    const shuttleSel = document.getElementById('shuttleFilter');

    // Only repopulate if empty (avoid resetting selection on every refresh)
    if (routeSel.options.length <= 1) {
        routes.forEach(r => {
            const opt = new Option(r.route_name, r.route_id);
            routeSel.add(opt);
        });
    }
    if (shuttleSel.options.length <= 1) {
        shuttles.forEach(s => {
            const opt = new Option(s.shuttle_name, s.shuttle_id);
            shuttleSel.add(opt);
        });
    }
}

function assignRouteColors(routes) {
    routes.forEach((r, idx) => {
        if (!routeColorMap[r.route_id]) {
            routeColorMap[r.route_id] = ROUTE_COLORS[idx % ROUTE_COLORS.length];
        }
    });
}

// ---------- RENDER ----------
function renderTrips() {
    // Clear existing polylines
    Object.values(tripPolylines).forEach(p => map.removeLayer(p));
    tripPolylines = {};

    const list = document.getElementById('tripList');
    document.getElementById('tripListCount').textContent = allTrips.length;
    document.getElementById('historySubtitle').textContent =
        `Last ${filterDays} day${filterDays === 1 ? '' : 's'} · ${allTrips.length} trip${allTrips.length === 1 ? '' : 's'}`;

    if (allTrips.length === 0) {
        list.innerHTML = `
            <div class="text-center py-6">
                <p class="text-xs text-gray-400">No completed trips in this range.</p>
                <p class="text-[10px] text-gray-300 mt-1">Try a wider time window.</p>
            </div>`;
        return;
    }

    list.innerHTML = '';
    const allBounds = [];

    allTrips.forEach(t => {
        const color = routeColorMap[t.route_id] || '#582C83';

        // Draw polyline if there are points
        if (t.path && t.path.length > 1) {
            const poly = L.polyline(t.path, {
                color: color,
                weight: 4,
                opacity: 0.7,
                lineCap: 'round',
                lineJoin: 'round'
            }).addTo(map);
            poly.bindPopup(`
                <div class="stop-popup">
                    <div class="stop-popup-name">${t.route_name}</div>
                    <div class="stop-popup-meta">${t.shuttle_name} · ${t.driver_name}</div>
                    <div class="stop-popup-meta" style="margin-top:4px">
                        ${formatDate(t.start_time)} · ${t.duration_min} min
                    </div>
                </div>
            `);
            tripPolylines[t.trip_id] = poly;
            t.path.forEach(p => allBounds.push(p));
        }

        // Sidebar item
        const item = document.createElement('div');
        item.className = 'trip-list-item p-3 rounded-xl bg-white border border-gray-200 hover:border-[#582C83]/40 cursor-pointer transition';
        item.dataset.tripId = t.trip_id;
        item.innerHTML = `
            <div class="flex items-start justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="w-2 h-8 rounded-full shrink-0" style="background:${color}"></span>
                    <div class="min-w-0">
                        <p class="text-sm font-bold text-gray-900 truncate">${t.route_name}</p>
                        <p class="text-[11px] text-gray-400 truncate">${t.shuttle_name} · ${t.driver_name}</p>
                    </div>
                </div>
                <div class="text-right shrink-0">
                    <p class="text-[10px] text-gray-400 font-mono">${formatDate(t.start_time)}</p>
                    <p class="text-xs font-bold text-gray-700 font-mono">${t.duration_min}m</p>
                </div>
            </div>
            ${t.path.length === 0
                ? '<p class="text-[10px] text-gray-300 mt-2 italic">No GPS data</p>'
                : `<p class="text-[10px] text-gray-400 mt-1.5">${t.path.length} GPS points</p>`}
        `;
        item.addEventListener('click', () => highlightTrip(t.trip_id));
        list.appendChild(item);
    });

    // Fit map to all polylines
    if (allBounds.length > 0) {
        map.fitBounds(allBounds, { padding: [40, 40] });
    }
}

function renderStats() {
    let totalMin = 0;
    let totalMeters = 0;
    allTrips.forEach(t => {
        totalMin += t.duration_min || 0;
        totalMeters += polylineLengthMeters(t.path);
    });
    const totalMiles = totalMeters / 1609.34;
    const totalHours = totalMin / 60;
    setStats(allTrips.length, totalMiles.toFixed(1), totalHours.toFixed(1));
}

function setStats(trips, miles, hours) {
    document.getElementById('statTrips').textContent    = trips;
    document.getElementById('statDistance').textContent = miles;
    document.getElementById('statTime').textContent     = hours;
}

// ---------- HIGHLIGHT ----------
function highlightTrip(tripId) {
    // Reset previous highlight
    Object.entries(tripPolylines).forEach(([id, poly]) => {
        poly.setStyle({ weight: 4, opacity: 0.7 });
    });
    document.querySelectorAll('.trip-list-item').forEach(el => {
        el.classList.remove('ring-2', 'ring-[#582C83]', 'bg-[#582C83]/5');
    });

    if (highlightedTripId === tripId) {
        // Clicking the same trip again deselects it
        highlightedTripId = null;
        return;
    }

    highlightedTripId = tripId;
    const poly = tripPolylines[tripId];
    if (poly) {
        poly.setStyle({ weight: 6, opacity: 1.0 });
        poly.bringToFront();
        map.fitBounds(poly.getBounds(), { padding: [60, 60] });
        poly.openPopup();
    }

    const item = document.querySelector(`.trip-list-item[data-trip-id="${tripId}"]`);
    if (item) {
        item.classList.add('ring-2', 'ring-[#582C83]', 'bg-[#582C83]/5');
    }
}

// ---------- HELPERS ----------
function formatDate(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
        return d.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
    }
    return d.toLocaleDateString([], {month: 'short', day: 'numeric'}) + ' ' +
           d.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
}

function polylineLengthMeters(coords) {
    if (!coords || coords.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < coords.length; i++) {
        total += haversine(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1]);
    }
    return total;
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

// ---------- BOOT ----------
document.addEventListener('DOMContentLoaded', () => {
    initMap();

    // Day-range buttons
    document.querySelectorAll('.filter-days').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-days').forEach(b => {
                b.classList.remove('bg-[#582C83]', 'text-white', 'shadow-sm');
                b.classList.add('text-gray-500', 'hover:text-gray-800');
            });
            btn.classList.add('bg-[#582C83]', 'text-white', 'shadow-sm');
            btn.classList.remove('text-gray-500', 'hover:text-gray-800');

            filterDays = parseInt(btn.dataset.days);
            loadHistory();
        });
    });

    // Route + shuttle dropdowns
    document.getElementById('routeFilter').addEventListener('change', e => {
        filterRouteId = e.target.value;
        loadHistory();
    });
    document.getElementById('shuttleFilter').addEventListener('change', e => {
        filterShuttleId = e.target.value;
        loadHistory();
    });

    loadHistory();
});