"""routes/auth_routes.py — Authentication endpoints"""
from flask import Blueprint, request, current_app, redirect
from flask_jwt_extended import jwt_required, get_jwt_identity

import services.auth_service as auth_svc
from middleware.auth_middleware import jwt_required_custom, get_current_user
from database.db import limiter
from utils.responses import success, error

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


# ── Register ────────────────────────────────────────────────
@auth_bp.post("/register")
@limiter.limit("10 per hour")
def register():
    """
    Register a new user
    ---
    tags: [Auth]
    parameters:
      - in: body
        name: body
        required: true
        schema:
          properties:
            full_name: {type: string}
            email:     {type: string}
            password:  {type: string}
    responses:
      201:
        description: User registered successfully
      400:
        description: Validation error
    """
    data = request.get_json(silent=True) or {}
    result = auth_svc.register_user(
        data.get("full_name", ""),
        data.get("email", ""),
        data.get("password", ""),
    )
    if not result["ok"]:
        return error("Validation failed.", 400, result.get("errors"))
    return success("Account created successfully!", {
        "user":          result["user"],
        "access_token":  result["access_token"],
        "refresh_token": result["refresh_token"],
    }, 201)


# ── Login ────────────────────────────────────────────────────
@auth_bp.post("/login")
@limiter.limit("20 per hour")
def login():
    """
    Login with email and password
    ---
    tags: [Auth]
    parameters:
      - in: body
        name: body
        required: true
        schema:
          properties:
            email:    {type: string}
            password: {type: string}
    responses:
      200:
        description: Login successful
      401:
        description: Invalid credentials
    """
    data = request.get_json(silent=True) or {}
    result = auth_svc.login_user(data.get("email", ""), data.get("password", ""))
    if not result["ok"]:
        return error(result["message"], 401)
    return success("Login successful!", {
        "user":          result["user"],
        "access_token":  result["access_token"],
        "refresh_token": result["refresh_token"],
    })


# ── Logout ───────────────────────────────────────────────────
@auth_bp.post("/logout")
@jwt_required_custom
def logout():
    """
    Logout current user
    ---
    tags: [Auth]
    security:
      - Bearer: []
    responses:
      200:
        description: Logged out
    """
    # JWT is stateless; client simply discards the token.
    # For production, add the jti to a blocklist in Redis.
    return success("Logged out successfully.")


# ── Change Password ──────────────────────────────────────────
@auth_bp.post("/change-password")
@jwt_required_custom
def change_password():
    """
    Change current user's password
    ---
    tags: [Auth]
    security:
      - Bearer: []
    """
    data = request.get_json(silent=True) or {}
    result = auth_svc.change_password(
        get_current_user(),
        data.get("current_password", ""),
        data.get("new_password", ""),
    )
    if not result["ok"]:
        return error(result["message"], 400)
    return success("Password updated successfully.")


# ── Forgot Password ──────────────────────────────────────────
@auth_bp.post("/forgot-password")
@limiter.limit("5 per hour")
def forgot_password():
    """
    Send password reset email
    ---
    tags: [Auth]
    """
    data = request.get_json(silent=True) or {}
    auth_svc.forgot_password(data.get("email", ""))
    return success("If that email is registered, a reset link has been sent.")


# ── Reset Password ───────────────────────────────────────────
@auth_bp.post("/reset-password")
def reset_password():
    """
    Reset password using token from email
    ---
    tags: [Auth]
    """
    data = request.get_json(silent=True) or {}
    result = auth_svc.reset_password(data.get("token", ""), data.get("new_password", ""))
    if not result["ok"]:
        return error(result["message"], 400)
    return success("Password reset successfully. Please log in.")


# ── Google OAuth ─────────────────────────────────────────────
@auth_bp.post("/google")
@limiter.limit("20 per hour")
def google_oauth():
    """
    Verify Google ID token and log in / register user
    ---
    tags: [Auth]
    parameters:
      - in: body
        name: body
        required: true
        schema:
          properties:
            credential: {type: string, description: "Google ID token from GIS"}
    """
    data = request.get_json(silent=True) or {}
    credential = data.get("credential", "")
    if not credential:
        return error("Google credential token is required.", 400)

    result = auth_svc.google_oauth(credential)
    if not result["ok"]:
        return error(result["message"], 401)
    return success("Signed in with Google!", {
        "user":          result["user"],
        "access_token":  result["access_token"],
        "refresh_token": result["refresh_token"],
    })


# ── GitHub OAuth — Step 1: redirect to GitHub ────────────────
@auth_bp.get("/github")
def github_redirect():
    """Redirect user to GitHub OAuth authorization page."""
    client_id    = current_app.config.get("GITHUB_CLIENT_ID")
    callback_url = current_app.config.get("GITHUB_CALLBACK_URL")
    if not client_id:
        return error("GitHub OAuth not configured.", 503)
    github_url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={client_id}"
        f"&redirect_uri={callback_url}"
        f"&scope=user:email"
    )
    return redirect(github_url)


# ── GitHub OAuth — Step 2: callback ──────────────────────────
@auth_bp.get("/github/callback")
def github_callback():
    """Handle GitHub OAuth callback, exchange code, redirect to frontend."""
    code = request.args.get("code")
    if not code:
        return redirect(f"{current_app.config['FRONTEND_URL']}/auth.html?error=github_denied")

    result = auth_svc.github_oauth_exchange(code)
    if not result["ok"]:
        return redirect(
            f"{current_app.config['FRONTEND_URL']}/auth.html?error=github_failed"
        )

    # Pass token to frontend via URL param (frontend picks it up and stores in localStorage)
    token   = result["access_token"]
    refresh = result["refresh_token"]
    name    = result["user"]["full_name"]
    email   = result["user"]["email"]
    avatar  = result["user"].get("profile_image", "")
    return redirect(
        f"{current_app.config['FRONTEND_URL']}/auth.html"
        f"?token={token}&refresh={refresh}"
        f"&name={name}&email={email}&avatar={avatar}"
        f"&provider=github"
    )


# ── Get current user profile ─────────────────────────────────
@auth_bp.get("/me")
@jwt_required_custom
def me():
    """
    Get current authenticated user
    ---
    tags: [Auth]
    security:
      - Bearer: []
    """
    return success("Profile fetched.", get_current_user().to_dict())
