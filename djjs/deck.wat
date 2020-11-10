(module

    (; This module implements the core logic of the audio processor
    defined by `djjs/deck.processor.js`. Refer to the *DJJS: Notes
    for Developers* doc (`djjs/notes.md`) for an explanation of
    the entire implementation, and how this module is used. ;)

(import "audio" "memory" (memory 0 65536 shared))

(global $dropCounter (mut i32) i32.const 0)

(func (export "interpolate")

    (; This function is the entry-point for the `process` method of
    the audio processor. ;)

    (param $pitch f64)

    (local $playing i32)
    (local $loopOffset i32)
    (local $trackLength f64)
    (local $leftInputAddress i32)
    (local $rightInputOffset i32)
    (local $rightInputAddress i32)
    (local $projectedStylusPosition f64)
    (local $relativeProjectedStylusPosition f32)

    ;; initialize the locals and sync state with the main thread...

    i32.const 0
    local.set $loopOffset

    i32.const 1024 ;; the play-state inbox
    i32.load align=4
    local.set $playing

    i32.const 1028 ;; drop counter inbox
    i32.load align=4
    global.get $dropCounter

    i32.ne if

        i32.const 1028 ;; drop counter inbox
        i32.load align=4
        global.set $dropCounter

        i32.const 1056 ;; global stylus position
        i32.const 1048 ;; drop position inbox
        f64.load align=8
        f64.store align=8

    end

    i32.const 1040 ;; track length inbox
    f64.load align=8
    local.set $trackLength

    i32.const 1032 ;; right channel offset inbox
    i32.load align=4
    local.set $rightInputOffset

    i32.const 1056 ;; global stylus position
    f64.load align=8
    local.set $projectedStylusPosition

    ;; iterate 128 times, generating a pair of samples each time...

    loop $mainLoop

        local.get $playing if ;; the deck is playing...

            local.get $projectedStylusPosition
            f64.const 0.0
            f64.lt

            local.get $projectedStylusPosition
            local.get $trackLength
            f64.gt

            i32.or if ;; the stylus is outside the track...

                local.get $loopOffset
                call $silence

            else ;; the stylus is within the track...

                ;; compute the addresses of the leading samples for each
                ;; channel, and the relative projected stylus position

                local.get $projectedStylusPosition
                i32.trunc_f64_u
                i32.const 4
                i32.mul
                local.tee $leftInputAddress

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

                local.get $leftInputAddress
                f32.load offset=1072 align=4

                local.get $leftInputAddress
                f32.load offset=1076 align=4

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

            end ;; of if-block, predicated on the stylus position

            ;; update the projected stylus position (if `$playing`)...

            local.get $pitch
            local.get $projectedStylusPosition
            f64.add

            local.set $projectedStylusPosition

        else ;; the deck is not playing...

            local.get $loopOffset
            call $silence

        end ;; of the if-block, predicated on `$playing`

        ;; update the loop offset (four times the loop index)...

        local.get $loopOffset
        i32.const 4
        i32.add

        local.tee $loopOffset
        i32.const 512
        i32.ne

        br_if $mainLoop

    end ;; of the mainloop

    ;; update the super-global stylus position, before returning...

    i32.const 1056 ;; the global stylus position
    local.get $projectedStylusPosition
    f64.store align=8
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
    f32.store align=4

    local.get $address
    f32.const 0.0
    f32.store offset=512 align=4
))
