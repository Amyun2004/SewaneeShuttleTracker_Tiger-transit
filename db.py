# =========================================
# Sewanee Transit - CSCI 284, Spring 2026
# Author: Amyun Ghimire, Anthony Saravia
# SEWANEE TRANSIT — Database helpers
# db.py
#
# Centralizes all MariaDB/MySQL access.
# Reads credentials from environment variables
# (with sensible localhost defaults for the lab).
#
# Public API:
#   query(sql, params=None)   -> list of dict rows  (for SELECT)
#   query_one(sql, params=None) -> single dict or None
#   execute(sql, params=None) -> int (lastrowid for INSERT, rowcount otherwise)
# =========================================

import os
import mysql.connector
from mysql.connector import pooling

# -----------------------------------------------------------------------------
# Configuration — pulled from environment variables.
# Defaults match a typical local MariaDB install on the Sewanee lab machines.
# -----------------------------------------------------------------------------
DB_CONFIG = {
    "host":     os.environ.get("DB_HOST", "localhost"),
    "port":     int(os.environ.get("DB_PORT", "3306")),
    "user":     os.environ.get("DB_USER", "root"),
    "password": os.environ.get("DB_PASSWORD", ""),
    "database": os.environ.get("DB_NAME", "sewanee_transit"),
    "autocommit": True,
    "charset":  "utf8mb4",
}

# A small connection pool so we don't open a fresh socket per request.
# pool_size=5 is plenty for a class demo.
_pool = pooling.MySQLConnectionPool(
    pool_name="sewanee_transit_pool",
    pool_size=5,
    **DB_CONFIG
)


def _get_conn():
    """Borrow a connection from the pool. Caller must close it."""
    return _pool.get_connection()


def query(sql, params=None):
    """
    Run a SELECT and return all rows as a list of dicts.
    Use %s placeholders for parameters — never f-strings (SQL injection).
    """
    conn = _get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(sql, params or ())
        rows = cur.fetchall()
        cur.close()
        return rows
    finally:
        conn.close()


def query_one(sql, params=None):
    """Like query() but returns just the first row (or None)."""
    rows = query(sql, params)
    return rows[0] if rows else None


def execute(sql, params=None):
    """
    Run an INSERT / UPDATE / DELETE.
    Returns lastrowid for INSERTs, rowcount otherwise.
    """
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(sql, params or ())
        result = cur.lastrowid if cur.lastrowid else cur.rowcount
        cur.close()
        return result
    finally:
        conn.close()

def query_scalar(sql, params=None):
    """Run a query that returns a single value (e.g. COUNT(*)). Returns None if no rows."""
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(sql, params or ())
        row = cur.fetchone()
        cur.close()
        return row[0] if row else None
    finally:
        conn.close()