# seed_passwords.py — run once after db-build.sql to set real passwords
from dotenv import load_dotenv
load_dotenv()
import db
from werkzeug.security import generate_password_hash

PASSWORD = "Password1"
hash_ = generate_password_hash(PASSWORD)

db.execute("UPDATE users SET password_hash = %s WHERE password_hash LIKE 'pbkdf2:%%placeholder%%' OR password_hash LIKE 'hash_placeholder%%'", (hash_,))
print(f"All seed passwords set to: {PASSWORD}")