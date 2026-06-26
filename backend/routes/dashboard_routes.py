"""routes/dashboard_routes.py — Dashboard analytics"""
from flask import Blueprint
from middleware.auth_middleware import jwt_required_custom, get_current_user
from services.note_service import get_dashboard_stats
from models.note import Note
from utils.responses import success

dash_bp = Blueprint("dashboard", __name__, url_prefix="/api/dashboard")


@dash_bp.get("/stats")
@jwt_required_custom
def stats():
    """
    Get dashboard statistics
    ---
    tags: [Dashboard]
    security:
      - Bearer: []
    responses:
      200:
        description: Stats returned
        schema:
          properties:
            total_notes:    {type: integer}
            archived_notes: {type: integer}
            favorite_notes: {type: integer}
            pinned_notes:   {type: integer}
            categories:     {type: integer}
    """
    data = get_dashboard_stats(get_current_user().id)
    return success("Dashboard stats fetched.", data)


@dash_bp.get("/recent")
@jwt_required_custom
def recent_notes():
    """
    Get 6 most recently updated notes
    ---
    tags: [Dashboard]
    security:
      - Bearer: []
    """
    notes = (
        Note.query
        .filter_by(user_id=get_current_user().id, is_archived=False)
        .order_by(Note.updated_at.desc())
        .limit(6)
        .all()
    )
    return success("Recent notes fetched.", [n.to_dict(include_content=False) for n in notes])
