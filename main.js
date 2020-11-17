import Deck from "/djjs/deck.js";

window.boot = async function() {

    const DECKA = await Deck.initialize("A");
    const DECKB = await Deck.initialize("B");

    DECKA.load("/tracks/glow.mp3").then(deck => deck.play(1));
    DECKB.load("/tracks/bike.mp3").then(deck => deck.play(1));

    window.DECKA = DECKA;
    window.DECKB = DECKB;
};
