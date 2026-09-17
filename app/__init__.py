import mimetypes

from flask import Flask

# Flask does not map .webmanifest by default; without this it is served as
# application/octet-stream and browsers reject the manifest.
mimetypes.add_type("application/manifest+json", ".webmanifest")


def create_app(config=None):
    """Application factory for Rattlesnake.

    All this serves is four pages of markup and a static folder. There is no
    database here and no API: the data lives in IndexedDB on the lifter's phone
    and app/static/js/local-api.js is what reads and writes it.

    So this factory has two jobs, both of them development-time — back the dev
    server, and render the pages that scripts/build_static.py writes into dist/.
    Nothing in the deployed app runs any of this.
    """
    app = Flask(__name__)

    if config:
        app.config.update(config)

    from app.routes.views import views_bp

    app.register_blueprint(views_bp, url_prefix="/")

    return app
