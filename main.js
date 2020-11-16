import Deck from "/djjs/deck.js";

window.boot = async function() {

    const DECKA = await Deck.initialize("A");
    const DECKB = await Deck.initialize("B");

    DECKA.load("/tracks/glow.mp3").then(deck => {

        const now = deck.context.currentTime;

        deck.play(1);
        deck.pitch.setValueAtTime(1, now)
        deck.pitch.linearRampToValueAtTime(0.5, now + 1);
        deck.pitch.linearRampToValueAtTime(1.5, now + 4);
        deck.pitch.linearRampToValueAtTime(1.001, now + 8);

        const element = document.querySelector("output");

        function loop(delta) {

            element.innerText = deck.read();
            requestAnimationFrame(loop);

        } loop();
    });

    DECKB.load("/tracks/bike.mp3").then(deck => deck.play(1));

    window.DECKA = DECKA;
    window.DECKB = DECKB;
};
