"""middleware/auth_middleware.py — JWT helpers and decorators"""
from functools import wraps
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
from flask import g
from models.user import User
from utils.responses import error


def jwt_required_custom(fn):
    """Decorator: verifies JWT and attaches current_user to Flask g."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            verify_jwt_in_request()
        except Exception as exc:
            return error("Authentication required. Please log in.", 401)

        user_id = get_jwt_identity()
        user = User.query.get(user_id)
        if not user or not user.is_active:
            return error("User account not found or disabled.", 401)

        g.current_user = user
        return fn(*args, **kwargs)
    return wrapper


def get_current_user() -> User | None:
    """Retrieve current user from Flask g (after jwt_required_custom)."""
    return getattr(g, "current_user", None)
