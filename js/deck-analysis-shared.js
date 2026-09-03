// deck-analysis-shared.js
// Shared helpers for Deck Analysis tabs (City League, Current Meta, Past Meta)

(function () {
    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function updateDeckStatsByIds(statsById, sectionId) {
        if (!statsById || typeof statsById !== 'object') return;
        Object.entries(statsById).forEach(([id, value]) => setText(id, String(value)));
        if (sectionId) {
            const section = document.getElementById(sectionId);
            if (section) section.classList.remove('d-none', 'city-league-stats-section-hidden');
        }
    }

    function resetDeckOverviewCounts(countId, summaryId, cardsText, totalText) {
        setText(countId, cardsText || '0 Cards');
        setText(summaryId, totalText || '/ 0 Total');
    }

    function renderNoDeckSelectedState(containerId, message) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const text = message || 'Please select a deck from the dropdown to load cards.';
        container.innerHTML = '<div class="deck-builder-empty-state" role="status" aria-live="polite"><h4 class="deck-builder-empty-title">'
            + text + '</h4></div>';
    }

    // ── Der Kachelfilter der drei Uebersichten ───────────────────────
    //
    // BEFUND (03.09.2026, Dublettenmessung zu Aufgabe #16): City League,
    // Current Meta und Past Meta hatten diese Funktion dreimal, zu
    // 88-95 % wortgleich. Gemessen wurden 3 x 43 normalisierte Zeilen mit
    // nur zwei bzw. vier abweichenden Stellen — die Element-Kennungen,
    // die Filtervariable, und ein echter Verhaltensunterschied:
    //
    //   City League + Past Meta   card.classList.add/remove('d-none')
    //   Current Meta              card.style.display = 'none' / ''
    //
    // Der Inline-Stil ist genau das Muster, das dieses Projekt sich in
    // app-city-league.js (Z. 535 ff.) als Falle notiert hat. Ein Live-Bug
    // war er nicht — auf .card-item liegt weder in ui-components.css noch
    // in styles.css eine display-Regel, und Current Meta war die einzige
    // Stelle im Projekt, die Kacheln per Inline-Stil versteckt. Beim
    // Zusammenlegen faellt er trotzdem weg: eine Klasse laesst sich per
    // CSS uebersteuern, ein Inline-Stil nicht.
    //
    // Was NICHT zusammengelegt wurde und warum, steht in
    // docs/geparkte-features.md — renderDeckGrid und copyDeckOverview
    // sehen aehnlich aus, sind aber mit acht Verhaltensunterschieden
    // auseinandergelaufen.
    function uebersichtKachelnFiltern(o) {
        const suchfeld = document.getElementById(o.suchfeldId);
        if (!suchfeld) return;
        const gitter = document.getElementById(o.gitterId);
        if (!gitter) return;

        const suchbegriff = suchfeld.value.toLowerCase().trim();
        const typFilter = o.typFilter || 'all';
        const kacheln = gitter.querySelectorAll('.card-item');
        let sichtbar = 0;

        kacheln.forEach(kachel => {
            const name   = kachel.getAttribute('data-card-name') || '';
            const nameDe = kachel.getAttribute('data-card-name-de') || '';
            const typ    = kachel.getAttribute('data-card-type') || '';
            const set    = kachel.getAttribute('data-card-set') || '';
            const nummer = kachel.getAttribute('data-card-number') || '';

            const setNrMitLuecke = `${set} ${nummer}`;
            const setNrOhneLuecke = `${set}${nummer}`;
            // Die Kachel kennt nur ihren Namen; der gemeinsame Helfer
            // faellt deshalb auf window.pokedexNumbers zurueck. Ohne
            // diesen Zweig fand die Suche 0 Treffer ueber die
            // Pokedex-Nummer, obwohl der Platzhalter sie verspricht
            // (Befunde D und N, 30.08.2026).
            const dexNr = (typeof window.cardPokedexSearchValue === 'function')
                ? window.cardPokedexSearchValue({ name })
                : '';
            const passtSuche = suchbegriff === ''
                || name.includes(suchbegriff)
                || nameDe.includes(suchbegriff)
                || setNrMitLuecke.includes(suchbegriff)
                || setNrOhneLuecke.includes(suchbegriff)
                || (dexNr !== '' && dexNr === suchbegriff)
                || (suchbegriff.length >= 3 && dexNr !== '' && dexNr.includes(suchbegriff));

            const passtTyp = typFilter === 'all' || typ === typFilter
                || (typFilter === 'Energy' && typ === 'Basic Energy');

            if (passtSuche && passtTyp) {
                kachel.classList.remove('d-none');
                sichtbar++;
            } else {
                kachel.classList.add('d-none');
            }
        });

        if (o.zaehlerId) {
            setText(o.zaehlerId, `${sichtbar} ${o.kartenWort || 'Cards'}`);
        }

        // Die Abschnittskoepfe zeigten sonst weiter die ungefilterten
        // Zahlen und blieben bei 0 Treffern stumm stehen (Befund E,
        // 30.08.2026). Melden, nicht verschweigen.
        if (typeof window.uebersichtSuchergebnisMelden === 'function') {
            window.uebersichtSuchergebnisMelden(gitter, sichtbar);
        }
        return sichtbar;
    }

    window.updateDeckStatsByIds = updateDeckStatsByIds;
    window.resetDeckOverviewCounts = resetDeckOverviewCounts;
    window.renderNoDeckSelectedState = renderNoDeckSelectedState;
    window.uebersichtKachelnFiltern = uebersichtKachelnFiltern;

    // showDeckSections / hideDeckSections sind am 03.09.2026 entfallen:
    // ueber js/ und index.html gemessen null Aufrufer, seit sie 2026
    // angelegt wurden. Ein Export ohne Aufrufer ist kein Angebot,
    // sondern eine Behauptung ueber die Architektur.
})();
