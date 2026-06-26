"""routes/category_routes.py — Category CRUD"""
from flask import Blueprint, request
from database.db import db
from models.category import Category
from middleware.auth_middleware import jwt_required_custom, get_current_user
from utils.responses import success, error
from utils.validators import sanitize

cat_bp = Blueprint("categories", __name__, url_prefix="/api/categories")


@cat_bp.post("/")
@jwt_required_custom
def create_category():
    data = request.get_json(silent=True) or {}
    name = sanitize(data.get("category_name", "").strip())
    if not name:
        return error("Category name is required.", 400)
    user_id = get_current_user().id
    # Prevent duplicates
    existing = Category.query.filter_by(user_id=user_id, category_name=name).first()
    if existing:
        return error("A category with this name already exists.", 409)
    cat = Category(
        category_name=name,
        color=data.get("color", "#4F46E5"),
        icon=data.get("icon", "🏷️"),
        user_id=user_id,
    )
    db.session.add(cat)
    db.session.commit()
    return success("Category created.", cat.to_dict(), 201)


@cat_bp.get("/")
@jwt_required_custom
def list_categories():
    cats = Category.query.filter_by(user_id=get_current_user().id).order_by(Category.category_name).all()
    return success("Categories fetched.", [c.to_dict() for c in cats])


@cat_bp.put("/<int:cat_id>")
@jwt_required_custom
def update_category(cat_id):
    cat = Category.query.filter_by(id=cat_id, user_id=get_current_user().id).first()
    if not cat:
        return error("Category not found.", 404)
    data = request.get_json(silent=True) or {}
    if "category_name" in data:
        name = sanitize(data["category_name"].strip())
        if not name:
            return error("Category name cannot be empty.", 400)
        cat.category_name = name
    if "color" in data: cat.color = data["color"]
    if "icon"  in data: cat.icon  = data["icon"]
    db.session.commit()
    return success("Category updated.", cat.to_dict())


@cat_bp.delete("/<int:cat_id>")
@jwt_required_custom
def delete_category(cat_id):
    cat = Category.query.filter_by(id=cat_id, user_id=get_current_user().id).first()
    if not cat:
        return error("Category not found.", 404)
    db.session.delete(cat)
    db.session.commit()
    return success("Category deleted.")
