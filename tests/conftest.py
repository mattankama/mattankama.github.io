import pytest

from app import create_app


@pytest.fixture
def app():
    """The app that serves the pages. There is nothing else left to set up."""
    return create_app({"TESTING": True})


@pytest.fixture
def client(app):
    """Flask test client."""
    return app.test_client()
