# Sewanee Transit

A live shuttle tracking web app for the University of the South. Riders see
where the buses are right now and roughly when they'll get to a stop.
Drivers push GPS pings while they're driving. Admins manage routes, alerts,
and incident reports.

Built for CSCI 284 (Databases with Web Applications), Spring 2026.

Author: Amyun Ghimire


## Live site

https://curvy-unsoiled-quarterly.ngrok-free.dev 

If the live link is unavailable, the project runs locally in a few minutes,
see the Setup section below. Test accounts and credentials are listed under
"Test accounts."


## What it does

* Live map of every shuttle currently running a trip. Markers update every
  five seconds without a page reload.
* "Nearest shuttle" widget showing distance, walking time, and ETA from the
  rider's current GPS position. Distance is computed on the server using
  the Haversine formula for great-circle distance on a sphere.
* Schedule page listing every active route with its stops in order and the
  expected minute each stop is reached.
* Trip history page with filters by date range, route, and shuttle. Past
  trips are drawn as colored polylines on the map.
* Driver dashboard for starting and ending trips. While a trip is active,
  the browser sends a GPS ping every five seconds; the page survives a
  refresh by resuming any in-progress trip from the database.
* Three roles (rider, driver, admin) backed by a `user_roles` join table so
  one user can hold multiple roles and switch modes from the navbar.
* Incident reports for any signed-in user, with an admin inbox for triage
  (open / reviewing / resolved).
* System alerts (info / warning / critical) that admins publish from the
  homepage and delete from the admin dashboard.
* Werkzeug PBKDF2-SHA256 password hashing, parameterized SQL queries, regex
  validation on usernames / passwords / emails, and signed-cookie sessions
  for authentication.


## Stack

* Python 3.9+ and Flask
* MySQL / MariaDB, accessed through `mysql-connector-python` with a small
  connection pool defined in `db.py`
* Jinja2 templates, plain JavaScript, Leaflet for the map, Tailwind CSS via
  CDN for styling
* `python-dotenv` for loading config from a `.env` file


## Files

```
app.py              all Flask routes, auth helpers, geo helpers
db.py               connection pool plus query / query_one / execute helpers
db-build.sql        full schema and seed data - drop, create, populate
seed_passwords.py   one-shot script to set real password hashes after seeding
queries.sql         the five non-trivial queries from the milestone rubric
requirements.txt    Python dependencies
README.md           this file
.env.example        config template - copy to .env and fill in real values

templates/          Jinja2 templates
  base.html         shared layout: navbar, footer, flash messages
  landing.html      homepage for logged-out users
  index.html        homepage for logged-in users
  login.html        sign-in (separate tabs for student/staff vs driver/admin)
  register.html     account creation
  view.html         rider's live map
  schedule.html     static route schedule
  history.html      past trips visualized on the map
  track.html        driver dashboard
  admin.html        admin dashboard with the rubric queries

static/
  css/style.css     custom styles (animations, Leaflet overrides, modals)
  js/view.js        rider map: poll /api/shuttles/live every 5s
  js/schedule.js    schedule page: fetch and render route data
  js/history.js     history page: draw past-trip polylines
  js/track.js       driver page: GPS streaming loop
```


## Setup

### 1. Install Python dependencies

From the project root:

```
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux
pip install -r requirements.txt
```

### 2. Configure your environment

Copy `.env.example` to `.env` and fill in your local MySQL credentials:

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=sewanee_transit
FLASK_SECRET_KEY=any-long-random-string
```

To generate a random secret key:

```
python -c "import secrets; print(secrets.token_hex(32))"
```

### 3. Build the schema and seed data

First create the database (one-time setup):

```
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS sewanee_transit;"
```

Then load the schema and seed data:

```
mysql -u root -p sewanee_transit < db-build.sql
```

On Windows PowerShell, the `<` operator isn't supported. Use this instead:

```
Get-Content db-build.sql | mysql -u root -p sewanee_transit
```

### 4. Set real password hashes on the seeded accounts

```
python seed_passwords.py
```

Every seeded user ends up with the password `Password1`.

### 5. Run the app

```
flask --app app run --debug
```

Then open `http://localhost:5000` in your browser.

---

## Deployment Pipeline & Network Routing (Ngrok)
Due to institutional security protocols, the university's Linux server blocks inbound external HTTP requests, preventing the frontend web server from communicating directly with the backend API. To bypass this, I engineered a custom deployment pipeline:


* **Reverse-Proxy Tunneling:** I utilize an **Ngrok** tunnel to securely expose the local Flask server port (5000) on University Lab Computer to the public internet, creating a bridge through the firewall.

* **System Constraints:** The live database connection is dependent on the Ngrok process remaining actively running on the host Linux machine. If the live operational link above renders the UI but fails to load data, it indicates the proxy tunnel has been spun down for the day.

---

## Test accounts

After step 4, all of these use the password `Password1`:

| Username   | Role   | Full name      | Login tab        |
|------------|--------|----------------|------------------|
| `jsmith1`  | rider  | Jordan Smith   | Student / Staff  |
| `mpatel2`  | rider  | Maya Patel     | Student / Staff  |
| `pgarcia5` | driver | Paulo Garcia   | Driver / Admin   |
| `admin0`   | admin  | Amyun Ghimire  | Driver / Admin   |

The admin account also has driver and rider roles, so you can use the
"switch mode" menu in the navbar to demo all three views from one login.


## Database schema

Ten tables total. Foreign keys and indexes are defined in `db-build.sql`.

| Table         | Purpose                                                      |
|---------------|--------------------------------------------------------------|
| `users`       | One row per account. Username, hashed password, role, email. |
| `user_roles`  | Junction table: a user can hold multiple roles.              |
| `shuttles`    | Physical vehicles (name, plate, capacity, status).           |
| `routes`      | Named loops (e.g. "Tiger Loop").                             |
| `stops`       | Named pickup locations with lat/lng.                         |
| `route_stops` | Junction table: which stops are on which route, in order.   |
| `trips`       | One row per actual run (driver, shuttle, route, start/end). |
| `locations`   | GPS pings — about 360 rows per 30-minute trip.               |
| `alerts`      | Admin-published banners shown on the homepage.               |
| `incidents`   | Rider-submitted issue reports with admin status workflow.    |


## API endpoints

The main ones, if you want to poke around:

| Method | Path                          | Purpose                            |
|--------|-------------------------------|------------------------------------|
| GET    | `/api/shuttles/live`          | All in-service shuttles + bearings |
| GET    | `/api/shuttles/nearest`       | Closest shuttle to a given lat/lng |
| GET    | `/api/stops`                  | All shuttle stops                  |
| GET    | `/api/routes/<id>`            | One route + its ordered stops      |
| GET    | `/api/history?days=N`         | Past trips, filterable             |
| POST   | `/api/trips/start`            | Driver starts a trip               |
| POST   | `/api/trips/<id>/ping`        | Driver posts a GPS sample          |
| POST   | `/api/trips/<id>/end`         | Driver ends a trip                 |
| POST   | `/api/incidents`              | Any signed-in user files a report  |
| POST   | `/api/incidents/<id>/status`  | Admin updates report status        |
| POST   | `/api/alerts`                 | Admin publishes an alert           |
| POST   | `/api/alerts/<id>/delete`     | Admin deletes an alert             |


## Input validation

All user input is validated server-side with regular expressions:

* **Username:** `^[A-Za-z][A-Za-z0-9_]{2,30}[0-9]$`
  Starts with a letter, ends with a digit, 4–32 characters total, only
  letters / digits / underscores in between.
* **Password:** at least 8 characters, with at least one letter and at
  least one digit. Hashed with `werkzeug.security.generate_password_hash`
  before storage — the plaintext never touches the database.
* **Email:** simple `something@something.something` regex, lowercased
  before insert. The `unique` constraint on `users.email` prevents
  duplicates at the database level.


## Live Demo
`Shuttle_Tracker\tiger-transit\assets\video\LiveDemo.mp4`

## Accessibility references

Styling decisions in `style.css` were checked against:

1. **WebAIM Contrast Checker** — confirmed Sewanee purple `#582C83` on
   white passes WCAG AA contrast, and that the gold `#C8A051` is only ever
   used with white text on dark backgrounds.
   <https://webaim.org/resources/contrastchecker/>
2. **MDN — ARIA: Roles, States, and Properties** — used for `aria-label`
   on icon-only buttons (the mobile hamburger) and `aria-hidden` on
   decorative images.
   <https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA>
3. **W3C WCAG 2.1 Quick Reference** — used as a checklist: body text at
   14px or larger, never use color alone to convey state, always include
   alt text on meaningful images.
   <https://www.w3.org/WAI/WCAG21/quickref/>


## Notes for graders

* **Tailwind is loaded from a CDN** (`cdn.tailwindcss.com`). The browser
  console will print a warning saying not to use this in production. For a
  class project this is fine; the production fix is to install Tailwind
  via npm and run a build step, which would add Node.js to the toolchain
  and is out of scope for a database course.
* **An internet connection is needed** the first time the site loads, so
  Tailwind, Leaflet, and Google Fonts can be fetched from their CDNs.
* **Geolocation requires HTTPS** in modern browsers, with one exception:
  `localhost` is treated as secure, so GPS works fine for local
  development without a TLS certificate.
* **Database resets:** if you re-run `db-build.sql` while you have an open
  browser session, sign out and sign back in. Your old session cookie
  still references the previous `user_id`, which no longer exists in the
  rebuilt `users` table — any database write will fail with a foreign-key
  error until the session is refreshed.


## Known limitations

These are things that work for the demo but would need attention before
any real deployment:

* If a driver closes the browser mid-trip without hitting "End Trip," the
  trip stays in `in_progress` status indefinitely. A scheduled cleanup job
  (close any trip with no pings in the last hour) would fix this.
* GPS accuracy is recorded but not filtered. A real production system
  would discard pings with accuracy worse than ~50m or apply a Kalman
  filter to smooth the path.
* The "delayed / on-time" classification compares total trip duration to
  total scheduled duration. A more sophisticated version would compare
  each GPS ping to the expected position at that moment, so mid-route
  delays are visible.