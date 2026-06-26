"""routes/note_routes.py — Notes CRUD + archive/favorite/pin endpoints"""
from flask import Blueprint, request
from middleware.auth_middleware import jwt_required_custom, get_current_user
import services.note_service as note_svc
from utils.responses import success, error, paginated

notes_bp = Blueprint("notes", __name__, url_prefix="/api/notes")


@notes_bp.post("/")
@jwt_required_custom
def create_note():
    """Create a new note --- tags: [Notes] security: [{Bearer: []}]"""
    data   = request.get_json(silent=True) or {}
    result = note_svc.create_note(get_current_user().id, data)
    if not result["ok"]:
        return error("Validation failed.", 400, result.get("errors"))
    return success("Note created successfully!", result["note"], 201)


@notes_bp.get("/")
@jwt_required_custom
def list_notes():
    """List notes with filters/pagination --- tags: [Notes] security: [{Bearer: []}]"""
    result = note_svc.get_notes(get_current_user().id, request.args)
    return paginated(
        result["notes"],
        result["pagination"]["total"],
        result["pagination"]["page"],
        result["pagination"]["per_page"],
        "Notes fetched successfully.",
    )


@notes_bp.get("/archived")
@jwt_required_custom
def archived_notes():
    """Get all archived notes --- tags: [Notes] security: [{Bearer: []}]"""
    params = {**request.args, "archived": "true"}
    result = note_svc.get_notes(get_current_user().id, params)
    return paginated(result["notes"], result["pagination"]["total"],
                     result["pagination"]["page"], result["pagination"]["per_page"],
                     "Archived notes fetched.")


@notes_bp.get("/favorites")
@jwt_required_custom
def favorite_notes():
    """Get all favorite notes --- tags: [Notes] security: [{Bearer: []}]"""
    params = {**request.args, "favorite": "true"}
    result = note_svc.get_notes(get_current_user().id, params)
    return paginated(result["notes"], result["pagination"]["total"],
                     result["pagination"]["page"], result["pagination"]["per_page"],
                     "Favorite notes fetched.")


@notes_bp.get("/<int:note_id>")
@jwt_required_custom
def get_note(note_id):
    """Get a single note by ID --- tags: [Notes] security: [{Bearer: []}]"""
    result = note_svc.get_note(get_current_user().id, note_id)
    if not result["ok"]:
        return error(result["message"], 404)
    return success("Note fetched.", result["note"])


@notes_bp.put("/<int:note_id>")
@jwt_required_custom
def update_note(note_id):
    """Update a note --- tags: [Notes] security: [{Bearer: []}]"""
    data   = request.get_json(silent=True) or {}
    result = note_svc.update_note(get_current_user().id, note_id, data)
    if not result["ok"]:
        return error(result.get("message", "Validation failed."), 400, result.get("errors"))
    return success("Note updated successfully.", result["note"])


@notes_bp.delete("/<int:note_id>")
@jwt_required_custom
def delete_note(note_id):
    """Delete a note permanently --- tags: [Notes] security: [{Bearer: []}]"""
    result = note_svc.delete_note(get_current_user().id, note_id)
    if not result["ok"]:
        return error(result["message"], 404)
    return success("Note deleted successfully.")


# ── Archive ──────────────────────────────────────────────────
@notes_bp.put("/archive/<int:note_id>")
@jwt_required_custom
def archive_note(note_id):
    result = note_svc.toggle_archive(get_current_user().id, note_id, True)
    if not result["ok"]: return error(result["message"], 404)
    return success("Note archived.", result["note"])


@notes_bp.put("/unarchive/<int:note_id>")
@jwt_required_custom
def unarchive_note(note_id):
    result = note_svc.toggle_archive(get_current_user().id, note_id, False)
    if not result["ok"]: return error(result["message"], 404)
    return success("Note unarchived.", result["note"])


# ── Favorite ─────────────────────────────────────────────────
@notes_bp.put("/favorite/<int:note_id>")
@jwt_required_custom
def favorite_note(note_id):
    result = note_svc.toggle_favorite(get_current_user().id, note_id, True)
    if not result["ok"]: return error(result["message"], 404)
    return success("Added to favorites.", result["note"])


@notes_bp.put("/unfavorite/<int:note_id>")
@jwt_required_custom
def unfavorite_note(note_id):
    result = note_svc.toggle_favorite(get_current_user().id, note_id, False)
    if not result["ok"]: return error(result["message"], 404)
    return success("Removed from favorites.", result["note"])


# ── Pin ──────────────────────────────────────────────────────
@notes_bp.put("/pin/<int:note_id>")
@jwt_required_custom
def pin_note(note_id):
    result = note_svc.toggle_pin(get_current_user().id, note_id, True)
    if not result["ok"]: return error(result["message"], 404)
    return success("Note pinned.", result["note"])


@notes_bp.put("/unpin/<int:note_id>")
@jwt_required_custom
def unpin_note(note_id):
    result = note_svc.toggle_pin(get_current_user().id, note_id, False)
    if not result["ok"]: return error(result["message"], 404)
    return success("Note unpinned.", result["note"])
