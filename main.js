import Deck from "/djjs/deck.js";

window.boot = async function() {

    const context = new AudioContext();

    window.DECK = Object.create(null);
    window.DECK.A = await new Deck("A", 8).boot(context);
    window.DECK.B = await new Deck("B", 8).boot(context);

    DECK.A.load("/tracks/glow.mp3").then(deck => {

        DECK.A.sendPlay(1);
        DECK.A.pitch.setValueAtTime(1, context.currentTime)
        DECK.A.pitch.linearRampToValueAtTime(0.5, context.currentTime + 1);
        DECK.A.pitch.linearRampToValueAtTime(1.5, context.currentTime + 4);
    });
};
