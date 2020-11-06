(module

    (; This module implements the core logic of the audio processor
    defined by `djjs/deck.processor.js`. ;)

(import "audio" "memory" (memory 0 65536 shared))

(global $stylusPosition (mut f32) f32.const 0.0)
(global $playing (mut i32) i32.const 0)

(func $silence (param $offset i32)

    (; This helper takes a sample offset (the address of the sample
    for the left channel) and writes a zero to each channel for the
    samples corresponding to the offset. ;)

    local.get $offset
    f32.const 0.0
    f32.store

    local.get $offset
    f32.const 0.0
    f32.store offset=512
)

(func (export "interpolate")

    (; This function is the entry-point for the `process` method of
    the audio processor. It computes the projected stylus position
    for the next 128 samples (one at a time, in a loop), and for
    each position, interpolates a new sample for each channel. ;)

    (param $pitch f32)

    (local $loopIndex i32)                  ;; zero-indexed loop counter
    (local $loopOffset i32)                 ;; four times the loop counter
    (local $sampleOffset i32)               ;; index of the leading sample
    (local $channelOffset i32)              ;; offset of right channel data
    (local $projectedStylusPosition f32)
    (local $relativeProjectedStylusPosition f32)

    i32.const 0
    local.tee $loopIndex
    local.set $loopOffset

    i32.const 1036
    i32.load
    local.set $channelOffset

    loop $mainLoop ;; generate a pair of samples...

        ;; check if the message in the play inbox differs from the
        ;; current state of the `$playing` global

        i32.const 1024
        i32.load
        global.get $playing

        i32.ne if ;; the play-state has changed...

            ;; copy the new play-state from the inbox to the global,
            ;; then reset the loop (to minimize response latency)

            i32.const 1024
            i32.load
            global.set $playing

            i32.const 0
            local.tee $loopIndex
            local.set $loopOffset

            br $mainLoop

        end

        ;; check if the deck is currently playing (1) or stopped (0)

        global.get $playing

        i32.eqz if ;; the deck is currently stopped...

            ;; emit silence for the current pair of samples

            local.get $loopOffset
            call $silence

        else ;; the deck is currently playing...

            ;; project the absolute position of the stylus at the point
            ;; when the samples being interpolated by the current loop
            ;; iteration will be output to the speakers

            local.get $pitch
            local.get $loopIndex
            f32.convert_i32_u
            f32.mul
            global.get $stylusPosition
            f32.add
            local.tee $projectedStylusPosition

            ;; check if the projected stylus position falls outside the
            ;; track (before the first or after the last samples)

            f32.const 0.0
            f32.lt

            local.get $projectedStylusPosition
            i32.const 1032
            f32.load
            f32.gt

            i32.or if ;; the stylus is outside the track...

                ;; emit silence for the current pair of samples

                local.get $loopOffset
                call $silence

            else ;; the stylus is within the track...

                ;; the stylus is inside the track, and the deck is playing, so
                ;; compute the offset of the sample before the stylus and the
                ;; position of the stylus (as a fraction of one), relative
                ;; to the samples either side of it

                local.get $projectedStylusPosition
                i32.trunc_f32_u
                i32.const 4
                i32.mul
                local.set $sampleOffset

                local.get $projectedStylusPosition
                local.get $projectedStylusPosition
                f32.floor
                f32.sub
                local.set $relativeProjectedStylusPosition

                ;; interpolate and store the sample for the left channel

                local.get $loopOffset                       ;; result addr

                local.get $sampleOffset                     ;; $x (in $lerp)
                f32.load offset=1040

                local.get $sampleOffset                     ;; $y (in $lerp)
                f32.load offset=1044

                local.get $relativeProjectedStylusPosition  ;; $a (in $lerp)

                call $lerp
                f32.store

                ;; interpolate and store the sample for the right channel

                local.get $loopOffset                       ;; result addr

                local.get $sampleOffset                     ;; $x (in $lerp)
                local.get $channelOffset
                i32.add
                f32.load

                local.get $sampleOffset                     ;; $y (in $lerp)
                local.get $channelOffset
                i32.add
                f32.load offset=4

                local.get $relativeProjectedStylusPosition  ;; $a (in $lerp)

                call $lerp
                f32.store offset=512

            end

        end

        ;; update the loop offset and index, then reiterate if required...

        local.get $loopOffset
        i32.const 4
        i32.add
        local.set $loopOffset

        local.get $loopIndex
        i32.const 1
        i32.add
        local.tee $loopIndex

        i32.const 128
        i32.ne

        br_if $mainLoop

    end

    ;; now, if `$playing`, update the stylus position to the end
    ;; of the block that is now in RAM, ready for the CPU...

    ;; TODO: move all this to the loop

    global.get $playing

    if

        local.get $pitch
        f32.const 128.0
        f32.mul
        global.get $stylusPosition
        f32.add
        global.set $stylusPosition

    end
)

(func $lerp

    (; This function takes the values of two adjacent samples, as
    `$x` and `$y`, and interpolates (linearly) a new sample between
    them, at a relative position (that is expressed as a fraction of
    one), given by the third argument, `$a`. ;)

    (param $x f32) (param $y f32) (param $a f32) (result f32)

    f32.const 1.0
    local.get $a
    f32.sub
    local.get $x
    f32.mul

    local.get $a
    local.get $y
    f32.mul

    f32.add

)) ;; end of module
