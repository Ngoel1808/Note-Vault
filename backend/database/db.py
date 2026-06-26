"""database/db.py — SQLAlchemy instance (shared singleton)"""
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager
from flask_mail import Mail
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

db      = SQLAlchemy()
bcrypt  = Bcrypt()
jwt     = JWTManager()
mail    = Mail()
limiter = Limiter(key_func=get_remote_address)
