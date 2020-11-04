import Deck from "/djjs/deck.js";

window.boot = async function() {

    const context = new AudioContext();

    window.DECK = Object.create(null);
    window.DECK.A = await new Deck("A", 8).boot(context);
    window.DECK.B = await new Deck("B", 8).boot(context);
};
