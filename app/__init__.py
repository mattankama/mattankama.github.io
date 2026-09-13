import os

from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import event

db = SQLAlchemy()


def _set_sqlite_pragma(dbapi_conn, connection_record):
    """Enable foreign key enforcement for SQLite."""
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def create_app(config=None):
    """Application factory for Rattlesnake."""
    app = Flask(__name__)

    # Default configuration
    basedir = os.path.abspath(os.path.dirname(__file__))
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{os.path.join(basedir, '..', 'rattlesnake.db')}"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "rattlesnake-dev-key")

    # Override with test or custom config
    if config:
        app.config.update(config)

    db.init_app(app)

    # Enable SQLite foreign key constraints
    with app.app_context():
        event.listen(db.engine, "connect", _set_sqlite_pragma)

    # Register blueprints
    from app.routes.api import api_bp
    from app.routes.views import views_bp

    app.register_blueprint(api_bp, url_prefix="/api")
    app.register_blueprint(views_bp, url_prefix="/")

    # Create tables
    with app.app_context():
        from app import models  # noqa: F401 — ensure models are imported before create_all
        db.create_all()

    return app
