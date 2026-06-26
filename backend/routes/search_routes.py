"""routes/search_routes.py — Full-text search across notes"""
from flask import Blueprint, request
from middleware.auth_middleware import jwt_required_custom, get_current_user
from services.note_service import search_notes
from utils.responses import success, error

search_bp = Blueprint("search", __name__, url_prefix="/api/search")


@search_bp.get("/")
@jwt_required_custom
def search():
    """
    Search notes by title, content, tags, or category
    ---
    tags: [Search]
    security:
      - Bearer: []
    parameters:
      - in: query
        name: q
        required: true
        type: string
        description: Search keyword
      - in: query
        name: category_id
        type: integer
    """
    query       = request.args.get("q", "").strip()
    category_id = request.args.get("category_id")

    if not query:
        return error("Search query (q) is required.", 400)

    result = search_notes(get_current_user().id, query, category_id)
    return success(f"{len(result['notes'])} result(s) found.", result["notes"])
