(module

    (; This module implements the core logic of the audio processor
    defined by `djjs/deck.processor.js`. Refer to the *DJJS: Notes
    for Developers* doc (`djjs/notes.md`) for an explanation of
    the entire implementation, and how this module is used. ;)

(import "audio" "memory" (memory 0 65536 shared))

(global $dropCounter (mut i32) i32.const 0)
(global $playing (mut i32) i32.const 0)

(func (export "interpolate")

    (; This function is the entry-point for the `process` method of
    the audio processor. ;)

    (param $pitch f32)

    (local $loopOffset i32)
    (local $trackLength f32)
    (local $inputOffset i32)
    (local $inputAddress i32)
    (local $projectedStylusPosition f32)
    (local $relativeProjectedStylusPosition f32)

    i32.const 0
    local.set $loopOffset

    i32.const 1024 ;; the play-state inbox
    i32.load align=2
    global.set $playing

    i32.const 1028 ;; drop counter inbox
    i32.load align=2
    global.get $dropCounter

    i32.ne if

        i32.const 1028 ;; drop counter inbox
        i32.load align=2
        global.set $dropCounter

        i32.const 1044 ;; global stylus position
        i32.const 1032 ;; drop position inbox
        f32.load align=2
        f32.store align=2

    end

    i32.const 1036 ;; track length inbox
    f32.load align=2
    local.set $trackLength

    i32.const 1040 ;; right channel offset inbox
    i32.load align=2
    local.set $inputOffset

    i32.const 1044 ;; global stylus position
    f32.load align=2
    local.set $projectedStylusPosition

    loop $mainLoop

        global.get $playing if ;; the deck is playing...

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

                local.get $projectedStylusPosition
                i32.trunc_f32_u
                i32.const 4
                i32.mul
                local.set $inputAddress

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

            ;; update the projected stylus position (if `$playing`)...

            local.get $pitch
            local.get $projectedStylusPosition
            f32.add
            local.set $projectedStylusPosition

        else ;; the deck is not playing...

            local.get $loopOffset
            call $silence

        end

        ;; update the loop offset (four times the loop index)...

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
