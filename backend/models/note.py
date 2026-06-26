"""models/note.py — Note model"""
from datetime import datetime
import json
from database.db import db


class Note(db.Model):
    __tablename__ = "notes"

    id          = db.Column(db.Integer, primary_key=True, autoincrement=True)
    title       = db.Column(db.String(255), nullable=False, default="")
    content     = db.Column(db.Text, nullable=True, default="")
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True)
    user_id     = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    is_archived = db.Column(db.Boolean, default=False, index=True)
    is_favorite = db.Column(db.Boolean, default=False, index=True)
    is_pinned   = db.Column(db.Boolean, default=False)
    priority    = db.Column(db.Enum("low", "medium", "high"), default="medium")
    _tags       = db.Column("tags", db.Text, default="[]")   # JSON array stored as text
    color       = db.Column(db.String(20), nullable=True)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at  = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user     = db.relationship("User",     back_populates="notes")
    category = db.relationship("Category", back_populates="notes")

    # ── Tags (JSON list) ────────────────────────────────────
    @property
    def tags(self):
        try:
            return json.loads(self._tags or "[]")
        except (ValueError, TypeError):
            return []

    @tags.setter
    def tags(self, value):
        self._tags = json.dumps(value if isinstance(value, list) else [])

    # ── Serialization ───────────────────────────────────────
    def to_dict(self, include_content: bool = True) -> dict:
        data = {
            "id":          self.id,
            "title":       self.title,
            "category_id": self.category_id,
            "category":    self.category.category_name if self.category else None,
            "user_id":     self.user_id,
            "is_archived": self.is_archived,
            "is_favorite": self.is_favorite,
            "is_pinned":   self.is_pinned,
            "priority":    self.priority,
            "tags":        self.tags,
            "color":       self.color,
            "created_at":  self.created_at.isoformat() if self.created_at else None,
            "updated_at":  self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_content:
            data["content"] = self.content
        else:
            # Short preview (150 chars)
            data["preview"] = (self.content or "")[:150]
        return data

    def __repr__(self):
        return f"<Note {self.id}: {self.title[:30]}>"
