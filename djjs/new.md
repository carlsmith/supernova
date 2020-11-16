DJJS: Notes for Developers
==========================

Currently, this project is experimental. The code is only used to evaluate different approaches, and these notes will eventually need expanding into proper documentation.

Dev notes cover the design and implementation of the project as a whole. The docstrings and comments in the source just explain where a given module or function fits into the scheme described here.

Project Status
--------------

The goal is to create a library for people wanting to deeply integrate a computer with one or more monitors and some combination of MIDI controllers and other peripherals to produce their own integrated system for DJing. This has three main sections:

+ AE: Audio Engine (for mashing up records and applying effects)
+ UI: User Interface (for visualizing state and data)
+ IO: Input and Output (keybindings, MIDI, USB, BlueTooth)

Implementing a library like this with Web technology was not possible until recently, and even now, it depends on APIs that are not available in most popular browsers, including audio worlets and realtime audio threads, WebAssembly with SIMD and threading, atomics and shared memory, WebGL shaders and low latency MIDI. Even as browsers mature, there will always be limitations that conflict with the goals of the library. For example, not being able to freely access local storage.

If the project is realized, it will likely become coupled to a specific runtime, like Electron, and possibly even a specific Linux distro. Web technology is only used because it offers the best stack for users working on their own integrations.

The code works well. It is not *mature* at all, but many different designs were explored, and the current implementation is simple, fast and stable.

The code can be tested easily enough. The WAT file (`djjs/deck.wat`) needs compiling as `djjs/deck.wasm` (with threads enabled), then everything can be hosted with a static file server. Assuming you are in the project root directory, something like this shuold do it:

    wat2wasm djjs/deck.wat -o djjs/deck.wasm --enable-threads
    ruby -run -ehttpd . -p8080

Then point the browser at the index file (`index.html`).

The Shared Memory
-----------------

Each deck has a memory buffer. Its length is set by the user, and cannot be changed after the deck is initialized, as there is no way to grow it without making the audio thread unstable, and Wasm memories cannot be shrunk.

The user defines the buffer length in minutes. The minutes are converted to the equivalent number of bytes, and the memory required for internal use is added to that. The result is converted (and rounded up) to 64KB pages.

Each instance of the Wasm module (running in the audio thread) shares its memory with the main thread. All communication between the main thread and a given deck is implemented using shared memory. This creates a bunch of race conditions, but locks are used internally to make everything threadsafe.

Every value in the memory is properly aligned.

+ Messages use unsigned `i32` values for basic communication (locks, counters).
+ Sample data and related operations (interpolation) use 32-bit floats.
+ Stylus positions and related operations always use 64-bit floats, allowing for
  high precision calculations, effectively regardless of track length.

The memory is divided (conceptually) into three (contiguous) blocks:

+ The Results Block (1024 bytes).
+ The Message Block (1024 bytes).
+ The Samples Block (the remainder of the memory).

### The Results Block

The Results Block occupies the first 1024 bytes of memory. It is used to store the interpolated samples that the Wasm module generates. Each block, for each channel (left, then right), contains 128 samples, each a 32-bit float.

### The Message Block

The Message Block occupies the 1024 bytes beginning at `1024`, immediately following the Results Block. It is used to store the values that are used for interprocess communication (locks, messages and their arguments).

The Message Block does not need a kilobyte of memory, but it is much easier to work on the code if stuff can be added and removed without having to recalculate half the addresses. The Message Block may be reduced once things settle down.

The Message Block is divided into two 512-byte sub-blocks. The first sub-block contains one-hundred and twenty-eight 32-bit slots, and the second sub-block contains sixty-four 64-bit slots.

The first sub-block currently contains the following five unsigned 32-bit integers:

+ 0 [1024] u32: the Play-State Inbox
+ 1 [1028] u32: the Drop Counter Inbox
+ 2 [1032] u32: the Offset Inbox (offset of the right channel samples)
+ 3 [1036] u32: the Drop Locker (the state of the Drop Lock)
+ 4 [1040] u32: the Sync Locker (the state of the Sync Lock)...

The second sub-block currently contains the following three 64-bit floats:

+ 0 [1536] f64: the Length Inbox (length of the track in samples)
+ 1 [1544] f64: the Drop Position Inbox
+ 2 [1552] f64: the Cannonical Stylus Position...

Note: The track length is (naturally) always an integer. It is stored as an `f64` as the Wasm module needs to do `f64` arithmetic with it.

### The Play-State Inbox

A deck can be in one of two play-states, either *play* (represented by a `1`) or *stop* (represented by a `0`), and only the main thread can change the state of a deck.

JS can write to a `Uint32Array` and Wasm can `i32.load` the result (assuming correct alignments) without the risk of tearing the value, so no explicitly atomic operations are required here.

The `instantiate` function in the Wasm module checks the play-state inbox each time it is called, and exits almost immediately if is the result is `0`. In that case, `instantiate` returns `0`, so the `process` method will output silence (without copying anything from the Wasm memory).

Note: Clobbering is not a concern, even though multiple changes to the Play-State during the same quantum are possible, as only the newest event (of its kind) matters.

### The Drop Counter Inbox

When the main thread needs the deck to *drop* (immediately move the stylus to a given position), the main thread obtains the Drop Lock, writes the new drop position (as an `f64`) to the Drop Position Inbox, then increments the int in the Drop Counter Inbox, before releasing the lock.

Note: It is not enough to write the drop position to its inbox (and then check it for changes), as sequential drops may use the same position.

The audio thread only needs to initially check the Drop Counter Inbox for changes (its value will not tear). If the counter has changed, the audio thread then obtains the Drop Lock while it copies the new (`f64`) stylus position from the Drop Position Inbox, and updates its copy of the Drop Counter.

As each thread only aquires the Drop Lock momentarily, both use simple spinlocks to ensure they get the lock, and to ensure, in the case of multiple drop events on the main thread during the same quantum, that the later events always clobber earlier ones (as only the newest drop event matters).

### The Samples Block

The Samples Block occupies the rest of the memory (after the Message Block). It is where the samples that were decoded from the audio file are stored (though there will almost always be some empty space on the end, rounding up to the page size).

The data for the left channel comes first (always beginning at `2048`). The offset of the right channel depends on the track length (and is the only offset that must be computed).

As track lengths vary, the main thread writes the (byte-wise) offset of the data for the right channel and the length of the track (in samples) to the Offset Inbox and Length Inbox, respectively.

When the main thread wants to *sync* (load a track into memory, and update the length and offset inboxes according), it must aquire the Sync Lock while it updates everything.

The audio thread reads from the Samples Block on every iteration of the mainloop (under normal circumstances). Therefore, it aquires the Sync Lock ahead of the mainloop, and releases it once the loop has finished (just before `interpolate` returns) to ensure the main thread cannot corrupt the data while the loop is still iterating.

Spinlocks cannot be used for the many thousands of cycles required to load a track into memory, or to compute a quantum. Furthermore, sync operations do not need to minimize latency.

If the main thread fails to aquire the Sync Lock, it will use `setTimeout` (recursively) with a delay of `0` milliseconds to retry on each iteration of the JavaScript Event Loop, until it succeeds.

If the audio thread fails to obtain the Sync Lock (at the head of the `interpolate` function), then `interpolate` immediately returns `0` (causing the Process Method to automatically output silence, without running the mainloop).

Note: The `interpolate` function cannot (readily and reliably) know when a sync has taken place, so the main thread is responsible for clearing the Play-State Inbox and Cannonical Stylus Position as part of the sync process. This is not required, but the deck will autoplay the new track from the old stylus position (as soon as the Sync Lock is released) otherwise.

Note: The main thread is responsible for ensuring that only one sync operation (per deck) occurs at a time.

The Stylus
----------

Throughout the implementation and documentation, the term *stylus* is a synonym for *playhead*.

A stylus position is represented using an `f64`. They are measured in samples (to very high precision).

The implementation deals in a number of stylus positions, as it must project the stylus forward when computing a quantum, and handle drop events that define new stylus positions.

The Cannonical Stylus Position is an `f64` that is equal to the stylus position at the beginning of the quatum that is about to be (or currently is being) interpolated. It lives in memory (at `1552`), so the main thread can readily access it too.

The `interpolate` function has a local register named `projectedStylusPosition`, which is used to project the stylus position forward to where it will be when a given sample is actually rendered.

The `interpolate` function also has a local register named `relativeProjectedStylusPosition`, which holds the fractional part of the `projectedStylusPosition`. The `relativeProjectedStylusPosition` is computed using `f64` arithmetic, then demoted to an `f32` for passing to the `lerp` helper (which generally operates on `f32` samples).

Note: By the time that `relativeProjectedStylusPosition` is demoted to 32-bits, it is only a fraction of one, so the precision is not lost.
