"""services/note_service.py — Note CRUD business logic"""
from sqlalchemy import or_, func
from database.db import db
from models.note import Note
from models.category import Category
from utils.validators import validate_note, sanitize


def create_note(user_id: int, data: dict) -> dict:
    errors = validate_note(data)
    if errors:
        return {"ok": False, "errors": errors}

    note = Note(
        title       = sanitize(data.get("title", "").strip()),
        content     = data.get("content", ""),   # allow rich HTML content
        category_id = data.get("category_id"),
        user_id     = user_id,
        priority    = data.get("priority", "medium"),
        color       = data.get("color"),
        is_pinned   = bool(data.get("is_pinned", False)),
    )
    note.tags = data.get("tags", [])
    db.session.add(note)
    db.session.commit()
    return {"ok": True, "note": note.to_dict()}


def get_notes(user_id: int, params: dict) -> dict:
    q = Note.query.filter_by(user_id=user_id)

    # Filters
    archived  = params.get("archived")
    favorite  = params.get("favorite")
    pinned    = params.get("pinned")
    category  = params.get("category_id")
    priority  = params.get("priority")

    if archived == "true":
        q = q.filter_by(is_archived=True)
    elif archived == "false":
        q = q.filter_by(is_archived=False)

    if favorite == "true":
        q = q.filter_by(is_favorite=True, is_archived=False)

    if pinned == "true":
        q = q.filter_by(is_pinned=True, is_archived=False)

    if category:
        q = q.filter_by(category_id=int(category))

    if priority in ("low", "medium", "high"):
        q = q.filter_by(priority=priority)

    # Search
    search = params.get("q", "").strip()
    if search:
        pattern = f"%{search}%"
        q = q.filter(
            or_(
                Note.title.ilike(pattern),
                Note.content.ilike(pattern),
                Note._tags.ilike(pattern),
            )
        )

    # Ordering — pinned first, then newest
    q = q.order_by(Note.is_pinned.desc(), Note.updated_at.desc())

    # Pagination
    page     = max(int(params.get("page", 1)), 1)
    per_page = min(int(params.get("per_page", 20)), 100)
    paginated = q.paginate(page=page, per_page=per_page, error_out=False)

    return {
        "ok":    True,
        "notes": [n.to_dict(include_content=False) for n in paginated.items],
        "pagination": {
            "total":    paginated.total,
            "page":     paginated.page,
            "per_page": per_page,
            "pages":    paginated.pages,
        },
    }


def get_note(user_id: int, note_id: int) -> dict:
    note = Note.query.filter_by(id=note_id, user_id=user_id).first()
    if not note:
        return {"ok": False, "message": "Note not found."}
    return {"ok": True, "note": note.to_dict(include_content=True)}


def update_note(user_id: int, note_id: int, data: dict) -> dict:
    note = Note.query.filter_by(id=note_id, user_id=user_id).first()
    if not note:
        return {"ok": False, "message": "Note not found."}

    errors = validate_note({**note.to_dict(), **data})
    if errors:
        return {"ok": False, "errors": errors}

    if "title"       in data: note.title       = sanitize(data["title"].strip())
    if "content"     in data: note.content     = data["content"]
    if "category_id" in data: note.category_id = data["category_id"]
    if "priority"    in data: note.priority    = data["priority"]
    if "color"       in data: note.color       = data["color"]
    if "tags"        in data: note.tags        = data["tags"]
    if "is_pinned"   in data: note.is_pinned   = bool(data["is_pinned"])

    db.session.commit()
    return {"ok": True, "note": note.to_dict()}


def delete_note(user_id: int, note_id: int) -> dict:
    note = Note.query.filter_by(id=note_id, user_id=user_id).first()
    if not note:
        return {"ok": False, "message": "Note not found."}
    db.session.delete(note)
    db.session.commit()
    return {"ok": True}


def toggle_archive(user_id: int, note_id: int, archive: bool) -> dict:
    note = Note.query.filter_by(id=note_id, user_id=user_id).first()
    if not note:
        return {"ok": False, "message": "Note not found."}
    note.is_archived = archive
    db.session.commit()
    return {"ok": True, "note": note.to_dict()}


def toggle_favorite(user_id: int, note_id: int, favorite: bool) -> dict:
    note = Note.query.filter_by(id=note_id, user_id=user_id).first()
    if not note:
        return {"ok": False, "message": "Note not found."}
    note.is_favorite = favorite
    db.session.commit()
    return {"ok": True, "note": note.to_dict()}


def toggle_pin(user_id: int, note_id: int, pin: bool) -> dict:
    note = Note.query.filter_by(id=note_id, user_id=user_id).first()
    if not note:
        return {"ok": False, "message": "Note not found."}
    note.is_pinned = pin
    db.session.commit()
    return {"ok": True, "note": note.to_dict()}


def search_notes(user_id: int, query: str, category_id=None) -> dict:
    if not query:
        return {"ok": False, "message": "Search query is required."}
    pattern = f"%{query}%"
    q = Note.query.filter_by(user_id=user_id, is_archived=False).filter(
        or_(
            Note.title.ilike(pattern),
            Note.content.ilike(pattern),
            Note._tags.ilike(pattern),
        )
    )
    if category_id:
        q = q.filter_by(category_id=int(category_id))
    notes = q.order_by(Note.updated_at.desc()).limit(50).all()
    return {"ok": True, "notes": [n.to_dict(include_content=False) for n in notes]}


def get_dashboard_stats(user_id: int) -> dict:
    total    = Note.query.filter_by(user_id=user_id, is_archived=False).count()
    archived = Note.query.filter_by(user_id=user_id, is_archived=True).count()
    favorite = Note.query.filter_by(user_id=user_id, is_favorite=True, is_archived=False).count()
    pinned   = Note.query.filter_by(user_id=user_id, is_pinned=True,   is_archived=False).count()
    cats     = Category.query.filter_by(user_id=user_id).count()
    return {
        "total_notes":    total,
        "archived_notes": archived,
        "favorite_notes": favorite,
        "pinned_notes":   pinned,
        "categories":     cats,
    }
