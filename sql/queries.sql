-- =============================================================================
-- queries.sql
-- Tiger Transit  --  Sewanee Shuttle Live Tracker
--
-- Student : Amyun Ghimire
-- Course  : CSCI 284, Databases with Web Applications
-- Date    : April 22, 2026
--
-- Purpose : Five non-trivial queries, each expressed first in plain English
--           (as a comment) and then implemented in MySQL.
--
-- =============================================================================


/*----------------------------------------------------------------------------
  1) LIVE TRACKER
     Where is shuttle "Tiger-1" right now?  Return the most recent latitude
     and longitude, the driver's full name, the route name, and how many
     seconds ago the location was recorded.  Only consider a trip whose
     status is still 'in_progress'.
-----------------------------------------------------------------------------*/
select s.shuttle_name as shuttle, u.full_name as driver,
        r.route_name as route, l.latitude,l.longitude, timestampdiff(second, l.recorded_at, now())
        as seconds_ago
from shuttles s
join trips t on t.shuttle_id = s.shuttle_id and t.status = 'in_progress' join users u on u.user_id = t.driver_id
join routes r on r.route_id = t.route_id join locations l on l.trip_id = t.trip_id
where s.shuttle_name = 'Tiger-1'
order by l.recorded_at desc
limit 1
;


/*----------------------------------------------------------------------------
  2) MOST ACTIVE DRIVER
     Which driver has logged the most total active driving time across
     all completed trips this semester (defined as on or after
     January 15, 2026)?  Return the driver's full name and total hours.
-----------------------------------------------------------------------------*/
select u.full_name as driver, round(sum(timestampdiff(minute, t.start_time, t.end_time)) / 60.0, 2) as total_hours
from users u join trips t on t.driver_id = u.user_id
where t.status = 'completed' and t.start_time >= '2026-01-15'
group by u.user_id, u.full_name
order by total_hours desc
limit 1
;


/*----------------------------------------------------------------------------
  3) WEEKEND-NIGHT POPULAR STOPS
     What are the three most-visited stops on weekend-night trips
     (trips whose start_time falls between 10:00 PM Friday and
     2:00 AM Sunday), and how many such trips pass through each?

     Weekend-night is encoded as:
        Friday  (dayofweek = 6) and start hour >= 22,  OR
        Saturday (dayofweek = 7),                       OR
        Sunday  (dayofweek = 1) and start hour <  2
-----------------------------------------------------------------------------*/
select st.stop_name, count(*) as visits
from trips t
join routes r on r.route_id = t.route_id
join route_stops  rs  on rs.route_id = r.route_id
join stops st  on st.stop_id = rs.stop_id
where ( (dayofweek(t.start_time) = 6 and hour(t.start_time) >= 22)
        or (dayofweek(t.start_time) = 7)
        or (dayofweek(t.start_time) = 1 and hour(t.start_time) <  2))
group by st.stop_id,
         st.stop_name
order by visits     desc,
         st.stop_name
limit    3
;


/*----------------------------------------------------------------------------
  4) SCHEDULE vs. REALITY
     For each route, compare the AVERAGE actual trip duration (minutes)
     against the SCHEDULED duration.  Scheduled duration is defined as
     the largest expected_min_from_start among that route's stops
     (the final stop's offset from the start).
-----------------------------------------------------------------------------*/
select r.route_name, actual.avg_actual_minutes,sched.scheduled_minutes, round(actual.avg_actual_minutes - sched.scheduled_minutes, 2) 
as minutes_over_schedule 
from routes r 
left join (select t.route_id, round(avg(timestampdiff(minute, t.start_time, t.end_time)), 2) as avg_actual_minutes
           from trips t
           where t.status = 'completed'
           group by t.route_id ) 
as actual on actual.route_id = r.route_id 
left join (select rs.route_id, max(rs.expected_min_from_start) as scheduled_minutes
           from route_stops rs
           group by rs.route_id) 
as sched on sched.route_id = r.route_id
order by r.route_name ;


/*----------------------------------------------------------------------------
  5) NEW DRIVERS WITH PATTERN-MATCHED USERNAMES
     List the username, full name, and email of every driver who
     registered within the last 14 days whose username STARTS with a
     letter and ENDS with a digit, plus how many trips each has driven
     since registering.  Include drivers with zero trips.
-----------------------------------------------------------------------------*/
select   u.username, u.full_name, u.email, count(t.trip_id) as trip_count
from users u left join trips t on t.driver_id  = u.user_id and t.start_time >= u.created_at
where u.role = 'driver' and u.created_at >= date_sub(now(), interval 14 day) and u.username regexp '^[A-Za-z].*[0-9]$'
group by u.user_id, u.username, u.full_name, u.email
order by u.username ;