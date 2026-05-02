# Sewanee Transit

A live shuttle tracking web app for the University of the South. Riders see
where the buses are right now and roughly when they'll get to a stop. Drivers
push GPS pings while they're driving. Admins manage routes, alerts, and
incident reports.

Built for CSCI 284 (Databases with Web Applications), Spring 2026.

Author: Amyun Ghimire


## What it does

* Live map of every shuttle that's currently running a trip. Markers update
  every few seconds.
* Distance and ETA from your location to the nearest shuttle, computed with
  the Haversine formula on the server.
* Schedule page that lists every active route with its stops in order.
* Trip history with filters (date range, route, shuttle). Past trips are
  drawn as polylines on the map.
* Driver page for starting and ending trips and posting GPS pings.
* Three roles (rider, driver, admin) with a join table so one user can have
  more than one role and switch modes from the nav.
* Incident reports for any signed-in user, with an admin inbox for triage.
* System alerts (info / warning / critical) that admins can publish.
* Werkzeug password hashing, regex validation on usernames/passwords/emails,
  Flask sessions for auth.


## Stack

* Python 3.9+ and Flask
* MySQL / MariaDB, accessed through `mysql-connector-python` with a small
  connection pool in `db.py`
* Jinja2 templates, Tailwind via CDN, Leaflet for the map, plain JS
* `python-dotenv` for config


## Files

```
app.py              all Flask routes, auth, and the geo helpers
db.py               connection pool plus query / query_one / execute
db-build.sql        full schema and seed data
seed_passwords.py   one-shot script to set real password hashes after seeding
queries.sql         the five non-trivial queries from the milestone rubric
requirements.txt
README.md
templates/          base, index, landing, login, register, view, schedule,
                    history, track, admin
static/
  style.css
  view.js, schedule.js, history.js, track.js
  img/              campus photo, app screenshots, bus icon
```


## Setup

1. Install the Python deps:

   ```
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. Make a `.env` file in the project root with your MySQL info:

   ```
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=sewanee_transit
   FLASK_SECRET_KEY=anything-random
   ```

3. Build the schema and seed data:

   ```
   mysql -u root -p < db-build.sql
   ```

4. Set real passwords on the seeded accounts:

   ```
   python seed_passwords.py
   ```

   Every seeded user ends up with the password `Password1`.

5. Run it:

   ```
   flask --app app run --debug
   ```

   Then open http://localhost:5000.


## Test accounts

After step 4, all of these use password `Password1`:

* `jsmith1`  (rider)    Jordan Smith
* `mpatel2`  (rider)    Maya Patel
* `pgarcia5` (driver)   Paulo Garcia
* `admin0`   (admin)    Amyun Ghimire

On the login page, use the "Student / Staff" tab for the riders and the
"Driver / Admin" tab for the other two.


## API endpoints

The main ones, in case you want to poke around:

* `GET  /api/shuttles/live`         live shuttles with bearing
* `GET  /api/shuttles/nearest`      nearest shuttle to a lat/lng
* `POST /api/trips/start`           driver starts a trip
* `POST /api/trips/<id>/ping`       driver posts a GPS sample
* `POST /api/trips/<id>/end`        driver ends the trip
* `GET  /api/history`               past trips, filterable
* `GET  /api/routes/<id>`           one route plus its ordered stops
* `GET  /api/stops`                 all stops
* `POST /api/incidents`             file an incident
* `POST /api/alerts`                admin publishes an alert


## Validation

* Usernames must match `^[A-Za-z][A-Za-z0-9_]{2,30}[0-9]$`. Start with a
  letter, end with a digit, 4 to 32 chars total, letters/digits/underscores
  only.
* Passwords need at least 8 chars, with at least one letter and one digit.
* Emails: simple `something@something.something` regex, lowercased before
  saving.


## Accessibility references

The styling decisions in `style.css` were checked against:

1. WebAIM Contrast Checker (https://webaim.org/resources/contrastchecker/).
   Used to confirm Sewanee purple #582C83 on white passes WCAG AA, and
   that the gold #C8A051 is only paired with white text on dark backgrounds.

2. MDN, ARIA: Roles, States, and Properties
   (https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA).
   Used for `aria-label` on icon-only buttons (the mobile hamburger) and
   `aria-hidden` on decorative images.

3. W3C WCAG 2.1 Quick Reference (https://www.w3.org/WAI/WCAG21/quickref/).
   Used as a checklist: keep body text at 14px or larger, never use color
   alone to convey state, and always include alt text on meaningful images.


## Notes

Tailwind is loaded from the CDN (`cdn.tailwindcss.com`). The browser will
print a warning saying not to use it in production. For a class submission
this is fine; the production fix is to install Tailwind via npm and run a
build step, which adds Node.js to the toolchain and isn't worth it here.

An internet connection is needed to load Tailwind, Leaflet, and Google
Fonts the first time the page is opened.