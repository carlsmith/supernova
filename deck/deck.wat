(module

(import "audio" "memory" (memory 0 65536 shared))
(import "audio" "dataLength" (global $dataLength f32))
(import "audio" "dataOffset" (global $dataOffset i32))

(global $stylusPosition (mut f32) f32.const 0.0)

(func (export "interpolate")

    (; This function is the entry-point for the `process` method of
    the audio processor. It computes the projected stylus position
    for the next 128 samples (one at a time, in a loop), and for
    each position, interpolates a new sample for each channel.

    Note: There is a textbook implementation of lerp (below) that is
    used by this function to interpolate each new sample value.

    Note: If a projected stylus position falls outside of the track,
    zeroes (silence) will be generated for both channels instead.

    The results are stored in the first 1KB of RAM, and immediately
    copied to the CPU (by the JavaScript caller) when this function
    returns.

    The track data is expected to be in RAM, starting after the 1KB
    that is reserved for the results, and there are global imports
    that supply the track length (in samples) and the offset (as
    a byte-wise address) of the right channel data in memory.

    The signature is `$pitch f32 -> void`, where `$pitch` can be any
    reasonable (possibly negative) value, as a fraction of one that
    the stylus motion (over time) is multiplied by.

    Note: The `$pitch` parameter is implemented as a WebAudio Param
    in the JavaScript code that uses this module, and its current
    value is passed in each time this function is called. ;)

    (param $pitch f32)

    (local $loopIndex i32)
    (local $loopOffset i32)
    (local $sampleOffset i32)
    (local $projectedStylusPosition f32)
    (local $relativeProjectedStylusPosition f32)

    i32.const 0
    local.tee $loopIndex
    local.set $loopOffset

    loop $mainLoop

        ;; begin by projecting the absolute position of the stylus
        ;; when the samples being interpolated by the current loop
        ;; iteration will be played...

        local.get $pitch
        local.get $loopIndex
        f32.convert_i32_u
        f32.mul
        global.get $stylusPosition
        f32.add
        local.tee $projectedStylusPosition

        ;; check if the projected stylus position falls outside the
        ;; track (as a predicate for the following block)...

        f32.const 0.0
        f32.lt

        local.get $projectedStylusPosition
        global.get $dataLength
        f32.gt

        i32.or if

            ;; if the stylus is outside the track, set both of the
            ;; interpolated samples to zero...

            local.get $loopOffset
            f32.const 0.0
            f32.store

            local.get $loopOffset
            f32.const 0.0
            f32.store offset=512

        else

            ;; else, compute the offset of the leading sample and the
            ;; relative position of the stylus (as a fraction of one)
            ;; between the adjacent samples...

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

            ;; interpolate and store the sample for the left channel...

            local.get $loopOffset                       ;; L result addr

            local.get $sampleOffset                     ;; $x (in $lerp)
            f32.load offset=1024

            local.get $sampleOffset                     ;; $y (in $lerp)
            f32.load offset=1028

            local.get $relativeProjectedStylusPosition  ;; $a (in $lerp)

            call $lerp
            f32.store

            ;; interpolate and store the sample for the right channel...

            local.get $loopOffset                       ;; R result addr

            local.get $sampleOffset                     ;; $x (in $lerp)
            global.get $dataOffset
            i32.add
            f32.load

            local.get $sampleOffset                     ;; $y (in $lerp)
            global.get $dataOffset
            i32.add
            f32.load offset=4

            local.get $relativeProjectedStylusPosition  ;; $a (in $lerp)

            call $lerp
            f32.store offset=512

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

    ;; now, update the stylus position to the end of the block...

    local.get $pitch
    f32.const 128.0
    f32.mul
    global.get $stylusPosition
    f32.add
    global.set $stylusPosition
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
)

(func (export "drop") (param f32)

    (; This exported function simply takes an f32 stylus position,
    and sets the global register to the given value. ;)

    local.get 0
    global.set $stylusPosition

)

(func (export "news") (result f32)

    (; This exported function simply reports the stylus posiiton. ;)

    global.get $stylusPosition

)) ;; end of module
