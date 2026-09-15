import os
from app import create_app

app = create_app()

if __name__ == "__main__":
    # Debug is the default because this file is only ever a dev entrypoint: it
    # hardcodes the port and binds 0.0.0.0 so a phone on the same wifi can reach
    # it. The reloader is the point — without it, template edits are cached and
    # you debug a page the server is no longer serving.
    #
    # It does put Werkzeug's console on the LAN, so run it on a network you
    # trust, and turn it off with FLASK_DEBUG=0 when you would rather not.
    debug_mode = os.environ.get("FLASK_DEBUG", "True").lower() in ("true", "1", "t")
    app.run(host="0.0.0.0", port=5001, debug=debug_mode)
