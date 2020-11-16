DJJS: Notes for Developers
==========================

Currently, this is experimental code, and these notes are largely for my own benefit. They will be expanded later.

Project Status
--------------

The code works well. The overall design is simple, light and reliable. However, the implementation currently has a number of race conditions (around the shared memory) that are highly unlikely to cause any actual issues, but obviously need addressing before the code is any use.

The code can be tested easily enough. The WAT file (`deck.wat`) needs compiling as `deck.wasm`, then everything can be hosted with a static file server. Assuming you are in the project root directory, something like this is required:

    wat2wasm djjs/deck.wat -o djjs/deck.wasm --enable-threads
    ruby -run -ehttpd . -p8080

Then point the browser at the index file (`index.html`).

The Shared Memory
-----------------

The main thread and the Wasm module instances (running in the audio thread) each share a Wasm memory. All communication between the main thread and a given deck is implemented using the shared memory.

Each deck has a memory buffer. Its length is set by the user, and cannot be changed after the deck is initialized (as there is no way to do it without making the audio thread unstable).

The user defines the buffer length in minutes. The minutes are converted to the required bytes, then expanded slightly to include the memory required for internal use. The result is converted to 64KB pages (and rounded up).

Every value in the memory is properly aligned.

+ Messages use unsigned `i32` values for basic communication (indicating changes).
+ Sample data and related operations (including interpolation) use 32-bit
  floats (between `-1` and `1`, and centered on `0`).
+ Stylus positions and related operations always use 64-bit floats, allowing for
  high precision, no matter how long the track is.

The memory is divided (conceptually) into three (contiguous) blocks:

+ The Results Block (1024 bytes).
+ The Message Block (384 bytes, 128 + 256).
+ The Loading Block (the rest of the memory).

### The Results Block

The Results Block occupies the first 1024 bytes of memory. It is used to store the interpolated samples that the Wasm module generates. Each block, for each channel (left, then right), contains 128 samples, each a 32-bit float.

### The Message Block

The Message Block occupies the 384 bytes that follow the Results Block. It will look very different, once the locks are implemented.

The Message Block contains four u32 slots, followed by four f64 slots:

+ 0 [1024] u32: the play-state inbox
+ 1 [1028] u32: the drop counter inbox
+ 2 [1032] u32: the right channel offset inbox
+ 3 [1036] ???: spare 32-bit slot

+ 0 [1040] f64: the track length inbox
+ 1 [1048] f64: the drop position inbox
+ 2 [1056] f64: the super-global stylus position
+ 3 [1064] ???: spare 64-bit slot

Note: The track length is in samples, and is therefore always an integer. It is stored as an `f64` as the Wasm module needs to do `f64` arithmetic with it.

The inboxes are only ever written to by the main thread, and are only ever read by the Wasm module.

The super-global stylus position is only written to by the Wasm module, and is read by both the module and the main thread.

### The Samples Block

The Samples Block occupies the rest of the memory (after the Message Block). It is where the samples that were decoded from the audio file are stored. The data for the left channel always begins at `1072`. The offset of the right channel depends on the track length (and is the only offset that must be computed).

As track lengths vary, the main thread writes the offset of the data for the right channel and the length of the track in samples (to the corresponding inboxes), as part of the process of loading a new track.

Inboxes and Messages
--------------------

When the play-state changes, the new state is written (as an unsigned `i32`) to the play-state inbox (at `1024`), where a `0` means *stop* and a `1` means *play*.

Note: When the deck is stopped, the `Deck` instance is still active, and the API continues to request samples. Due to a limitation of the API (which will hopefully be fixed), the Was module continues to output samples. It just zeroes them all out, so the deck is silenced. Likewise, when the stylus is outside the track, silence is emitted.

When a drop is required, the new position is written (as an `f64`) to the drop position inbox (at `1048`), then the (`i32`) value in the drop counter inbox (at `1028`) is incremented. These two writes are ordered atomically.

Note: Though it is generally unlikely in practice, if the play-state is updated more than once during the same render quantum, only the most recent matters. Likewise, if more than one drop is registered in the same quantum, earlier drops can be safely ignored.

The `$interpolate` function (in the Wasm module) checks the play-state and drop counter inboxes before the samples are computed, and updates the state accordingly.

The Stylus
----------

The *super-global stylus position* is an `f64` that is equal to the stylus position at the beginning of the block currently being interpolated. It is shared in memory (at `1056`), so the main loop can readily access it too.

The Wasm module has an internal register (`$projectedStylusPosition`) which is used to project the stylus position forward to where it will be when a given sample is actually rendered.

Note: The Wasm module also has an internal register named (`$relativeProjectedStylusPosition`) which hols the fractional part of the `$projectedStylusPosition`. This is computed using `f64` arithmetic, then demoted to an `f32` for passing to `$lerp` (which generally operates on `f32` samples). By the time the value is demoted to 32-bits, it is only a fraction of one, so the precision is not lost.
