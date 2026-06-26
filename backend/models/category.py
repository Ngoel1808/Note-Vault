"""models/category.py — Category model"""
from datetime import datetime
from database.db import db


class Category(db.Model):
    __tablename__ = "categories"

    id            = db.Column(db.Integer, primary_key=True, autoincrement=True)
    category_name = db.Column(db.String(100), nullable=False)
    color         = db.Column(db.String(20), default="#4F46E5")
    icon          = db.Column(db.String(10), default="🏷️")
    user_id       = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    user  = db.relationship("User",  back_populates="categories")
    notes = db.relationship("Note",  back_populates="category", lazy="dynamic")

    def to_dict(self) -> dict:
        return {
            "id":            self.id,
            "category_name": self.category_name,
            "color":         self.color,
            "icon":          self.icon,
            "user_id":       self.user_id,
            "note_count":    self.notes.count(),
            "created_at":    self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<Category {self.category_name}>"
