"""utils/validators.py — Input validation helpers"""
import re
import bleach


EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
# Min 8 chars, at least 1 uppercase, 1 digit
PW_RE = re.compile(r"^(?=.*[A-Z])(?=.*\d).{8,}$")


def validate_email(email: str) -> str | None:
    """Return error string or None if valid."""
    if not email or not email.strip():
        return "Email is required."
    if not EMAIL_RE.match(email.strip()):
        return "Enter a valid email address."
    return None


def validate_password(password: str) -> str | None:
    if not password:
        return "Password is required."
    if len(password) < 8:
        return "Password must be at least 8 characters."
    if not re.search(r"[A-Z]", password):
        return "Password must contain at least one uppercase letter."
    if not re.search(r"\d", password):
        return "Password must contain at least one digit."
    return None


def validate_name(name: str) -> str | None:
    if not name or not name.strip():
        return "Full name is required."
    if len(name.strip()) < 2:
        return "Name must be at least 2 characters."
    if len(name.strip()) > 120:
        return "Name is too long."
    return None


def sanitize(text: str) -> str:
    """Strip HTML tags to prevent XSS."""
    if not text:
        return text
    return bleach.clean(str(text), tags=[], strip=True)


def validate_note(data: dict) -> list[str]:
    errors = []
    title   = data.get("title", "").strip()
    content = data.get("content", "").strip()
    if not title and not content:
        errors.append("Note must have a title or content.")
    if len(title) > 255:
        errors.append("Title must be under 255 characters.")
    priority = data.get("priority", "medium")
    if priority not in ("low", "medium", "high"):
        errors.append("Priority must be low, medium, or high.")
    tags = data.get("tags", [])
    if not isinstance(tags, list):
        errors.append("Tags must be a list.")
    elif len(tags) > 10:
        errors.append("Maximum 10 tags allowed.")
    return errors
