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
create table users (
    user_id        int             not null auto_increment,
    username       varchar(32)     not null,
    password_hash  varchar(128)    not null,
    email          varchar(128)    not null,
    full_name      varchar(96)     not null,
    role           varchar(12)     not null,
    created_at     datetime        not null default current_timestamp,

    primary key (user_id),
    unique  key uq_users_username (username),
    unique  key uq_users_email    (email)
);

-- -----------------------------------------------------------------------------
-- shuttles : the physical vehicles
-- -----------------------------------------------------------------------------
create table shuttles (
    shuttle_id     int             not null auto_increment,
    shuttle_name   varchar(32)     not null,
    license_plate  varchar(16)     not null,
    capacity       int             not null,
    status         varchar(16)     not null,

    primary key (shuttle_id),
    unique  key uq_shuttles_name  (shuttle_name),
    unique  key uq_shuttles_plate (license_plate)
);


-- -----------------------------------------------------------------------------
-- routes : named shuttle loops
-- -----------------------------------------------------------------------------
create table routes (
    route_id    int             not null auto_increment,
    route_name  varchar(64)     not null,
    description varchar(255),
    is_active   tinyint(1)      not null default 1,

    primary key (route_id),
    unique  key uq_routes_name (route_name)
);


-- -----------------------------------------------------------------------------
-- stops : every named pickup / drop-off location
-- -----------------------------------------------------------------------------
create table stops (
    stop_id     int             not null auto_increment,
    stop_name   varchar(96)     not null,
    latitude    decimal(9,6)    not null,
    longitude   decimal(9,6)    not null,
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
    route_id                 int        not null,
    stop_id                  int        not null,
    sequence_number          int        not null,
    expected_min_from_start  int        not null,

    primary key (route_id, stop_id),
    foreign key (route_id) references routes (route_id),
    foreign key (stop_id)  references stops  (stop_id)
);


-- -----------------------------------------------------------------------------
-- trips : one row per actual shuttle run
-- -----------------------------------------------------------------------------
create table trips (
    trip_id     int         not null auto_increment,
    driver_id   int         not null,
    shuttle_id  int         not null,
    route_id    int         not null,
    start_time  datetime    not null,
    end_time    datetime,
    status      varchar(16) not null,

    primary key (trip_id),
    foreign key (driver_id)  references users    (user_id),
    foreign key (shuttle_id) references shuttles (shuttle_id),
    foreign key (route_id)   references routes   (route_id)
);


-- -----------------------------------------------------------------------------
-- locations : stream of GPS pings per trip
-- -----------------------------------------------------------------------------
create table locations (
    location_id      int           not null auto_increment,
    trip_id          int           not null,
    latitude         decimal(9,6)  not null,
    longitude        decimal(9,6)  not null,
    accuracy_meters  decimal(6,2),
    speed_mph        decimal(5,2),
    recorded_at      datetime      not null,

    primary key (location_id),
    foreign key (trip_id) references trips (trip_id)
);