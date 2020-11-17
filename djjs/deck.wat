(module

    (; This module implements the core logic of the audio processor
    defined by `djjs/deck.processor.js`. Refer to the *DJJS: Notes
    for Developers* doc (`djjs/notes.md`) for an explanation of
    the entire implementation, and how this module is used. ;)

(import "audio" "memory" (memory 0 65536 shared))

(global $dropCounter (mut i32) i32.const 0)

(func (export "interpolate") ;; f64 -> i32

    (; This function is the entry-point for the `process` method of
    the audio processor. ;)

    (param $pitch f64) (result i32)

    (local $loopOffset i32)
    (local $trackLength f64)
    (local $rightInputOffset i32)
    (local $leftInputLocation i32)
    (local $rightInputAddress i32)
    (local $projectedStylusPosition f64)
    (local $relativeProjectedStylusPosition f32)

    ;; sync with the current play state (this is implicitly atomic)...

    i32.const 1024 ;; the play-state inbox
    i32.load align=4

    i32.eqz if

        i32.const 0
        return

    end

    ;; spin to acquire the drop lock, then handle any drop message...

    loop $acquire

        i32.const 1036 ;; drop locker
        i32.const 0
        i32.const 1
        i32.atomic.rmw.cmpxchg

        br_if $acquire

    end

    i32.const 1028 ;; drop counter inbox
    i32.load align=4
    global.get $dropCounter

    i32.ne if

        i32.const 1028 ;; drop counter inbox
        i32.load align=4
        global.set $dropCounter

        i32.const 1552 ;; cannonical stylus position
        i32.const 1544 ;; drop position inbox
        f64.load align=8
        f64.store align=8

    end

    i32.const 1036 ;; drop locker
    i32.const 0
    i32.store

    ;; initialize the loop offset (always four times the loop index)...

    i32.const 0
    local.set $loopOffset

    ;; check the sync lock, and exit immediately if that fails...

    i32.const 1040 ;; sync locker
    i32.const 0
    i32.const 1
    i32.atomic.rmw.cmpxchg

    if

        i32.const 0
        return

    end

    ;; the audio thread now has the sync lock...

    i32.const 1536 ;; length inbox
    f64.load align=8
    local.set $trackLength

    i32.const 1032 ;; offset inbox
    i32.load align=4
    local.set $rightInputOffset

    i32.const 1552 ;; cannonical stylus position
    f64.load align=8
    local.set $projectedStylusPosition

    ;; iterate 128 times, generating a pair of samples each time...

    loop $mainloop

        ;; first, check that the stylus is within the track...

        local.get $projectedStylusPosition
        f64.const 0.0
        f64.lt

        local.get $projectedStylusPosition
        local.get $trackLength
        f64.gt

        i32.or if ;; the stylus is outside the track...

            local.get $loopOffset
            call $silence
            br $mainloop

        end

        ;; compute the addresses of the leading samples for each
        ;; channel, and the relative projected stylus position

        local.get $projectedStylusPosition
        i32.trunc_f64_u
        i32.const 4
        i32.mul
        local.tee $leftInputLocation

        local.get $rightInputOffset
        i32.add
        local.set $rightInputAddress

        local.get $projectedStylusPosition
        local.get $projectedStylusPosition
        f64.floor
        f64.sub
        f32.demote_f64
        local.set $relativeProjectedStylusPosition

        ;; interpolate and store the sample for the left channel

        local.get $loopOffset

        local.get $leftInputLocation
        f32.load offset=2048 align=4

        local.get $leftInputLocation
        f32.load offset=2052 align=4

        local.get $relativeProjectedStylusPosition

        call $lerp
        f32.store align=4

        ;; interpolate and store the sample for the right channel

        local.get $loopOffset

        local.get $rightInputAddress
        f32.load align=4

        local.get $rightInputAddress
        f32.load offset=4 align=4

        local.get $relativeProjectedStylusPosition

        call $lerp
        f32.store offset=512 align=4

        ;; update the projected stylus position...

        local.get $pitch
        local.get $projectedStylusPosition
        f64.add

        local.set $projectedStylusPosition

        ;; update the loop offset (four times the loop index)...

        local.get $loopOffset
        i32.const 4
        i32.add

        ;; reiterate if more output is required...

        local.tee $loopOffset
        i32.const 512
        i32.ne

        br_if $mainloop

    end ;; of the mainloop

    ;; update the cannonical stylus position, then release the sync lock...

    i32.const 1552 ;; cannonical stylus position
    local.get $projectedStylusPosition
    f64.store align=8

    i32.const 1040 ;; sync locker
    i32.const 0
    i32.store

    ;; finally, return `1` so the results are copied to the cpu...

    i32.const 1
)

(func $lerp ;; f32 f32 f32 -> f32

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

(func $silence ;; i32 -> void

    (; This helper takes the adddress of an output sample for the
    left channel, and writes a zero to the corresponding samples
    for both channels. ;)

    (param $address i32)

    local.get $address
    f32.const 0.0
    f32.store align=4

    local.get $address
    f32.const 0.0
    f32.store offset=512 align=4
))
