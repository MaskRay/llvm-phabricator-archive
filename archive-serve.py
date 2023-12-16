from pathlib import Path
from flask import Flask, render_template, request, send_from_directory
from waitress import serve

from archive import get_sharded_diff_path

app = Flask(__name__, static_url_path="")

# TODO here are the heads from phab on a diff
# See if anything is important to replicate
#
# HTTP/1.1 200 OK
# Date: Wed, 02 Mar 2022 13:12:53 GMT
# Server: Apache/2.4.10 (Debian)
# X-Frame-Options: Deny
# Strict-Transport-Security: max-age=0; includeSubdomains; preload
# Referrer-Policy: no-referrer
# Cache-Control: no-store
# Expires: Sat, 01 Jan 2000 00:00:00 GMT
# X-Content-Type-Options: nosniff
# Content-Encoding: gzip
# Vary: Accept-Encoding
# X-XSS-Protection: 1; mode=block
# Keep-Alive: timeout=5, max=98
# Connection: Keep-Alive
# Transfer-Encoding: chunked
# Content-Type: text/html; charset=UTF-8

TEMPLATES_FOLDER = Path("templates")
ARCHIVE_FOLDER = Path("archive")
PHAB_STATIC_FOLDER = ARCHIVE_FOLDER / "static"
OVERRIDES_FOLDER = ARCHIVE_FOLDER / "overrides"


@app.route("/overrides/js/<rest>")
def overrides_js(rest):
    return send_from_directory(OVERRIDES_FOLDER / "js", rest)


@app.route("/overrides/css/<rest>")
def overrides_css(rest):
    return send_from_directory(OVERRIDES_FOLDER / "css", rest)


@app.route("/overrides/favicon/<rest>")
def overrides_favicon(rest):
    return send_from_directory(OVERRIDES_FOLDER / "favicon", rest)


@app.route("/overrides/fonts/<rest>")
def overrides_fonts(rest):
    return send_from_directory(OVERRIDES_FOLDER / "fonts", rest)


@app.route("/D<diff>")
def diff_view(diff):
    diff_compare = request.args.get("vs")
    if diff_compare:
        return f"The archive does not support inter-diffs, sorry"
    diff_version = request.args.get("id")
    raw_patch = request.args.get("download")

    path = get_sharded_diff_path(f"D{diff}", diff_version, raw_patch)
    return send_from_directory(
        str(TEMPLATES_FOLDER / path.parent),
        str(path.name),
        mimetype="text/plain" if raw_patch else "text/html",
    )


@app.route("/")
def index():
    return render_template("index.html")

serve(app, port=5000)
