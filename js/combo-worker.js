// Web Worker for Monte Carlo combo probability calculation
// Runs 10,000 iterations off the main thread to prevent UI freezing

self.onmessage = function(e) {
    const payload = e && e.data ? e.data : {};
    const deck = Array.isArray(payload.deck) ? payload.deck : [];
    const targetCardNames = Array.isArray(payload.targetCardNames) ? payload.targetCardNames : [];
    const requestedIterations = Number(payload.iterations);
    const ITERATIONS = Number.isFinite(requestedIterations) && requestedIterations > 0
        ? Math.floor(requestedIterations)
        : 10000;

    if (deck.length === 0 || targetCardNames.length === 0) {
        self.postMessage({ chance: '0.0', error: 'invalid-payload' });
        return;
    }

    let successCount = 0;

    for (let i = 0; i < ITERATIONS; i++) {
        // Fisher-Yates shuffle (in-place copy)
        const simDeck = deck.slice();
        for (let j = simDeck.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [simDeck[j], simDeck[k]] = [simDeck[k], simDeck[j]];
        }

        // Draw 7 cards
        const hand = simDeck.slice(0, 7);

        // Check if ALL target cards are present
        if (targetCardNames.every(target => hand.includes(target))) {
            successCount++;
        }
    }

    const chance = ((successCount / ITERATIONS) * 100).toFixed(1);
    self.postMessage({ chance });
};
