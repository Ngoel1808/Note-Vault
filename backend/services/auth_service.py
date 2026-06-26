"""services/auth_service.py — Authentication business logic"""
import os
import secrets
import string
from datetime import datetime, timedelta

import requests as http_requests
from flask import current_app
from flask_mail import Message
from flask_jwt_extended import create_access_token, create_refresh_token
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from database.db import db, mail
from models.user import User
from utils.validators import validate_email, validate_password, validate_name


# ──────────────────────────────────────────────────────────────
#  Local Auth
# ──────────────────────────────────────────────────────────────

def register_user(full_name: str, email: str, password: str) -> dict:
    errors = {}
    err = validate_name(full_name)
    if err: errors["full_name"] = err
    err = validate_email(email)
    if err: errors["email"] = err
    err = validate_password(password)
    if err: errors["password"] = err
    if errors:
        return {"ok": False, "errors": errors}

    if User.query.filter_by(email=email.lower()).first():
        return {"ok": False, "errors": {"email": "An account with this email already exists."}}

    user = User(full_name=full_name.strip(), email=email.lower().strip())
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    tokens = _create_tokens(user)
    return {"ok": True, "user": user.to_dict(), **tokens}


def login_user(email: str, password: str) -> dict:
    if not email or not password:
        return {"ok": False, "message": "Email and password are required."}

    user = User.query.filter_by(email=email.lower().strip()).first()
    if not user or not user.check_password(password):
        return {"ok": False, "message": "Invalid email or password."}
    if not user.is_active:
        return {"ok": False, "message": "This account has been disabled."}

    tokens = _create_tokens(user)
    return {"ok": True, "user": user.to_dict(), **tokens}


def change_password(user: User, current_pw: str, new_pw: str) -> dict:
    if not user.check_password(current_pw):
        return {"ok": False, "message": "Current password is incorrect."}
    err = validate_password(new_pw)
    if err:
        return {"ok": False, "message": err}
    user.set_password(new_pw)
    db.session.commit()
    return {"ok": True}


def forgot_password(email: str) -> dict:
    user = User.query.filter_by(email=email.lower().strip()).first()
    # Always return success to prevent email enumeration
    if not user:
        return {"ok": True}

    token = _generate_token(48)
    user.reset_token = token
    user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
    db.session.commit()

    # Send email
    try:
        reset_link = f"{current_app.config['FRONTEND_URL']}/auth.html?reset={token}"
        msg = Message(
            subject="Reset your Note Vault password",
            recipients=[user.email],
            html=f"""
            <h2>Password Reset</h2>
            <p>Hi {user.full_name},</p>
            <p>Click the link below to reset your password. It expires in 1 hour.</p>
            <a href="{reset_link}" style="background:#4F46E5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Reset Password</a>
            <p>If you didn't request this, ignore this email.</p>
            """,
        )
        mail.send(msg)
    except Exception as exc:
        current_app.logger.warning(f"Mail send failed: {exc}")

    return {"ok": True}


def reset_password(token: str, new_password: str) -> dict:
    err = validate_password(new_password)
    if err:
        return {"ok": False, "message": err}

    user = User.query.filter_by(reset_token=token).first()
    if not user or not user.reset_token_expires:
        return {"ok": False, "message": "Invalid or expired reset link."}
    if user.reset_token_expires < datetime.utcnow():
        return {"ok": False, "message": "Reset link has expired. Please request a new one."}

    user.set_password(new_password)
    user.reset_token = None
    user.reset_token_expires = None
    db.session.commit()
    return {"ok": True}


# ──────────────────────────────────────────────────────────────
#  Google OAuth
# ──────────────────────────────────────────────────────────────

def google_oauth(id_token_str: str) -> dict:
    client_id = current_app.config.get("GOOGLE_CLIENT_ID")
    if not client_id:
        return {"ok": False, "message": "Google OAuth not configured on server."}

    try:
        idinfo = id_token.verify_oauth2_token(
            id_token_str,
            google_requests.Request(),
            client_id,
        )
    except ValueError as exc:
        return {"ok": False, "message": f"Invalid Google token: {exc}"}

    email     = idinfo.get("email", "").lower()
    name      = idinfo.get("name", email.split("@")[0])
    picture   = idinfo.get("picture", "")
    google_id = idinfo.get("sub")

    user = User.query.filter_by(email=email).first()
    if user:
        # Update OAuth info if needed
        if user.auth_provider != "google":
            user.auth_provider = "google"
            user.oauth_id = google_id
        if picture and not user.profile_image:
            user.profile_image = picture
        db.session.commit()
    else:
        user = User(
            full_name=name, email=email,
            auth_provider="google", oauth_id=google_id,
            profile_image=picture,
        )
        db.session.add(user)
        db.session.commit()

    tokens = _create_tokens(user)
    return {"ok": True, "user": user.to_dict(), **tokens}


# ──────────────────────────────────────────────────────────────
#  GitHub OAuth
# ──────────────────────────────────────────────────────────────

def github_oauth_exchange(code: str) -> dict:
    client_id     = current_app.config.get("GITHUB_CLIENT_ID")
    client_secret = current_app.config.get("GITHUB_CLIENT_SECRET")
    if not client_id or not client_secret:
        return {"ok": False, "message": "GitHub OAuth not configured on server."}

    # Exchange code for access token
    token_resp = http_requests.post(
        "https://github.com/login/oauth/access_token",
        data={"client_id": client_id, "client_secret": client_secret, "code": code},
        headers={"Accept": "application/json"},
        timeout=10,
    )
    token_data = token_resp.json()
    access_token = token_data.get("access_token")
    if not access_token:
        return {"ok": False, "message": "GitHub did not return an access token."}

    # Get user info
    user_resp = http_requests.get(
        "https://api.github.com/user",
        headers={"Authorization": f"token {access_token}", "Accept": "application/json"},
        timeout=10,
    )
    github_user = user_resp.json()

    # Get primary email if not public
    email = github_user.get("email")
    if not email:
        emails_resp = http_requests.get(
            "https://api.github.com/user/emails",
            headers={"Authorization": f"token {access_token}"},
            timeout=10,
        )
        for e in emails_resp.json():
            if e.get("primary") and e.get("verified"):
                email = e["email"]
                break

    if not email:
        return {"ok": False, "message": "Could not retrieve email from GitHub."}

    email     = email.lower()
    name      = github_user.get("name") or github_user.get("login", email.split("@")[0])
    avatar    = github_user.get("avatar_url", "")
    github_id = str(github_user.get("id"))

    user = User.query.filter_by(email=email).first()
    if user:
        if user.auth_provider != "github":
            user.auth_provider = "github"
            user.oauth_id = github_id
        db.session.commit()
    else:
        user = User(
            full_name=name, email=email,
            auth_provider="github", oauth_id=github_id,
            profile_image=avatar,
        )
        db.session.add(user)
        db.session.commit()

    tokens = _create_tokens(user)
    return {"ok": True, "user": user.to_dict(), **tokens}


# ──────────────────────────────────────────────────────────────
#  Private helpers
# ──────────────────────────────────────────────────────────────

def _create_tokens(user: User) -> dict:
    access  = create_access_token(identity=user.id)
    refresh = create_refresh_token(identity=user.id)
    return {"access_token": access, "refresh_token": refresh}


def _generate_token(length: int = 32) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))
