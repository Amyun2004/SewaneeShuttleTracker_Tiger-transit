-- -----------------------------------------------------------------------------
-- Clean slate : drop child tables first, then parents.
-- -----------------------------------------------------------------------------
drop table if exists locations;
drop table if exists trips;
drop table if exists route_stops;
drop table if exists stops;
drop table if exists routes;
drop table if exists shuttles;
drop table if exists users;

-- =============================================================================
-- TABLE CREATION
-- =============================================================================


-- -----------------------------------------------------------------------------
-- users : every person with an account (rider, driver, or admin)
-- -----------------------------------------------------------------------------
create table users ( user_id int not null auto_increment,
                    username varchar(32) not null,
                    password_hash  varchar(128) not null,
                    email varchar(128) not null,
                    full_name varchar(96) not null,
                    role varchar(12) not null,
                    created_at datetime not null default current_timestamp,
                    primary key (user_id),
                    unique  key uq_users_username (username),
                    unique  key uq_users_email    (email));

-- -----------------------------------------------------------------------------
-- shuttles : the physical vehicles
-- -----------------------------------------------------------------------------
create table shuttles ( shuttle_id int not null auto_increment,
                        shuttle_name varchar(32) not null,
                        license_plate varchar(16) not null,
                        capacity int not null,
                        status varchar(16) not null,
                        primary key (shuttle_id),
                        unique  key uq_shuttles_name  (shuttle_name),
                        unique  key uq_shuttles_plate (license_plate)
);


-- -----------------------------------------------------------------------------
-- routes : named shuttle loops
-- -----------------------------------------------------------------------------
create table routes (
    route_id int not null auto_increment,
    route_name varchar(64) not null,
    description varchar(255),
    is_active tinyint(1) not null default 1,
    primary key (route_id),
    unique  key uq_routes_name (route_name)
);


-- -----------------------------------------------------------------------------
-- stops : every named pickup / drop-off location
-- -----------------------------------------------------------------------------
create table stops (
    stop_id int not null auto_increment,
    stop_name varchar(96) not null,
    latitude decimal(9,6) not null,
    longitude decimal(9,6) not null,
    description varchar(255),
    primary key (stop_id),
    unique  key uq_stops_name (stop_name)
);


-- -----------------------------------------------------------------------------
-- route_stops : junction table resolving routes <--> stops (many-to-many)
--   sequence_number and expected_min_from_start depend on BOTH keys together,
--   which is what satisfies 2NF for this composite-key table.
-- -----------------------------------------------------------------------------
create table route_stops (
    route_id int not null,
    stop_id int not null,
    sequence_number int not null,
    expected_min_from_start int not null,
    primary key (route_id, stop_id),
    foreign key (route_id) references routes (route_id),
    foreign key (stop_id)  references stops  (stop_id)
);


-- -----------------------------------------------------------------------------
-- trips : one row per actual shuttle run
-- -----------------------------------------------------------------------------
create table trips (
    trip_id int not null auto_increment,
    driver_id int not null,
    shuttle_id int not null,
    route_id int not null,
    start_time datetime not null,
    end_time datetime,
    status varchar(16) not null,
    primary key (trip_id),
    foreign key (driver_id)  references users    (user_id),
    foreign key (shuttle_id) references shuttles (shuttle_id),
    foreign key (route_id)   references routes   (route_id)
);


-- -----------------------------------------------------------------------------
-- locations : stream of GPS pings per trip
-- -----------------------------------------------------------------------------
create table locations (
    location_id int not null auto_increment,
    trip_id int not null,
    latitude decimal(9,6) not null,
    longitude decimal(9,6) not null,
    accuracy_meters decimal(6,2),
    speed_mph decimal(5,2),
    recorded_at datetime not null,
    primary key (location_id),
    foreign key (trip_id) references trips (trip_id)
);

--------------------------------------------------------
-- Mock data
--------------------------------------------------------

insert into users (username, password_hash, email, full_name, role, created_at) values
    ('jsmith',   'hash_placeholder_01', 'jsmith@sewanee.edu',   'Jordan Smith',     'rider',  '2026-01-15 10:00:00'),
    ('mpatel',   'hash_placeholder_02', 'mpatel@sewanee.edu',   'Maya Patel',       'rider',  '2026-01-22 12:30:00'),
    ('rchen',    'hash_placeholder_03', 'rchen@sewanee.edu',    'Ryan Chen',        'rider',  '2026-02-04 09:15:00'),
    ('kwilliams','hash_placeholder_04', 'kwill@sewanee.edu',    'Kaya Williams',    'rider',  '2026-04-12 18:45:00'),
    ('pgarcia',  'hash_placeholder_05', 'pgarcia@sewanee.edu',  'Paulo Garcia',     'driver', '2026-01-10 08:00:00'),
    ('driver2',  'hash_placeholder_06', 'driver2@sewanee.edu',  'Sasha Ivanova',    'driver', '2026-04-11 14:00:00'),
    ('alex7',    'hash_placeholder_07', 'alex7@sewanee.edu',    'Alex Thompson',    'driver', '2026-04-15 09:30:00'),
    ('admin_a',  'hash_placeholder_08', 'admin@sewanee.edu',    'Amyun Ghimire',    'admin',  '2026-01-05 08:00:00');


insert into shuttles (shuttle_name, license_plate, capacity, status) values
    ('Tiger-1', 'TN-ABC123', 14, 'active'),
    ('Tiger-2', 'TN-XYZ789', 20, 'active');


insert into routes (route_name, description, is_active) values
    ('Daytime Loop',        'Weekday daytime shuttle around central campus and residence halls.', 1),
    ('Weekend Night Route', 'Friday and Saturday evening route serving the Village and Shenanigans.', 1);


insert into stops (stop_name, latitude, longitude, description) values
    ('McClurg Dining Hall',  35.205400, -85.922100, 'Main dining hall, central campus.'),
    ('duPont Library',       35.204800, -85.921500, 'Library and study hub.'),
    ('Hodson Hill',          35.203000, -85.925000, 'Upperclass residence area.'),
    ('Quintard Hall',        35.204200, -85.924000, 'Residence hall near the Village.'),
    ('Sewanee Inn',          35.206800, -85.920000, 'Near the entrance to campus.'),
    ('Sewanee Market',       35.207500, -85.919000, 'Grocery in Sewanee Village.'),
    ('Shenanigans',          35.207200, -85.918500, 'Restaurant / bar in the Village.'),
    ('Spencer Hall',         35.204500, -85.923200, 'Science classroom building.');


insert into route_stops (route_id, stop_id, sequence_number, expected_min_from_start) values
    (1, 1, 1, 0),
    (1, 2, 2, 5),
    (1, 8, 3, 10),
    (1, 4, 4, 18),
    (1, 3, 5, 26);

insert into route_stops (route_id, stop_id, sequence_number, expected_min_from_start) values
    (2, 1, 1, 0),
    (2, 5, 2, 6),
    (2, 6, 3, 11),
    (2, 7, 4, 15),
    (2, 3, 5, 22);


insert into trips (driver_id, shuttle_id, route_id, start_time, end_time, status) values
    (5, 1, 1, '2026-04-13 08:00:00', '2026-04-13 08:28:00', 'completed'),
    (5, 1, 1, '2026-04-13 09:00:00', '2026-04-13 09:30:00', 'completed'),
    (5, 1, 1, '2026-04-14 08:00:00', '2026-04-14 08:27:00', 'completed'),
    (6, 2, 1, '2026-04-15 08:05:00', '2026-04-15 08:35:00', 'completed'),
    (5, 1, 2, '2026-04-17 22:30:00', '2026-04-17 22:55:00', 'completed'),
    (5, 1, 2, '2026-04-17 23:15:00', '2026-04-17 23:40:00', 'completed'),
    (6, 2, 2, '2026-04-18 22:00:00', '2026-04-18 22:24:00', 'completed'),
    (6, 2, 2, '2026-04-18 23:00:00', '2026-04-18 23:26:00', 'completed'),
    (7, 2, 2, '2026-04-18 00:30:00', '2026-04-18 00:55:00', 'completed'),
    (5, 1, 1, '2026-04-20 08:00:00', '2026-04-20 08:32:00', 'completed'),
    (6, 1, 1, '2026-04-22 10:00:00',  null,                 'in_progress');


insert into locations (trip_id, latitude, longitude, accuracy_meters, speed_mph, recorded_at) values
    ( 1, 35.205400, -85.922100,  8.0, 12.0, '2026-04-13 08:00:05'),
    ( 1, 35.204800, -85.921500,  8.0, 14.0, '2026-04-13 08:05:20'),
    ( 1, 35.203000, -85.925000,  9.0, 10.0, '2026-04-13 08:26:40'),
    ( 5, 35.205400, -85.922100,  7.0, 11.0, '2026-04-17 22:30:10'),
    ( 5, 35.207200, -85.918500,  8.0, 13.0, '2026-04-17 22:45:30'),
    (11, 35.205400, -85.922100,  6.0, 10.0, '2026-04-22 10:00:05'),
    (11, 35.204800, -85.921500,  6.5, 12.0, '2026-04-22 10:05:12'),
    (11, 35.203500, -85.923800,  5.8, 11.5, '2026-04-22 10:09:48');

-------------
-- Mock data end
-------------