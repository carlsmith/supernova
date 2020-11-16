""" Python Test Server

Due to the security changes documented at the links below, features
like `SharedArrayBuffer` and (ungimped) `Performance.now` depend on
specific headers that are not normally supplied by a static file
server. This file simply implements a static file server that
does respond with the required headers.

The only dependency (other than the Standard Library) is the Bottle
server library, which is bundled (as a single file).

This script *must* be executed in the project root directory, some-
thing like this:

    python3 test/server.py

The script takes one or two optional arguments, interpreted as the
port number, then the hostname:

    python3 test/server.py 8080
    python3 test/server.py 8080 localhost

The given args in the example above are the defaults.

For more information on the security policies, see these links:

+ mdn.io/Cross-Origin-Embedder-Policy
+ mdn.io/Cross-Origin-Opener-Policy

The code is covered by the same (MIT) license. """

from sys import argv
from bottle import route, run, static_file, response

def create_response(filename):

    response = static_file(filename, root=".")
    response.set_header("Cross-Origin-Opener-Policy", "same-origin")
    response.set_header("Cross-Origin-Embedder-Policy", "require-corp")

    return response

@route("/")
def index(): return create_response("index.html")

@route("/<filename:path>")
def static(filename): return create_response(filename)

port = argv[1] if len(argv) > 1 else "8080"
host = argv[2] if len(argv) > 2 else "localhost"

run(host=host, port=port)
