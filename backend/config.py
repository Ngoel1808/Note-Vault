"""
config.py — Application configuration
"""
import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()


class Config:
    # ── Core ────────────────────────────────────────────────
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")
    DEBUG = False
    TESTING = False

    # ── Database ─────────────────────────────────────────────
    _db_url = os.environ.get("DATABASE_URL")
    if not _db_url:
        _host = os.environ.get("DB_HOST", "localhost")
        _port = os.environ.get("DB_PORT", "3306")
        _name = os.environ.get("DB_NAME", "note_vault")
        _user = os.environ.get("DB_USER", "root")
        _pw   = os.environ.get("DB_PASSWORD", "")
        _db_url = f"mysql+pymysql://{_user}:{_pw}@{_host}:{_port}/{_name}"
    SQLALCHEMY_DATABASE_URI = _db_url
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_recycle": 300,
        "pool_pre_ping": True,
    }

    # ── JWT ──────────────────────────────────────────────────
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "jwt-dev-secret")
    JWT_ACCESS_TOKEN_EXPIRES  = timedelta(
        hours=int(os.environ.get("JWT_ACCESS_TOKEN_EXPIRES_HOURS", 24))
    )
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(
        days=int(os.environ.get("JWT_REFRESH_TOKEN_EXPIRES_DAYS", 30))
    )
    JWT_TOKEN_LOCATION = ["headers"]
    JWT_HEADER_NAME = "Authorization"
    JWT_HEADER_TYPE = "Bearer"

    # ── OAuth ────────────────────────────────────────────────
    GOOGLE_CLIENT_ID       = os.environ.get("GOOGLE_CLIENT_ID", "")
    GITHUB_CLIENT_ID       = os.environ.get("GITHUB_CLIENT_ID", "")
    GITHUB_CLIENT_SECRET   = os.environ.get("GITHUB_CLIENT_SECRET", "")
    GITHUB_CALLBACK_URL    = os.environ.get(
        "GITHUB_CALLBACK_URL", "http://localhost:5000/api/auth/github/callback"
    )
    FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://127.0.0.1:5500")

    # ── CORS ─────────────────────────────────────────────────
    CORS_ORIGINS = [
        os.environ.get("FRONTEND_URL", "http://127.0.0.1:5500"),
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:3000",
    ]

    # ── Mail ─────────────────────────────────────────────────
    MAIL_SERVER          = os.environ.get("MAIL_SERVER", "smtp.gmail.com")
    MAIL_PORT            = int(os.environ.get("MAIL_PORT", 587))
    MAIL_USE_TLS         = True
    MAIL_USERNAME        = os.environ.get("MAIL_USERNAME", "")
    MAIL_PASSWORD        = os.environ.get("MAIL_PASSWORD", "")
    MAIL_DEFAULT_SENDER  = os.environ.get("MAIL_DEFAULT_SENDER", "")

    # ── Rate Limiting ────────────────────────────────────────
    RATELIMIT_STORAGE_URI = os.environ.get("RATELIMIT_STORAGE_URI", "memory://")
    RATELIMIT_DEFAULT     = "200 per day, 50 per hour"

    # ── Swagger / Flasgger ──────────────────────────────────
    SWAGGER = {
        "title": "Note Vault API",
        "uiversion": 3,
        "version": "1.0.0",
        "description": "Production-ready REST API for Note Vault",
        "termsOfService": "",
        "securityDefinitions": {
            "Bearer": {
                "type": "apiKey",
                "name": "Authorization",
                "in": "header",
                "description": "JWT token: **Bearer &lt;token&gt;**",
            }
        },
    }


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False


class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"


config_map = {
    "development": DevelopmentConfig,
    "production":  ProductionConfig,
    "testing":     TestingConfig,
    "default":     DevelopmentConfig,
}
