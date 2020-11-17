DJJS Test Suite: Notes for Developers
=====================================

The test suite currently amounts to a (Python 3) static file server
that sets the required headers necessitated by the Cross Origin Em-
bedder Policy and the Cross Origin Opener Policy:

+ mdn.io/Cross-Origin-Embedder-Policy
+ mdn.io/Cross-Origin-Opener-Policy

Without the headers described above, FireFox will not permit us to
use a `SharedArrayBuffer` and `Performance.now` will be gimped.

Note: FireFox does not currently work, even with the headers. The
page literally crashes to a bug report screen (probably during the
first call to the Process Method) every time.

Chrome works with any static file server, but plans to require the
cross origin headers soon, so the test server is required.

The server's only dependency (other than the Standard Library) is
the Bottle server library, which is bundled (as a single file).

The server script *must* be executed in the project root directory,
something like this:

    python3 test/server.py

The script takes one or two optional arguments, interpreted as the
port number, then the hostname:

    python3 test/server.py 8080
    python3 test/server.py 8080 localhost

The given args in the example above are the defaults, so all three
previous examples are equivalent.
