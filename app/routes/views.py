from flask import Blueprint, render_template

views_bp = Blueprint("views", __name__)


# Home and Progress are two panes of one document, so both routes render the same
# template and differ only in which pane it opens on. Sliding between them never
# hits the server; the URL is kept in step client-side.


@views_bp.route("/")
def home():
    """The pager, opened on the routines pane."""
    return render_template("pager.html", start_pane=0)


@views_bp.route("/progress")
def progress():
    """The pager, opened on the progress pane — for reloads and direct links."""
    return render_template("pager.html", start_pane=1)


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
