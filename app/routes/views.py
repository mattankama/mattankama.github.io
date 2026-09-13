from flask import Blueprint, render_template

views_bp = Blueprint("views", __name__)


@views_bp.route("/")
def home():
    """Home page — list of routines."""
    return render_template("home.html")


@views_bp.route("/routine/new")
def new_routine():
    """Create routine form."""
    return render_template("routine.html", routine_id=None)


@views_bp.route("/routine/<int:routine_id>/edit")
def edit_routine(routine_id):
    """Edit routine form."""
    return render_template("routine.html", routine_id=routine_id)


@views_bp.route("/session/<int:session_id>")
def active_session(session_id):
    """Active session view."""
    return render_template("session.html", session_id=session_id)
