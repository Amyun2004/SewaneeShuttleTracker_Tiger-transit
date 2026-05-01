# Sewanee Transit (Tiger Transit)

A live shuttle tracking web app for the University of the South. Riders see where the buses are right now and when they'll reach their stop; drivers stream GPS pings while their trip is in progress; admins manage routes, alerts, and incident reports.

Built for **CSCI 284 — Databases with Web Applications**.

---

## Features

- **Live map** of every in-progress shuttle, refreshed from `/api/shuttles/live`, with a pulsing marker, current bearing, and distance/ETA to the nearest stop (Haversine + great-circle bearing computed server-side).
- **Schedule view** of all active routes and their ordered stop lists, including expected minutes from start.
- **Trip history** with per-trip GPS polylines drawn on Leaflet, filterable by date range, route, and shuttle.
- **Driver tracking page** that starts/ends trips and posts GPS pings to `/api/trips/<id>/ping`.
- **Three roles** — `rider`, `driver`, `admin` — with a `user_roles` join table so one person can hold multiple roles and switch modes from the nav.
- **Incident reporting** for any signed-in user, with categorized severity and admin triage.
- **System-wide alerts** (info / warning / critical) that admins can publish from the admin dashboard.
- **Auth** built on Werkzeug password hashing, regex-validated usernames/passwords/emails, and Flask session cookies.

---

## Tech Stack

| Layer    | Choice |
|----------|--------|
| Backend  | Python 3.9+, Flask |
| Database | MySQL / MariaDB (via `mysql-connector-python` with a 5-connection pool) |
| Frontend | Jinja2 templates, Tailwind (CDN), Leaflet for maps, vanilla JS |
| Auth     | Werkzeug `pbkdf2:sha256` password hashing, Flask sessions |
| Config   | `python-dotenv` for environment variables |

---

## Project Structure

```
.
├── app.py              # Flask routes, auth, geo helpers, all API endpoints
├── db.py               # MySQL connection pool + query/query_one/execute helpers
├── db-build.sql        # Schema + seed data (users, shuttles, routes, stops, trips...)
├── seed_passwords.py   # One-shot script to replace placeholder hashes with real ones
├── queries.sql         # The five rubric queries (live tracker, top driver, etc.)
├── requirements.txt
├── pyproject.toml
│
├── templates/          # base, index, login, register, view, schedule, history, track, admin
└── static/
    ├── css/style.css
    └── js/             # view.js, schedule.js, history.js, track.js
```

---

## Setup

### 1. Clone and install dependencies

```bash
git clone <this-repo>
cd sewanee-transit
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure environment

Create a `.env` file in the project root:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=sewanee_transit
FLASK_SECRET_KEY=change-me-to-something-random
```

### 3. Build the database

```bash
mysql -u root -p < db-build.sql
```

This creates the `sewanee_transit` schema (users, shuttles, routes, stops, route_stops, trips, locations, user_roles) and inserts seed data with placeholder password hashes.

### 4. Seed real passwords

```bash
python seed_passwords.py
```

All seed accounts will be set to password **`Password1`**.

### 5. Run

```bash
flask --app app run --debug
```

Then open <http://localhost:5000>.

---

## Test Accounts

After running `seed_passwords.py`, all four accounts use password `Password1`:

| Username   | Role   | Name           |
|------------|--------|----------------|
| `jsmith1`  | rider  | Jordan Smith   |
| `mpatel2`  | rider  | Maya Patel     |
| `pgarcia5` | driver | Paulo Garcia   |
| `admin0`   | admin  | Amyun Ghimire  |

Sign in with the **Driver / Admin** option for `pgarcia5` and `admin0`; use the **Student / Staff** option for the riders.

---

## Key API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET    | `/api/shuttles/live`           | All in-progress shuttles with latest GPS + bearing |
| GET    | `/api/shuttles/nearest`        | Nearest shuttle to a given lat/lng |
| POST   | `/api/trips/start`             | Driver: start a new trip on a route |
| POST   | `/api/trips/<id>/ping`         | Driver: post a GPS sample |
| POST   | `/api/trips/<id>/end`          | Driver: finish a trip |
| GET    | `/api/history`                 | Trip traces filtered by days/route/shuttle |
| GET    | `/api/routes/<id>`             | Route details + ordered stops |
| GET    | `/api/stops`                   | All stops |
| POST   | `/api/incidents`               | File an incident report |
| POST   | `/api/alerts`                  | Admin: publish a system alert |

---

## Validation Rules

- **Usernames** — must match `^[A-Za-z][A-Za-z0-9_]{2,30}[0-9]$` (start with a letter, end with a digit, 4–32 chars).
- **Passwords** — at least 8 characters with at least one letter and one digit.
- **Emails** — basic `something@something.something` regex.

---

## Author

Amyun Ghimire — CSCI 284, Spring 2026, University of the South.