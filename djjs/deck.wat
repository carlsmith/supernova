(module

    (; This module implements the core logic of the audio processor
    defined by `djjs/deck.processor.js`.

    The size of the memory is set by the user. Either way, the memory
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

    Whenever a play-state change or a drop is handled, the loop inside
    the `$interpolate` function is reset, causing the entire block of
    interpolated samples to be recomputed. This minimizes latency as
    much as (physically) possible.

    The stylus position (as represented in memory) always points to the
    start of the block currently being processed (its first sample),
    or the start of the next block if the module is not currently
    executing (the `$interpolate` function is not running). ;)

(import "audio" "memory" (memory 0 65536 shared))

(global $dropCounter (mut i32) i32.const 0)
(global $playing (mut i32) i32.const 0)

(func (export "interpolate")

    (; This function is the entry-point for the `process` method of
    the audio processor. It computes the projected stylus position
    for the next 128 samples (one at a time, in a loop), and for
    each position, interpolates a new sample for each channel. ;)

    (param $pitch f32)

    (local $loopOffset i32)
    (local $trackLength f32)
    (local $inputOffset i32)
    (local $inputAddress i32)
    (local $projectedStylusPosition f32)
    (local $relativeProjectedStylusPosition f32)

    i32.const 0
    local.set $loopOffset

    i32.const 1036
    f32.load align=2
    local.set $trackLength

    i32.const 1040
    i32.load align=2
    local.set $inputOffset

    i32.const 1044
    f32.load align=2
    local.set $projectedStylusPosition

    loop $mainLoop

        (; ------- CHECK THE DROP COUNTER INBOX FOR AN UPDATE ------- ;)

        i32.const 1028 ;; the address of the drop counter inbox
        i32.load align=2
        global.get $dropCounter

        i32.ne if ;; the drop position inbox contains a message...

            i32.const 1028
            i32.load align=2
            global.set $dropCounter

            i32.const 1044
            i32.const 1032
            f32.load align=2
            local.tee $projectedStylusPosition
            f32.store align=2

            i32.const 0
            local.set $loopOffset

            br $mainLoop

        end

        (; ---------- CHECK THE PLAY INBOX FOR AN UPDATE ----------- ;)

        i32.const 1024 ;; the address of the play-state inbox
        i32.load align=2
        global.get $playing

        i32.ne if ;; the play-state has changed...

            ;; copy the new play-state from the inbox to the global,
            ;; then reset the loop and stylus position etc

            i32.const 1024
            i32.load align=2
            global.set $playing

            i32.const 0
            local.set $loopOffset

            i32.const 1044
            f32.load align=2
            local.set $projectedStylusPosition

            br $mainLoop

        end

        (; ----- COMPUTE THE OUTPUT SAMPLES BASED ON THE STATE ----- ;)

        global.get $playing if

            ;; check if the projected stylus position falls outside the
            ;; track (before the first or after the last samples)

            local.get $projectedStylusPosition
            f32.const 0.0
            f32.lt

            local.get $projectedStylusPosition
            local.get $trackLength
            f32.gt

            i32.or if ;; the stylus is outside the track...

                local.get $loopOffset
                call $silence

            else ;; the stylus is within the track...

                ;; compute the address of the leading sample for the left
                ;; channel (`$inputAddress`), which is also used to load
                ;; the trailing sample and the corresponding samples of
                ;; the right channel (using fixed offsets)

                local.get $projectedStylusPosition
                i32.trunc_f32_u
                i32.const 4
                i32.mul
                local.set $inputAddress

                ;; compute the projected stylus position relative to the
                ;; samples either side it, as a fraction of one (this is
                ;; the `$a` arg to the `$lerp` function)

                local.get $projectedStylusPosition
                local.get $projectedStylusPosition
                f32.floor
                f32.sub
                local.set $relativeProjectedStylusPosition

                ;; interpolate and store the sample for the left channel

                local.get $loopOffset

                local.get $inputAddress
                f32.load offset=1044 align=2

                local.get $inputAddress
                f32.load offset=1048 align=2

                local.get $relativeProjectedStylusPosition

                call $lerp
                f32.store align=2

                ;; interpolate and store the sample for the right channel

                local.get $loopOffset

                local.get $inputAddress
                local.get $inputOffset
                i32.add
                f32.load align=2

                local.get $inputAddress
                local.get $inputOffset
                i32.add
                f32.load offset=4 align=2

                local.get $relativeProjectedStylusPosition

                call $lerp
                f32.store offset=512 align=2

            end

            ;; update the projected stylus position, ready for the next
            ;; iteration (this only happens if the deck is playing, and
            ;; will happen even when the stylus is outside the track)

            local.get $pitch
            local.get $projectedStylusPosition
            f32.add
            local.set $projectedStylusPosition

        else ;; the deck is not playing...

            local.get $loopOffset
            call $silence

        end

        ;; update the loop offset (four times the loop index), then
        ;; continue if there are more samples to interpolate...

        local.get $loopOffset
        i32.const 4
        i32.add
        local.tee $loopOffset
        i32.const 512
        i32.ne

        br_if $mainLoop

    end

    (; ---- UPDATE THE GLOBAL STYLUS POSITION BEFORE RETURNING ---- ;)

    i32.const 1044
    local.get $projectedStylusPosition
    f32.store align=2
)

(func $lerp (param $x f32) (param $y f32) (param $a f32) (result f32)

    (; This function takes the values of two adjacent samples, as
    `$x` and `$y`, and interpolates (linearly) a new sample between
    them, at a relative position (that is expressed as a fraction of
    one), given by the third argument, `$a`. ;)

    f32.const 1.0
    local.get $a
    f32.sub
    local.get $x
    f32.mul

    local.get $a
    local.get $y
    f32.mul

    f32.add
)

(func $silence (param $address i32)

    (; This helper takes the adddress of an output sample for the
    left channel, and writes a zero to the corresponding samples
    for both channels. ;)

    local.get $address
    f32.const 0.0
    f32.store align=2

    local.get $address
    f32.const 0.0
    f32.store offset=512 align=2
))
