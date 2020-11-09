DJJS: Notes for Developers
==========================

Currently, this is experimental code, and these notes are largely
for my own benefit. They will be expanded later.

The size of the memory is set by the user, and cannot be changed
after the deck is initialized (as there is no way to do it with-
out making the audio thread unstable). Either way, the memory
is fully aligned, containing only 32-bit values.

The first 1024 bytes of memory are used to store the interpolated
samples. Each block, for each channel (left, then right) contains
128 samples, each a 32-bit float. They are copied to the CPU each
time the `$interpolate` function returns.

The next six values are as follows:

+ [1024] u32: the play-state inbox
+ [1028] u32: the drop counter inbox
+ [1032] f32: the drop position inbox
+ [1036] f32: the track length inbox
+ [1040] u32: the right channel offset inbox
+ [1044] f32: the current stylus position outbox

The first five are only written to by the main thread, and read by
this module. The last value is only written to by this module, and
read by both this module and the main thread.

After the six values shared with the main thread, the samples that
were decoded from the audio file are stored. The data for the left
channel always starts at 1048.

As track lengths vary, the main thread supplies the offset of the
data for the right channel (as well as the length of the track in
samples), as described above.

When the play-state changes, the new state is written to the inbox
at address 1024, where a `0` means *stop* and a `1` means *play*.

When a drop is required, the new position is written to the inbox
at 1032, then the counter at 1028 is incremented. The two writes
are ordered atomically.

As we only care about the most recent change in play-state or drop
position (if more than one ever happen during the same block), the
setup described above is sufficient (and threadsafe).

The stylus position (as represented in memory) always points to the
start of the block currently being processed (its first sample),
or the start of the next block if the module is not currently
executing (the `$interpolate` function is not running).
