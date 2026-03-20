// Web Worker for Monte Carlo combo probability calculation
// Runs 10,000 iterations off the main thread to prevent UI freezing

self.onmessage = function(e) {
    const { deck, targetCardNames, iterations } = e.data;
    const ITERATIONS = iterations || 10000;
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
