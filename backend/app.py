"""
app.py — Note Vault Flask Application Entry Point
"""
import os
from flask import Flask, jsonify
from flask_cors import CORS
from flasgger import Swagger
from dotenv import load_dotenv

load_dotenv()

from config import config_map
from database.db import db, bcrypt, jwt, mail, limiter

# ── Import models so SQLAlchemy knows about them ─────────────
from models.user     import User      # noqa: F401
from models.note     import Note      # noqa: F401
from models.category import Category  # noqa: F401

# ── Import route blueprints ──────────────────────────────────
from routes.auth_routes      import auth_bp
from routes.note_routes      import notes_bp
from routes.category_routes  import cat_bp
from routes.dashboard_routes import dash_bp
from routes.search_routes    import search_bp


def create_app(env: str = None) -> Flask:
    env  = env or os.environ.get("FLASK_ENV", "development")
    cfg  = config_map.get(env, config_map["default"])

    app = Flask(__name__)
    app.config.from_object(cfg)

    # ── Extensions ────────────────────────────────────────────
    db.init_app(app)
    bcrypt.init_app(app)
    jwt.init_app(app)
    mail.init_app(app)
    limiter.init_app(app)

    # ── CORS ──────────────────────────────────────────────────
    CORS(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
         supports_credentials=True)

    # ── Swagger / Flasgger ────────────────────────────────────
    Swagger(app, config=app.config["SWAGGER"], merge=True)

    # ── Blueprints ────────────────────────────────────────────
    app.register_blueprint(auth_bp)
    app.register_blueprint(notes_bp)
    app.register_blueprint(cat_bp)
    app.register_blueprint(dash_bp)
    app.register_blueprint(search_bp)

    # ── JWT error handlers ────────────────────────────────────
    @jwt.expired_token_loader
    def expired_token(_jwt_header, _jwt_data):
        return jsonify({"success": False, "message": "Token has expired. Please log in again."}), 401

    @jwt.invalid_token_loader
    def invalid_token(_reason):
        return jsonify({"success": False, "message": "Invalid authentication token."}), 401

    @jwt.unauthorized_loader
    def missing_token(_reason):
        return jsonify({"success": False, "message": "Authentication required."}), 401

    # ── Global error handlers ─────────────────────────────────
    @app.errorhandler(404)
    def not_found(_e):
        return jsonify({"success": False, "message": "Resource not found."}), 404

    @app.errorhandler(405)
    def method_not_allowed(_e):
        return jsonify({"success": False, "message": "Method not allowed."}), 405

    @app.errorhandler(429)
    def rate_limited(_e):
        return jsonify({"success": False, "message": "Too many requests. Please slow down."}), 429

    @app.errorhandler(500)
    def server_error(_e):
        return jsonify({"success": False, "message": "Internal server error."}), 500

    # ── Health check ──────────────────────────────────────────
    @app.get("/health")
    def health():
        return jsonify({"status": "ok", "service": "Note Vault API", "version": "1.0.0"})

    # ── API root ─────────────────────────────────────────────
    @app.get("/")
    def index():
        return jsonify({
            "service": "Note Vault API",
            "version": "1.0.0",
            "docs":    "/apidocs",
        })

    # ── Create DB tables ──────────────────────────────────────
    with app.app_context():
        db.create_all()

    return app


# ── Entry point ───────────────────────────────────────────────
app = create_app()

if __name__ == "__main__":
    app.run(
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", 5000)),
        debug=os.environ.get("FLASK_DEBUG", "1") == "1",
    )
