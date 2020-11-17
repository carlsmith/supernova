"""This top-level script implements our Python Test Server,
which is documented in `test/notes.md`. """

from sys import argv
from bottle import route, run, static_file

@route("/")
def index():

    response = static_file("index.html", root=".")
    response["Cross-Origin-Opener-Policy"] = "same-origin"
    response["Cross-Origin-Embedder-Policy"] = "require-corp"

    return response

@route("/<filename:path>")
def static(filename):

    return static_file(filename, root=".")

port = argv[1] if len(argv) > 1 else "8080"
host = argv[2] if len(argv) > 2 else "localhost"

run(host=host, port=port)
