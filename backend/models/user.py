"""models/user.py — User model"""
from datetime import datetime
from database.db import db, bcrypt


class User(db.Model):
    __tablename__ = "users"

    id            = db.Column(db.Integer, primary_key=True, autoincrement=True)
    full_name     = db.Column(db.String(120), nullable=False)
    email         = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=True)   # nullable for OAuth users
    profile_image = db.Column(db.String(500), nullable=True)
    auth_provider = db.Column(db.String(30), default="local")  # local | google | github
    oauth_id      = db.Column(db.String(255), nullable=True)   # provider's user id
    reset_token   = db.Column(db.String(255), nullable=True)
    reset_token_expires = db.Column(db.DateTime, nullable=True)
    is_active     = db.Column(db.Boolean, default=True)
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at    = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    notes      = db.relationship("Note",     back_populates="user", cascade="all, delete-orphan", lazy="dynamic")
    categories = db.relationship("Category", back_populates="user", cascade="all, delete-orphan", lazy="dynamic")

    # ── Password helpers ───────────────────────────────────
    def set_password(self, plain: str) -> None:
        self.password_hash = bcrypt.generate_password_hash(plain).decode("utf-8")

    def check_password(self, plain: str) -> bool:
        if not self.password_hash:
            return False
        return bcrypt.check_password_hash(self.password_hash, plain)

    # ── Serialization ──────────────────────────────────────
    def to_dict(self) -> dict:
        return {
            "id":            self.id,
            "full_name":     self.full_name,
            "email":         self.email,
            "profile_image": self.profile_image,
            "auth_provider": self.auth_provider,
            "is_active":     self.is_active,
            "created_at":    self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<User {self.email}>"
