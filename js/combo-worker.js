// Web Worker for Monte Carlo combo probability calculation
// Runs 10,000 iterations off the main thread to prevent UI freezing
//
// DIESE DATEI GEHOERT NICHT IN EIN <script>-TAG. Sie lief bis zum
// 20.08.2026 zusaetzlich als normales Skript auf der Hauptseite — dort
// setzt `self.onmessage` einen Nachrichten-Empfaenger auf window, der
// jede fremde postMessage-Zustellung entgegennimmt. Aufgefallen ist es,
// weil eine hier deklarierte Konstante mit derselben Konstante in
// js/draw-simulator.js kollidierte: "Identifier 'MULLIGAN_MAX' has
// already been declared", und damit brach der ganze Skriptblock ab.
// Das Tag ist raus; geladen wird die Datei ausschliesslich ueber
// new Worker(). Die Konstante steht trotzdem im Handler statt im
// Dateikopf — falls sie doch noch einmal jemand einbindet, soll das
// nichts umwerfen.
//
// Seit dem 20.08.2026 mit der Mulligan-Regel: eine Starthand ohne
// Basis-Pokemon wird zurueckgemischt und neu gezogen, statt als
// Fehlschlag zu zaehlen. Die ausfuehrliche Begruendung mit den
// gemessenen Zahlen steht bei _komboSimulation() in js/draw-simulator.js
// — dieselbe Rechnung, nur ausserhalb des Hauptthreads.
//
// `basis` kommt als Feld aus true / false / null je Karte. null heisst
// "unbekannt" (Kartendatenbank nicht geladen); dann laeuft der Lauf ohne
// die Regel und sagt es in der Antwort.

self.onmessage = function(e) {
    const MULLIGAN_MAX = 100;

    const payload = e && e.data ? e.data : {};
    const deck = Array.isArray(payload.deck) ? payload.deck : [];
    const basis = Array.isArray(payload.basis) ? payload.basis : [];
    const targetCardNames = Array.isArray(payload.targetCardNames) ? payload.targetCardNames : [];
    const requestedIterations = Number(payload.iterations);
    const ITERATIONS = Number.isFinite(requestedIterations) && requestedIterations > 0
        ? Math.floor(requestedIterations)
        : 10000;

    if (deck.length === 0 || targetCardNames.length === 0) {
        self.postMessage({ chance: '0.0', error: 'invalid-payload' });
        return;
    }

    const n = deck.length;
    const flags = deck.map((_, i) => (typeof basis[i] === 'boolean' ? basis[i] : null));
    const unbekannt = flags.some(b => b === null);
    const hatBasis = flags.some(b => b === true);
    const mulligan = !unbekannt && hatBasis;
    const grund = unbekannt ? 'kartendaten-fehlen' : (hatBasis ? '' : 'keine-basis');

    let successCount = 0, verworfen = 0, gezogen = 0;
    const idx = Array.from({ length: n }, (_, i) => i);

    for (let i = 0; i < ITERATIONS; i++) {
        let hand = null;
        for (let versuch = 0; versuch < (mulligan ? MULLIGAN_MAX : 1); versuch++) {
            // Teil-Fisher-Yates: nur die ersten sieben Plaetze.
            for (let j = 0; j < 7 && j < n; j++) {
                const k = j + Math.floor(Math.random() * (n - j));
                const t = idx[j]; idx[j] = idx[k]; idx[k] = t;
            }
            const zieh = idx.slice(0, Math.min(7, n));
            gezogen++;
            if (!mulligan || zieh.some(x => flags[x] === true)) { hand = zieh; break; }
            verworfen++;
        }
        if (!hand) continue;
        const inHand = hand.map(x => deck[x]);
        if (targetCardNames.every(target => inHand.includes(target))) {
            successCount++;
        }
    }

    self.postMessage({
        chance: ((successCount / ITERATIONS) * 100).toFixed(1),
        mulliganAngewendet: mulligan,
        grund,
        mulliganRate: gezogen > 0 ? (verworfen / gezogen) * 100 : 0,
    });
};
