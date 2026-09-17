import os

from app import create_app

app = create_app()

LOOPBACK = {"127.0.0.1", "localhost", "::1"}


def _flag(name, default):
    return os.environ.get(name, default).strip().lower() in ("true", "1", "t", "yes")


if __name__ == "__main__":
    # Loopback by default. The old default was 0.0.0.0, which put the dev server
    # on every network the laptop was attached to — coffee shop wifi included.
    # Reaching it from a phone is still one variable away:
    #
    #     HOST=0.0.0.0 python3 run.py
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "5001"))
    debug = _flag("FLASK_DEBUG", "True")

    # Werkzeug's debugger is an interactive Python console attached to every
    # traceback. On loopback that is a convenience; on a LAN it is a shell handed
    # to anyone else on the network. So past loopback the console goes away and
    # the reloader stays, which is the half actually wanted for editing templates.
    exposed = host not in LOOPBACK
    use_debugger = debug and not exposed
    if debug and exposed:
        print(f" * Bound to {host} — debugger console disabled, reloader still on.")

    app.run(host=host, port=port, debug=use_debugger, use_reloader=debug)
