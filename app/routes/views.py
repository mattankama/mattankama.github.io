from flask import Blueprint, current_app, render_template, send_from_directory

views_bp = Blueprint("views", __name__)


# Four pages, and every one of them is a fixed file — which is the point. Nothing
# here renders data: the templates carry only markup, and the rows arrive from
# local-api.js once the page is up. That is what lets `python3 scripts/build_static.py`
# turn this same set of routes into a folder anyone can host.
#
# Which routine or session a page is about rides in the query string
# (`/routine/?id=12`) rather than the path, because a static host can serve
# `/routine/index.html` for every routine but cannot invent a file per id.


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


@views_bp.route("/routine/")
def routine():
    """Create a routine, or edit the one named by `?id=`."""
    return render_template("routine.html")


@views_bp.route("/session/")
def active_session():
    """The active session named by `?id=`."""
    return render_template("session.html")


@views_bp.route("/sw.js")
def service_worker():
    """Serve the offline worker from the root.

    A service worker only controls pages at or below its own path, so this one
    cannot live under /static/ and still see the whole app. The static build
    copies it to the root of `dist/` for the same reason.
    """
    response = send_from_directory(current_app.static_folder, "sw.js")
    response.headers["Content-Type"] = "application/javascript"
    # The worker is how new versions reach an installed app; a cached copy of it
    # would pin the lifter to whatever shipped the day they installed.
    response.headers["Cache-Control"] = "no-cache"
    return response
