# =========================================
# SEWANEE TRANSIT — Flask application
# app.py
# =========================================

from dotenv import load_dotenv
load_dotenv()

import os
import re
import math
from functools import wraps
from datetime import datetime, timedelta

from flask import (
    Flask, render_template, request, redirect, url_for,
    session, flash, jsonify, abort
)
from werkzeug.security import generate_password_hash, check_password_hash

import db

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "dev-only-change-me-in-production")

# -----------------------------------------------------------------------------
# Validation patterns (rubric: pattern matching on usernames/passwords)
# -----------------------------------------------------------------------------
USERNAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]{2,30}[0-9]$")
PASSWORD_RE = re.compile(r"^(?=.*[A-Za-z])(?=.*\d).{8,}$")
EMAIL_RE    = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

VALID_ROLES = {"rider", "driver", "admin"}
VALID_INCIDENT_CATEGORIES = {"shuttle", "stop", "driver", "safety", "other"}
VALID_ALERT_SEVERITIES    = {"info", "warning", "critical"}

# Login mode → which roles are acceptable for that mode
LOGIN_MODE_ROLES = {
    "rider":  {"rider"},                 # "Sign in as Student / Staff"
    "staff":  {"driver", "admin"},       # "Sign in as Driver / Admin"
}


# -----------------------------------------------------------------------------
# Auth helpers + decorators
# -----------------------------------------------------------------------------
def get_user_roles(user_id):
    """Return a set of roles this user holds (e.g. {'rider', 'driver'})."""
    rows = db.query("SELECT role FROM user_roles WHERE user_id = %s", (user_id,))
    return {r["role"] for r in rows}


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if "user_id" not in session:
            flash("Please sign in first.", "error")
            return redirect(url_for("login"))
        return view(*args, **kwargs)
    return wrapped


def role_required(*roles):
    """Restrict a route to users whose ACTIVE role is in `roles`."""
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            if "user_id" not in session:
                return redirect(url_for("login"))
            if session.get("active_role") not in roles:
                abort(403)
            return view(*args, **kwargs)
        return wrapped
    return decorator


def landing_for(role):
    """Where each role lands after login or after switching modes."""
    if role == "driver":
        return url_for("track")
    if role == "admin":
        return url_for("index")     # admin landing is still the homepage for now
    return url_for("index")


@app.context_processor
def inject_user():
    """Make the current user (and their available roles) visible to templates."""
    if "user_id" not in session:
        return {"current_user": None}
    return {
        "current_user": {
            "id":          session.get("user_id"),
            "username":    session.get("username"),
            "name":        session.get("full_name"),
            "active_role": session.get("active_role"),
            "all_roles":   set(session.get("all_roles", [])),
        }
    }


# -----------------------------------------------------------------------------
# Distance: Haversine formula. Returns meters between two lat/lng points.
# -----------------------------------------------------------------------------
def haversine_m(lat1, lng1, lat2, lng2):
    R = 6371000  # earth radius in meters
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp/2)**2 + math.cos(p1) * math.cos(p2) * math.sin(dl/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c


def bearing_deg(lat1, lng1, lat2, lng2):
    """Compass bearing FROM point 1 TO point 2, in degrees (0=N, 90=E)."""
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dl = math.radians(lng2 - lng1)
    x = math.sin(dl) * math.cos(p2)
    y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    brng = math.degrees(math.atan2(x, y))
    return (brng + 360) % 360


# =============================================================================
# HOMEPAGE
# =============================================================================
@app.route("/")
def index():
    # System status
    status_row = db.query_one("""
        SELECT
            (SELECT COUNT(*) FROM routes WHERE is_active = 1) AS active_routes,
            (SELECT COUNT(DISTINCT route_id) FROM trips WHERE status = 'in_progress') AS routes_running
    """)
    active_routes  = status_row["active_routes"] or 0
    routes_running = status_row["routes_running"] or 0
    if active_routes == 0:
        system_status = {"label": "No Routes Configured", "color": "gray"}
    elif routes_running == 0:
        system_status = {"label": "No Service Right Now", "color": "gray"}
    elif routes_running < active_routes:
        system_status = {"label": "Partial Service", "color": "yellow"}
    else:
        system_status = {"label": "All Routes Operating", "color": "green"}

    # In-progress trips with computed next-stop ETAs
    live_trips = db.query("""
        SELECT  t.trip_id, t.start_time,
                r.route_id, r.route_name,
                u.full_name AS driver_name,
                s.shuttle_name,
                TIMESTAMPDIFF(MINUTE, t.start_time, NOW()) AS minutes_running
        FROM trips t
        JOIN routes   r ON r.route_id   = t.route_id
        JOIN users    u ON u.user_id    = t.driver_id
        JOIN shuttles s ON s.shuttle_id = t.shuttle_id
        WHERE t.status = 'in_progress'
        ORDER BY t.start_time
    """)
    for trip in live_trips:
        stops = db.query("""
            SELECT  st.stop_id, st.stop_name, rs.sequence_number, rs.expected_min_from_start
            FROM route_stops rs
            JOIN stops st ON st.stop_id = rs.stop_id
            WHERE rs.route_id = %s
            ORDER BY rs.sequence_number
        """, (trip["route_id"],))
        elapsed = trip["minutes_running"] or 0
        upcoming = []
        for s in stops:
            eta = s["expected_min_from_start"] - elapsed
            if eta >= 0:
                upcoming.append({
                    "stop_name": s["stop_name"],
                    "sequence":  s["sequence_number"],
                    "eta_min":   eta,
                })
        trip["upcoming_stops"] = upcoming[:3]

    # Today at a Glance
    glance_row = db.query_one("""
        SELECT
            (SELECT COUNT(DISTINCT route_id) FROM trips WHERE status = 'in_progress') AS routes_active,
            (SELECT COUNT(DISTINCT rs.stop_id)
                FROM trips t
                JOIN route_stops rs ON rs.route_id = t.route_id
                WHERE DATE(t.start_time) = CURDATE()) AS stops_today
    """)
    ontime_row = db.query_one("""
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN TIMESTAMPDIFF(MINUTE, t.start_time, t.end_time)
                        <= sched.scheduled_minutes + 5 THEN 1 ELSE 0 END) AS on_time
        FROM trips t
        JOIN (SELECT route_id, MAX(expected_min_from_start) AS scheduled_minutes
              FROM route_stops GROUP BY route_id) sched
            ON sched.route_id = t.route_id
        WHERE t.status = 'completed' AND DATE(t.start_time) = CURDATE()
    """)
    if ontime_row and ontime_row["total"] and ontime_row["total"] > 0:
        ontime_rate = round(100 * ontime_row["on_time"] / ontime_row["total"])
    else:
        # Fall back to last 7 days
        week_row = db.query_one("""
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN TIMESTAMPDIFF(MINUTE, t.start_time, t.end_time)
                            <= sched.scheduled_minutes + 5 THEN 1 ELSE 0 END) AS on_time
            FROM trips t
            JOIN (SELECT route_id, MAX(expected_min_from_start) AS scheduled_minutes
                  FROM route_stops GROUP BY route_id) sched
                ON sched.route_id = t.route_id
            WHERE t.status = 'completed' AND t.start_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        """)
        if week_row and week_row["total"] and week_row["total"] > 0:
            ontime_rate = round(100 * week_row["on_time"] / week_row["total"])
        else:
            ontime_rate = None

    glance = {
        "routes_active": glance_row["routes_active"] or 0,
        "stops_today":   glance_row["stops_today"]   or 0,
        "ontime_rate":   ontime_rate,
    }

    alerts = db.query("""
        SELECT alert_id, title, body, severity, created_at
        FROM alerts
        WHERE expires_at IS NULL OR expires_at >= NOW()
        ORDER BY FIELD(severity, 'critical', 'warning', 'info'), created_at DESC
        LIMIT 5
    """)

    return render_template(
        "index.html",
        system_status=system_status,
        live_trips=live_trips,
        glance=glance,
        alerts=alerts,
    )


# =============================================================================
# OTHER PAGE ROUTES
# =============================================================================
@app.route("/view")
def view_map():
    return render_template("view.html")


@app.route("/schedule")
def schedule():
    return render_template("schedule.html")


@app.route("/history")
def history():
    """Public 7-day history visualization. Available to everyone."""
    return render_template("history.html")


@app.route("/track")
@role_required("driver")
def track():
    """Driver dashboard. Active trip (if any) is fetched here so the page
    can resume rather than always forcing the driver to start a new trip."""
    active_trip = db.query_one("""
        SELECT t.trip_id, t.start_time, t.route_id, t.shuttle_id,
               r.route_name, s.shuttle_name
        FROM trips t
        JOIN routes r   ON r.route_id   = t.route_id
        JOIN shuttles s ON s.shuttle_id = t.shuttle_id
        WHERE t.driver_id = %s AND t.status = 'in_progress'
        ORDER BY t.start_time DESC
        LIMIT 1
    """, (session["user_id"],))

    routes   = db.query("SELECT route_id, route_name FROM routes WHERE is_active = 1 ORDER BY route_name")
    shuttles = db.query("SELECT shuttle_id, shuttle_name, license_plate FROM shuttles WHERE status = 'active' ORDER BY shuttle_name")

    return render_template("track.html",
                           active_trip=active_trip,
                           routes=routes,
                           shuttles=shuttles)


# =============================================================================
# AUTH — register, login (with mode toggle), logout, switch_mode
# =============================================================================
@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "GET":
        return render_template("register.html")

    username   = (request.form.get("username")   or "").strip()
    first_name = (request.form.get("first_name") or "").strip()
    last_name  = (request.form.get("last_name")  or "").strip()
    email      = (request.form.get("email")      or "").strip().lower()
    password   = request.form.get("password")    or ""
    role_input = (request.form.get("role")       or "").strip()
    tos        = request.form.get("terms")

    errors = []
    if not tos:
        errors.append("You must agree to the Terms of Service.")
    if not USERNAME_RE.match(username):
        errors.append("Username must start with a letter, end with a digit, "
                      "be 4–32 characters, and contain only letters, digits, or underscores.")
    if not PASSWORD_RE.match(password):
        errors.append("Password must be at least 8 characters and contain "
                      "at least one letter and one digit.")
    if not EMAIL_RE.match(email):
        errors.append("Please enter a valid email address.")
    if not first_name or not last_name:
        errors.append("First and last name are required.")

    # Staff and student both register as 'rider'. Driver is a separate role.
    # (Admin role is granted manually, not via self-registration.)
    role_map = {"student": "rider", "driver": "driver", "staff": "rider"}
    primary_role = role_map.get(role_input)
    if primary_role not in VALID_ROLES:
        errors.append("Please select a valid role.")

    if not errors:
        existing = db.query_one(
            "SELECT user_id FROM users WHERE username=%s OR email=%s",
            (username, email),
        )
        if existing:
            errors.append("That username or email is already registered.")

    if errors:
        for e in errors:
            flash(e, "error")
        return render_template("register.html",
                               form={"username": username, "first_name": first_name,
                                     "last_name": last_name, "email": email, "role": role_input})

    full_name = f"{first_name} {last_name}"
    pw_hash = generate_password_hash(password)
    user_id = db.execute(
        """INSERT INTO users (username, password_hash, email, full_name, role)
           VALUES (%s, %s, %s, %s, %s)""",
        (username, pw_hash, email, full_name, primary_role),
    )
    # Also write the junction row
    db.execute("INSERT INTO user_roles (user_id, role) VALUES (%s, %s)",
               (user_id, primary_role))

    # Drivers automatically also get the 'rider' role so they can use the app
    # in student mode without registering twice.
    if primary_role == "driver":
        db.execute("INSERT INTO user_roles (user_id, role) VALUES (%s, %s)",
                   (user_id, "rider"))

    # Auto-login with the role they registered as
    all_roles = get_user_roles(user_id)
    session["user_id"]     = user_id
    session["username"]    = username
    session["full_name"]   = full_name
    session["active_role"] = primary_role
    session["all_roles"]   = list(all_roles)

    flash(f"Welcome to Sewanee Transit, {first_name}!", "success")
    return redirect(landing_for(primary_role))


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        # Default mode comes from a query param so the toggle remembers state
        # if the form re-renders with errors
        mode = request.args.get("mode", "rider")
        if mode not in LOGIN_MODE_ROLES:
            mode = "rider"
        return render_template("login.html", mode=mode)

    email    = (request.form.get("email") or "").strip().lower()
    password = request.form.get("password") or ""
    mode     = (request.form.get("mode") or "rider").strip()
    if mode not in LOGIN_MODE_ROLES:
        mode = "rider"

    if not email or not password:
        flash("Email and password are required.", "error")
        return render_template("login.html", mode=mode)

    user = db.query_one(
        "SELECT user_id, username, full_name, password_hash FROM users WHERE email=%s",
        (email,),
    )
    if not user or not check_password_hash(user["password_hash"], password):
        flash("Invalid email or password.", "error")
        return render_template("login.html", mode=mode)

    # Check that this user actually has a role matching the requested mode
    user_roles = get_user_roles(user["user_id"])
    allowed = LOGIN_MODE_ROLES[mode]
    matching = user_roles & allowed

    if not matching:
        if mode == "staff":
            flash("This account doesn't have driver or admin access. "
                  "Try signing in as Student/Staff instead.", "error")
        else:
            flash("This account doesn't have student/staff access.", "error")
        return render_template("login.html", mode=mode)

    # Pick the active role: prefer admin > driver > rider (most privileged first)
    if "admin" in matching:
        active_role = "admin"
    elif "driver" in matching:
        active_role = "driver"
    else:
        active_role = "rider"

    session["user_id"]     = user["user_id"]
    session["username"]    = user["username"]
    session["full_name"]   = user["full_name"]
    session["active_role"] = active_role
    session["all_roles"]   = list(user_roles)

    flash(f"Welcome back, {user['full_name'].split()[0]}!", "success")
    return redirect(landing_for(active_role))


@app.route("/switch-mode/<new_role>")
@login_required
def switch_mode(new_role):
    """Lets users with multiple roles flip between modes without re-logging in."""
    if new_role not in VALID_ROLES:
        abort(400)
    if new_role not in set(session.get("all_roles", [])):
        flash("You don't have access to that mode.", "error")
        return redirect(url_for("index"))
    session["active_role"] = new_role
    flash(f"Switched to {new_role} mode.", "success")
    return redirect(landing_for(new_role))


@app.route("/logout")
def logout():
    session.clear()
    flash("You've been signed out.", "success")
    return redirect(url_for("index"))


# =============================================================================
# DRIVER API — start/end/ping a trip
# =============================================================================
@app.route("/api/trips/start", methods=["POST"])
@role_required("driver")
def api_trip_start():
    route_id   = request.form.get("route_id",   type=int)
    shuttle_id = request.form.get("shuttle_id", type=int)

    if not route_id or not shuttle_id:
        return jsonify({"error": "route_id and shuttle_id are required"}), 400

    # Refuse if this driver already has an in-progress trip
    existing = db.query_one(
        "SELECT trip_id FROM trips WHERE driver_id=%s AND status='in_progress'",
        (session["user_id"],),
    )
    if existing:
        return jsonify({"error": "You already have an active trip", "trip_id": existing["trip_id"]}), 409

    trip_id = db.execute(
        """INSERT INTO trips (driver_id, shuttle_id, route_id, start_time, status)
           VALUES (%s, %s, %s, NOW(), 'in_progress')""",
        (session["user_id"], shuttle_id, route_id),
    )
    return jsonify({"trip_id": trip_id, "status": "started"})


@app.route("/api/trips/<int:trip_id>/end", methods=["POST"])
@role_required("driver")
def api_trip_end(trip_id):
    # Only the driver who owns the trip can end it
    trip = db.query_one(
        "SELECT trip_id FROM trips WHERE trip_id=%s AND driver_id=%s AND status='in_progress'",
        (trip_id, session["user_id"]),
    )
    if not trip:
        return jsonify({"error": "Trip not found or not yours"}), 404

    db.execute(
        "UPDATE trips SET end_time=NOW(), status='completed' WHERE trip_id=%s",
        (trip_id,),
    )
    return jsonify({"trip_id": trip_id, "status": "completed"})


@app.route("/api/trips/<int:trip_id>/ping", methods=["POST"])
@role_required("driver")
def api_trip_ping(trip_id):
    """Driver's phone POSTs GPS coords here every few seconds while a trip runs."""
    try:
        lat = float(request.form.get("latitude"))
        lng = float(request.form.get("longitude"))
    except (TypeError, ValueError):
        return jsonify({"error": "latitude and longitude required"}), 400

    accuracy = request.form.get("accuracy", type=float)
    speed    = request.form.get("speed",    type=float)

    # Verify ownership
    trip = db.query_one(
        "SELECT trip_id FROM trips WHERE trip_id=%s AND driver_id=%s AND status='in_progress'",
        (trip_id, session["user_id"]),
    )
    if not trip:
        return jsonify({"error": "Trip not found or not active"}), 404

    db.execute(
        """INSERT INTO locations (trip_id, latitude, longitude, accuracy_meters, speed_mph, recorded_at)
           VALUES (%s, %s, %s, %s, %s, NOW())""",
        (trip_id, lat, lng, accuracy, speed),
    )
    return jsonify({"status": "ok"})


# =============================================================================
# RIDER API — live shuttles + nearest-shuttle calculation
# =============================================================================
@app.route("/api/shuttles/live")
def api_shuttles_live():
    """Most recent location for every shuttle currently on an in-progress trip."""
    rows = db.query("""
        SELECT  s.shuttle_id, s.shuttle_name, u.full_name AS driver,
                r.route_id, r.route_name,
                l.latitude, l.longitude, l.speed_mph,
                TIMESTAMPDIFF(SECOND, l.recorded_at, NOW()) AS seconds_ago
        FROM shuttles s
        JOIN trips t      ON t.shuttle_id = s.shuttle_id AND t.status='in_progress'
        JOIN users u      ON u.user_id    = t.driver_id
        JOIN routes r     ON r.route_id   = t.route_id
        JOIN locations l  ON l.trip_id    = t.trip_id
        WHERE l.recorded_at = (
            SELECT MAX(recorded_at) FROM locations WHERE trip_id = t.trip_id
        )
        ORDER BY s.shuttle_name
    """)
    for r in rows:
        r["latitude"]  = float(r["latitude"])
        r["longitude"] = float(r["longitude"])
        if r["speed_mph"] is not None:
            r["speed_mph"] = float(r["speed_mph"])
    return jsonify(rows)


@app.route("/api/shuttles/nearest")
def api_shuttles_nearest():
    """
    Given a user's lat/lng (?lat=&lng=), find the nearest live shuttle and
    return distance, bearing, walking time, and shuttle ETA.
    """
    try:
        user_lat = float(request.args.get("lat"))
        user_lng = float(request.args.get("lng"))
    except (TypeError, ValueError):
        return jsonify({"error": "lat and lng query params required"}), 400

    shuttles = db.query("""
        SELECT  s.shuttle_id, s.shuttle_name, u.full_name AS driver,
                r.route_name, l.latitude, l.longitude, l.speed_mph,
                TIMESTAMPDIFF(SECOND, l.recorded_at, NOW()) AS seconds_ago
        FROM shuttles s
        JOIN trips t      ON t.shuttle_id = s.shuttle_id AND t.status='in_progress'
        JOIN users u      ON u.user_id    = t.driver_id
        JOIN routes r     ON r.route_id   = t.route_id
        JOIN locations l  ON l.trip_id    = t.trip_id
        WHERE l.recorded_at = (
            SELECT MAX(recorded_at) FROM locations WHERE trip_id = t.trip_id
        )
    """)

    if not shuttles:
        return jsonify({"nearest": None, "count": 0})

    best = None
    for s in shuttles:
        slat, slng = float(s["latitude"]), float(s["longitude"])
        dist_m = haversine_m(user_lat, user_lng, slat, slng)
        if best is None or dist_m < best["distance_m"]:
            best = {
                "shuttle_id":   s["shuttle_id"],
                "shuttle_name": s["shuttle_name"],
                "driver":       s["driver"],
                "route_name":   s["route_name"],
                "latitude":     slat,
                "longitude":    slng,
                "distance_m":   dist_m,
                "bearing":      bearing_deg(user_lat, user_lng, slat, slng),
                "speed_mph":    float(s["speed_mph"]) if s["speed_mph"] is not None else None,
                "seconds_ago":  s["seconds_ago"],
            }

    # Derived fields
    miles = best["distance_m"] / 1609.34
    feet  = best["distance_m"] * 3.28084
    best["distance_miles"] = round(miles, 2)
    best["distance_feet"]  = round(feet)
    # Walking time: average pace 3 mph
    best["walking_minutes"] = max(1, round(miles / 3 * 60))
    # Shuttle ETA: only meaningful if shuttle is moving
    if best["speed_mph"] and best["speed_mph"] > 1:
        best["shuttle_eta_minutes"] = max(1, round(miles / best["speed_mph"] * 60))
    else:
        best["shuttle_eta_minutes"] = None

    return jsonify({"nearest": best, "count": len(shuttles)})


# =============================================================================
# HISTORY API — last N days of GPS tracks, filterable by route/shuttle
# =============================================================================
@app.route("/api/history")
def api_history():
    """
    Returns trip-by-trip GPS traces. Optional filters:
        ?days=7   (default 7, max 30)
        ?route_id=N
        ?shuttle_id=N
    """
    try:
        days = max(1, min(int(request.args.get("days", 7)), 30))
    except ValueError:
        days = 7
    route_id   = request.args.get("route_id",   type=int)
    shuttle_id = request.args.get("shuttle_id", type=int)

    where = ["t.start_time >= DATE_SUB(NOW(), INTERVAL %s DAY)", "t.status = 'completed'"]
    params = [days]
    if route_id:
        where.append("t.route_id = %s")
        params.append(route_id)
    if shuttle_id:
        where.append("t.shuttle_id = %s")
        params.append(shuttle_id)

    trips = db.query(f"""
        SELECT t.trip_id, t.start_time, t.end_time,
               r.route_id, r.route_name,
               s.shuttle_id, s.shuttle_name,
               u.full_name AS driver_name,
               TIMESTAMPDIFF(MINUTE, t.start_time, t.end_time) AS duration_min
        FROM trips t
        JOIN routes r   ON r.route_id   = t.route_id
        JOIN shuttles s ON s.shuttle_id = t.shuttle_id
        JOIN users u    ON u.user_id    = t.driver_id
        WHERE {' AND '.join(where)}
        ORDER BY t.start_time DESC
    """, tuple(params))

    # Pull all locations for these trips in one round trip
    if trips:
        trip_ids = tuple(t["trip_id"] for t in trips)
        placeholders = ",".join(["%s"] * len(trip_ids))
        locs = db.query(f"""
            SELECT trip_id, latitude, longitude, recorded_at
            FROM locations
            WHERE trip_id IN ({placeholders})
            ORDER BY trip_id, recorded_at
        """, trip_ids)
        # Group locations by trip_id
        by_trip = {}
        for l in locs:
            by_trip.setdefault(l["trip_id"], []).append([float(l["latitude"]), float(l["longitude"])])
        for t in trips:
            t["path"] = by_trip.get(t["trip_id"], [])
            t["start_time"] = t["start_time"].isoformat() if t["start_time"] else None
            t["end_time"]   = t["end_time"].isoformat()   if t["end_time"]   else None
    else:
        for t in trips:
            t["path"] = []

    # Also send route/shuttle dropdowns so the client can build filters
    routes   = db.query("SELECT route_id, route_name FROM routes WHERE is_active = 1 ORDER BY route_name")
    shuttles = db.query("SELECT shuttle_id, shuttle_name FROM shuttles WHERE status = 'active' ORDER BY shuttle_name")

    return jsonify({
        "trips":    trips,
        "routes":   routes,
        "shuttles": shuttles,
        "days":     days,
    })


# =============================================================================
# ROUTE METADATA — used by the driver page to draw stops + scheduled path
# =============================================================================
@app.route("/api/routes/<int:route_id>")
def api_route_detail(route_id):
    route = db.query_one(
        "SELECT route_id, route_name, description FROM routes WHERE route_id=%s",
        (route_id,),
    )
    if not route:
        return jsonify({"error": "Route not found"}), 404

    stops = db.query("""
        SELECT st.stop_id, st.stop_name, st.latitude, st.longitude,
               rs.sequence_number, rs.expected_min_from_start
        FROM route_stops rs
        JOIN stops st ON st.stop_id = rs.stop_id
        WHERE rs.route_id = %s
        ORDER BY rs.sequence_number
    """, (route_id,))
    for s in stops:
        s["latitude"]  = float(s["latitude"])
        s["longitude"] = float(s["longitude"])

    route["stops"] = stops
    return jsonify(route)


# =============================================================================
# INCIDENTS + ALERTS (unchanged from previous milestone)
# =============================================================================
@app.route("/api/incidents", methods=["POST"])
@login_required
def api_create_incident():
    category    = (request.form.get("category")    or "").strip()
    location    = (request.form.get("location")    or "").strip()
    description = (request.form.get("description") or "").strip()

    errors = []
    if category not in VALID_INCIDENT_CATEGORIES:
        errors.append("Please pick a valid category.")
    if len(description) < 10:
        errors.append("Description must be at least 10 characters.")
    if len(description) > 1000:
        errors.append("Description must be under 1000 characters.")

    if errors:
        for e in errors:
            flash(e, "error")
        return redirect(url_for("index"))

    db.execute(
        """INSERT INTO incidents (reporter_id, category, location, description)
           VALUES (%s, %s, %s, %s)""",
        (session["user_id"], category, location or None, description),
    )
    flash("Thanks — your report was submitted.", "success")
    return redirect(url_for("index"))


@app.route("/api/alerts", methods=["POST"])
@role_required("admin")
def api_create_alert():
    title    = (request.form.get("title")    or "").strip()
    body     = (request.form.get("body")     or "").strip()
    severity = (request.form.get("severity") or "info").strip()
    expires  = (request.form.get("expires_at") or "").strip()

    errors = []
    if not title or len(title) > 120:
        errors.append("Title is required (max 120 chars).")
    if not body or len(body) > 500:
        errors.append("Body is required (max 500 chars).")
    if severity not in VALID_ALERT_SEVERITIES:
        errors.append("Invalid severity.")

    expires_at = None
    if expires:
        try:
            expires_at = datetime.fromisoformat(expires)
        except ValueError:
            errors.append("Invalid expiration date.")

    if errors:
        for e in errors:
            flash(e, "error")
        return redirect(url_for("index"))

    db.execute(
        """INSERT INTO alerts (title, body, severity, created_by, expires_at)
           VALUES (%s, %s, %s, %s, %s)""",
        (title, body, severity, session["user_id"], expires_at),
    )
    flash("Alert published.", "success")
    return redirect(url_for("index"))

@app.route("/api/stops")
def api_stops():
    """All shuttle stops, used by rider map to render markers."""
    rows = db.query("""
        SELECT stop_id, stop_name, latitude, longitude, description
        FROM stops
        ORDER BY stop_name
    """)
    for r in rows:
        r["latitude"]  = float(r["latitude"])
        r["longitude"] = float(r["longitude"])
    return jsonify(rows)

# =============================================================================
# ADMIN PAGE — runs queries 2, 3, 4, 5 from queries.sql against real data
# =============================================================================
@app.route("/admin")
@role_required("admin")
def admin_dashboard():
    # ---- Top stat row: aggregates for the header strip ----
    stats = db.query_one("""
        SELECT
            (SELECT COUNT(*) FROM trips WHERE status='completed'
                AND start_time >= '2026-01-15')                       AS total_trips,
            (SELECT COUNT(DISTINCT driver_id) FROM trips
                WHERE status='completed'
                AND start_time >= '2026-01-15')                       AS active_drivers,
            (SELECT COUNT(*) FROM users WHERE role='driver')          AS registered_drivers,
            (SELECT COUNT(*) FROM incidents WHERE status='open')      AS open_incidents
    """)

    # ---- On-time rate (last 7 days) — variant of query #4 ----
    ontime_row = db.query_one("""
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN TIMESTAMPDIFF(MINUTE, t.start_time, t.end_time)
                        <= sched.scheduled_minutes + 5 THEN 1 ELSE 0 END) AS on_time
        FROM trips t
        JOIN (SELECT route_id, MAX(expected_min_from_start) AS scheduled_minutes
              FROM route_stops GROUP BY route_id) sched
            ON sched.route_id = t.route_id
        WHERE t.status = 'completed'
          AND t.start_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    """)
    if ontime_row and ontime_row["total"]:
        ontime_rate = round(100 * ontime_row["on_time"] / ontime_row["total"])
    else:
        ontime_rate = None

    # ---- QUERY #2: Most active driver this semester ----
    top_driver = db.query_one("""
        SELECT u.full_name AS driver,
               ROUND(SUM(TIMESTAMPDIFF(MINUTE, t.start_time, t.end_time)) / 60.0, 2) AS total_hours,
               COUNT(*) AS trip_count
        FROM users u
        JOIN trips t ON t.driver_id = u.user_id
        WHERE t.status = 'completed'
          AND t.start_time >= '2026-01-15'
        GROUP BY u.user_id, u.full_name
        ORDER BY total_hours DESC
        LIMIT 1
    """)

    # All drivers ranked (for the progress bar context)
    all_drivers_ranked = db.query("""
        SELECT u.full_name AS driver,
               ROUND(SUM(TIMESTAMPDIFF(MINUTE, t.start_time, t.end_time)) / 60.0, 2) AS total_hours
        FROM users u
        JOIN trips t ON t.driver_id = u.user_id
        WHERE t.status = 'completed'
          AND t.start_time >= '2026-01-15'
        GROUP BY u.user_id, u.full_name
        ORDER BY total_hours DESC
        LIMIT 5
    """)

    # ---- QUERY #3: Weekend-night popular stops ----
    weekend_stops = db.query("""
        SELECT st.stop_name, COUNT(*) AS visits
        FROM trips t
        JOIN routes r       ON r.route_id   = t.route_id
        JOIN route_stops rs ON rs.route_id  = r.route_id
        JOIN stops st       ON st.stop_id   = rs.stop_id
        WHERE ((DAYOFWEEK(t.start_time) = 6 AND HOUR(t.start_time) >= 22)
               OR (DAYOFWEEK(t.start_time) = 7)
               OR (DAYOFWEEK(t.start_time) = 1 AND HOUR(t.start_time) <  2))
        GROUP BY st.stop_id, st.stop_name
        ORDER BY visits DESC, st.stop_name
        LIMIT 5
    """)

    # ---- QUERY #4: Schedule vs reality per route ----
    route_efficiency = db.query("""
        SELECT r.route_name,
               actual.avg_actual_minutes,
               sched.scheduled_minutes,
               ROUND(actual.avg_actual_minutes - sched.scheduled_minutes, 2) AS minutes_over_schedule
        FROM routes r
        LEFT JOIN (
            SELECT t.route_id,
                   ROUND(AVG(TIMESTAMPDIFF(MINUTE, t.start_time, t.end_time)), 2) AS avg_actual_minutes
            FROM trips t
            WHERE t.status = 'completed'
            GROUP BY t.route_id
        ) actual ON actual.route_id = r.route_id
        LEFT JOIN (
            SELECT rs.route_id, MAX(rs.expected_min_from_start) AS scheduled_minutes
            FROM route_stops rs
            GROUP BY rs.route_id
        ) sched ON sched.route_id = r.route_id
        ORDER BY r.route_name
    """)

    # ---- QUERY #5: New drivers with pattern-matched usernames (last 14 days) ----
    new_drivers = db.query("""
        SELECT u.username, u.full_name, u.email, u.created_at,
               COUNT(t.trip_id) AS trip_count
        FROM users u
        LEFT JOIN trips t ON t.driver_id = u.user_id AND t.start_time >= u.created_at
        WHERE u.role = 'driver'
          AND u.created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
          AND u.username REGEXP '^[A-Za-z].*[0-9]$'
        GROUP BY u.user_id, u.username, u.full_name, u.email, u.created_at
        ORDER BY u.created_at DESC
    """)

    # ---- Recent incidents (open or recent — the inbox) ----
    incidents = db.query("""
        SELECT i.incident_id, i.category, i.location, i.description,
               i.status, i.created_at,
               u.username AS reporter_username, u.full_name AS reporter_name
        FROM incidents i
        JOIN users u ON u.user_id = i.reporter_id
        ORDER BY
            FIELD(i.status, 'open', 'reviewing', 'resolved'),
            i.created_at DESC
        LIMIT 25
    """)

    # ---- All alerts (for management section) ----
    alerts = db.query("""
        SELECT a.alert_id, a.title, a.body, a.severity,
               a.created_at, a.expires_at,
               u.full_name AS author_name,
               (CASE WHEN a.expires_at IS NULL OR a.expires_at >= NOW() THEN 1 ELSE 0 END) AS is_active
        FROM alerts a
        JOIN users u ON u.user_id = a.created_by
        ORDER BY is_active DESC, a.created_at DESC
        LIMIT 25
    """)

    # ---- Recent activity feed (last 5 completed trips) ----
    recent_trips = db.query("""
        SELECT t.trip_id, t.start_time, t.end_time,
               r.route_name,
               s.shuttle_name,
               u.full_name AS driver_name,
               TIMESTAMPDIFF(MINUTE, t.start_time, t.end_time) AS duration_min,
               sched.scheduled_minutes,
               CASE
                   WHEN TIMESTAMPDIFF(MINUTE, t.start_time, t.end_time)
                        <= sched.scheduled_minutes + 5 THEN 'on_time'
                   ELSE 'delayed'
               END AS punctuality
        FROM trips t
        JOIN routes r   ON r.route_id   = t.route_id
        JOIN shuttles s ON s.shuttle_id = t.shuttle_id
        JOIN users u    ON u.user_id    = t.driver_id
        LEFT JOIN (SELECT route_id, MAX(expected_min_from_start) AS scheduled_minutes
                   FROM route_stops GROUP BY route_id) sched
            ON sched.route_id = t.route_id
        WHERE t.status = 'completed'
        ORDER BY t.end_time DESC
        LIMIT 8
    """)

    return render_template(
        "admin.html",
        stats=stats,
        ontime_rate=ontime_rate,
        top_driver=top_driver,
        all_drivers_ranked=all_drivers_ranked,
        weekend_stops=weekend_stops,
        route_efficiency=route_efficiency,
        new_drivers=new_drivers,
        incidents=incidents,
        alerts=alerts,
        recent_trips=recent_trips,
    )


# =============================================================================
# ADMIN ACTIONS — incident status updates + alert deletion
# =============================================================================
VALID_INCIDENT_STATUSES = {"open", "reviewing", "resolved"}


@app.route("/api/incidents/<int:incident_id>/status", methods=["POST"])
@role_required("admin")
def api_update_incident_status(incident_id):
    new_status = (request.form.get("status") or "").strip()
    if new_status not in VALID_INCIDENT_STATUSES:
        flash("Invalid status.", "error")
        return redirect(url_for("admin_dashboard"))

    rows = db.execute(
        "UPDATE incidents SET status=%s WHERE incident_id=%s",
        (new_status, incident_id),
    )
    if rows == 0:
        flash("Incident not found.", "error")
    else:
        flash(f"Incident #{incident_id} marked {new_status}.", "success")
    return redirect(url_for("admin_dashboard"))


@app.route("/api/alerts/<int:alert_id>/delete", methods=["POST"])
@role_required("admin")
def api_delete_alert(alert_id):
    rows = db.execute("DELETE FROM alerts WHERE alert_id=%s", (alert_id,))
    if rows == 0:
        flash("Alert not found.", "error")
    else:
        flash(f"Alert #{alert_id} deleted.", "success")
    return redirect(url_for("admin_dashboard"))

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)