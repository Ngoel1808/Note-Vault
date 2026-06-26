"""utils/responses.py — Standard JSON response helpers"""
from flask import jsonify


def success(message: str = "Success", data=None, status: int = 200) -> tuple:
    payload = {"success": True, "message": message}
    if data is not None:
        payload["data"] = data
    return jsonify(payload), status


def error(message: str = "An error occurred", status: int = 400, errors=None) -> tuple:
    payload = {"success": False, "message": message}
    if errors:
        payload["errors"] = errors
    return jsonify(payload), status


def paginated(items: list, total: int, page: int, per_page: int, message: str = "OK") -> tuple:
    return jsonify({
        "success":   True,
        "message":   message,
        "data":      items,
        "pagination": {
            "total":    total,
            "page":     page,
            "per_page": per_page,
            "pages":    (total + per_page - 1) // per_page,
        },
    }), 200
