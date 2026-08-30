(function () {
    'use strict';

    const CB_STORAGE_KEY = 'customBinderArchetypesV1';
    const CB_CACHE_KEY = 'customBinderCacheV1';          // legacy: ids only, superseded by V2
    const CB_CACHE_KEY_V2 = 'customBinderCacheV2';       // {ids, cards, date}
    const CB_PRESETS_KEY = 'customBinderPresetsV1';
    const CB_PRINTED_LS_KEY = 'printedProxiesV1';        // mirror / guest storage
    const CB_THRESHOLD_KEY = 'customBinderThresholdV1';

    let cbSelectedArchetypes = []; // [{name, source}]
    let _cbSessionBaseline = null; // previous-binder baseline, stable per session

    // ── Print-status state (Druckliste mode) ──
    // "printed" is a GLOBAL per-card state (the proxy physically exists in
    // the user's box), keyed by cardId = name|set|number of the displayed
    // print and matched family-wide — NOT per binder and NOT related to
    // MyDex ownership. Stored as an ARRAY of ids (never a map: 185 card
    // names contain '.', and dotted keys are Firestore field paths).
    let cbMode = 'collection';     // 'collection' | 'print'
    let cbThreshold = 70;          // 0 | 30 | 70 (ACE SPECs always bypass)
    let _cbPrintedSet = null;      // Set<cardId>
    let _cbPrintedLoadPromise = null;
    let _cbPrintedSaveTimer = null;
    let _cbPrintedOwner = undefined;   // uid (or null for guest) the cached set belongs to
    let _cbPrintedRemoteOk = false;    // signed-in: did the Firestore read ever succeed?
    let _cbPrintedDirty = false;       // pending debounced write exists
    let cbAllArchetypes = [];      // [{name, source, label}]
    let cbArchetypesLoaded = false;
    let cbFilter = 'all';
    let cbAllPrints = false;
    let cbSort = 'binder';   // binder | set | typ | decks | fehlend | name
    let _cbSkipNextClose = false;
    let _cbTierGroups = null; // cached tier groups for dropdown
    let cbPresets = []; // [{id, name, archetypes: [{name, source}]}]

    // ── Gespeicherte Ordner ──
    //
    // Ein Ordner ist Name + Archetypen + Schwelle + Schnappschuss + Fortschritt.
    // Er liegt in der UNTERSAMMLUNG users/{uid}/customBinders/{id}, bewusst NICHT
    // als Feld auf users/{uid}: dort liegen bereits collection, collectionCounts,
    // wishlist, tradelist und deckFolders unter EINEM 1-MiB-Limit, und ein
    // Schnappschuss mit 533 Karten wiegt gemessen 157 KB. Ein Sammler mit grosser
    // Sammlung waere damit irgendwann ueber dem Limit — und der Schreibfehler
    // faellt still aus, der Nutzer saehe einen Ordner, dessen "was ist neu" fuer
    // immer eingefroren ist. printedProxies macht es bereits richtig.
    const CB_BINDERS_KEY = 'customBindersV1';   // Spiegel / Gastspeicher
    let cbBinders = [];            // [{id, name, archetypes, threshold, snapshot, erledigt}]
    let cbBindersGeladen = false;
    let cbAktiverBinder = null;    // id des geladenen Ordners
    let _cbAbgleich = null;        // {raus:[], reinHabe:[], reinFehlt:[], stand}

    // ── Helpers ──
    function mb() { return window._mbShared || {}; }

    function cbText(key, fallback) {
        if (typeof t === 'function') {
            const translated = t(key);
            if (translated && translated !== key) return translated;
        }
        return fallback;
    }

    // ── Persistence ──
    function cbSaveSelections() {
        try {
            localStorage.setItem(CB_STORAGE_KEY, JSON.stringify(
                cbSelectedArchetypes.map(a => ({ name: a.name, source: a.source }))
            ));
        } catch (_) { /* ignore */ }
    }

    function cbLoadSelections() {
        try {
            const raw = JSON.parse(localStorage.getItem(CB_STORAGE_KEY) || '[]');
            if (Array.isArray(raw)) {
                cbSelectedArchetypes = raw
                    .filter(a => a && a.name)
                    .map(a => ({ name: String(a.name), source: String(a.source || 'current-meta') }));
            }
        } catch (_) { cbSelectedArchetypes = []; }
    }

    // ── Preset Persistence ──
    function cbLoadPresets() {
        try {
            const raw = JSON.parse(localStorage.getItem(CB_PRESETS_KEY) || '[]');
            cbPresets = Array.isArray(raw) ? raw.filter(p => p && p.id && p.name && Array.isArray(p.archetypes)) : [];
        } catch (_) { cbPresets = []; }
    }

    function cbSavePresets() {
        try { localStorage.setItem(CB_PRESETS_KEY, JSON.stringify(cbPresets)); } catch (_) { /* ignore */ }
    }

    function cbSaveCurrentAsPreset() {
        if (cbSelectedArchetypes.length === 0) {
            if (typeof showToast === 'function') showToast(cbText('cb.noArchetypesSelected', 'No archetypes selected.'), 'warning');
            return;
        }
        const name = prompt(cbText('cb.promptPresetName', 'Name for this binder:'));
        if (!name || !name.trim()) return;
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        cbPresets.push({ id, name: name.trim(), archetypes: cbSelectedArchetypes.map(a => ({ name: a.name, source: a.source })) });
        cbSavePresets();
        cbRenderPresetBar();
        if (typeof showToast === 'function') showToast(cbText('cb.presetSaved', 'Binder saved.').replace('{name}', name.trim()), 'success');
    }

    function cbLoadPreset(id) {
        const preset = cbPresets.find(p => p.id === id);
        if (!preset) return;
        cbSelectedArchetypes = preset.archetypes.map(a => ({ name: a.name, source: a.source }));
        cbSaveSelections();
        cbRenderChips();
        cbRenderDropdownList();
        cbRenderPresetBar();
        if (typeof showToast === 'function') showToast(t('binder.loaded').replace('{name}', preset.name), 'info');
    }

    function cbDeletePreset(id) {
        const preset = cbPresets.find(p => p.id === id);
        if (!preset) return;
        if (!confirm(t('binder.deleteConfirm').replace('{name}', preset.name))) return;
        cbPresets = cbPresets.filter(p => p.id !== id);
        cbSavePresets();
        cbRenderPresetBar();
        if (typeof showToast === 'function') showToast(t('binder.deleted').replace('{name}', preset.name), 'info');
    }

    function cbRenderPresetBar() {
        const bar = document.getElementById('cbPresetBar');
        if (!bar) return;
        if (cbPresets.length === 0) {
            bar.innerHTML = '';
            bar.classList.add('d-none');
            return;
        }
        bar.classList.remove('d-none');
        bar.innerHTML = cbPresets.map(p => {
            const safeName = escapeHtml(p.name);
            const safeId = escapeHtml(p.id);
            return `<span class="cb-preset-chip">
                <button type="button" class="cb-preset-load" onclick="cbLoadPreset('${safeId}')" title="${cbText('cb.load','Load')}: ${safeName}">${safeName} <small class="opacity-60">(${p.archetypes.length})</small></button>
                <button type="button" class="cb-preset-delete" onclick="cbDeletePreset('${safeId}')" title="${cbText('cb.delete','Delete')}">&times;</button>
            </span>`;
        }).join('');
    }

    // ── Load all available archetypes from all data sources ──
    async function cbEnsureArchetypeList() {
        if (cbArchetypesLoaded && cbAllArchetypes.length > 0) return;

        const shared = mb();
        if (shared.ensureMetaDataLoaded) await shared.ensureMetaDataLoaded();

        const seen = new Set();
        const result = [];

        function addFromRows(rows, source, label) {
            if (!Array.isArray(rows)) return;
            rows.forEach(row => {
                const name = String(row.archetype || row.deck_name || '').trim();
                if (!name) return;
                const key = (shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(name) : name.toLowerCase()) + '|' + source;
                if (seen.has(key)) return;
                seen.add(key);
                result.push({ name, source, label });
            });
        }

        // Current meta
        const currentMeta = Array.isArray(window.currentMetaAnalysisData) ? window.currentMetaAnalysisData : [];
        addFromRows(currentMeta, 'current-meta', 'Current Meta');

        // City league current
        const cityCurrent = Array.isArray(window.cityLeagueAnalysisDataCurrent)
            ? window.cityLeagueAnalysisDataCurrent
            : (Array.isArray(window.cityLeagueAnalysisData) ? window.cityLeagueAnalysisData : []);
        addFromRows(cityCurrent, 'city-current', 'City League');

        // City league past
        const cityPast = Array.isArray(window.cityLeagueAnalysisDataPast)
            ? window.cityLeagueAnalysisDataPast
            : (Array.isArray(window.cityLeagueAnalysisM3Data) ? window.cityLeagueAnalysisM3Data : []);
        addFromRows(cityPast, 'city-past', 'City League Past');

        // Also load comparison CSV for better archetype names
        try {
            const [cmpCurrent, cmpCity, cmpCityPast] = await Promise.all([
                (typeof loadCSV === 'function' ? loadCSV('limitless_online_decks_comparison.csv').catch(() => []) : []),
                (typeof loadCSV === 'function' ? loadCSV('city_league_archetypes_comparison.csv').catch(() => []) : []),
                (typeof loadCSV === 'function' ? loadCSV('city_league_archetypes_past_comparison.csv').catch(() => []) : [])
            ]);
            addFromRows(cmpCurrent, 'current-meta', 'Current Meta');
            addFromRows(cmpCity, 'city-current', 'City League');
            addFromRows(cmpCityPast, 'city-past', 'City League Past');
        } catch (_) { /* ignore */ }

        // Sort: Current Meta first, then City League, then alphabetically
        const sourceOrder = { 'current-meta': 0, 'city-current': 1, 'city-past': 2 };
        result.sort((a, b) => {
            const so = (sourceOrder[a.source] || 0) - (sourceOrder[b.source] || 0);
            if (so !== 0) return so;
            return a.name.localeCompare(b.name);
        });

        // Welche Namen haben ueberhaupt eigene Kartenzeilen?
        //
        // Der Picker speist sich aus Vergleichsdateien, die reine NAMENSLISTEN
        // sind — sie sagen nichts darueber, ob zu einem Namen auch Karten
        // vorliegen. Gemessen am 23.08.2026: von 132 Namen der aktuellen
        // Vergleichsdatei haben 53 exakte Kartendaten, 41 landen ueber die
        // unscharfe Namenssuche in getCardsForArchetypeSource bei einem ANDEREN
        // Archetyp und 38 liefern gar nichts. Von den 41 sind 28 harmlos (der
        // Treffer ist dasselbe Deck unter laengerem Namen, "Dhelmise" ->
        // "Dhelmise Pbl"), 13 sind ein fremdes Deck: "Hop's Zacian" liefert die
        // Karten von "Hop's Trevenant", "Terapagos Noctowl" die von "Flareon
        // Noctowl".
        //
        // Das ist im Alltag harmloser, als es klingt — die Liste ist nach
        // Metarang sortiert, und die ersten 40 Raenge sind ausnahmslos sauber;
        // der erste kaputte Eintrag steht auf Rang 60 mit 0,18 % Anteil, alle
        // kaputten zusammen tragen 2,91 % Metaanteil. Aber "still ein fremdes
        // Deck einsetzen" ist genau das, was die Hausregel verbietet: melden,
        // nicht heimlich reparieren. Also wird es angezeigt statt versteckt.
        markiereKartendaten(result, shared);

        cbAllArchetypes = result;
        cbArchetypesLoaded = true;
    }

    /** Setzt je Eintrag datenlage: 'exakt' | 'ersatz' | 'keine'. */
    function markiereKartendaten(eintraege, shared) {
        const norm = n => (shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(n) : String(n || '').toLowerCase());
        const quellen = {
            'current-meta': window.currentMetaAnalysisData,
            'city-current': window.cityLeagueAnalysisDataCurrent || window.cityLeagueAnalysisData,
            'city-past': window.cityLeagueAnalysisDataPast || window.cityLeagueAnalysisM3Data || []
        };
        const exakteNamen = {};
        Object.keys(quellen).forEach(k => {
            const rows = Array.isArray(quellen[k]) ? quellen[k] : [];
            const set = new Set();
            rows.forEach(r => { const n = String(r.archetype || '').trim(); if (n) set.add(norm(n)); });
            exakteNamen[k] = set;
        });
        eintraege.forEach(e => {
            const set = exakteNamen[e.source];
            if (set && set.has(norm(e.name))) { e.datenlage = 'exakt'; return; }
            // Kein exakter Treffer: was wuerde die unscharfe Suche liefern?
            let ersatz = '';
            if (shared.getCardsForArchetypeSource) {
                const rows = shared.getCardsForArchetypeSource(e.name, e.source) || [];
                ersatz = rows.length ? String(rows[0].archetype || '').trim() : '';
            }
            e.datenlage = ersatz ? 'ersatz' : 'keine';
            e.ersatzFuer = ersatz;
        });
    }

    // ── Gespeicherte Ordner: Speicher ──

    /** Firestore-Sammlung des angemeldeten Nutzers, sonst null. */
    function cbBinderCol() {
        try {
            if (typeof firebase === 'undefined' || !firebase.firestore) return null;
            const u = (typeof auth !== 'undefined' && auth && auth.currentUser) ? auth.currentUser : null;
            if (!u) return null;
            return firebase.firestore().collection('users').doc(u.uid).collection('customBinders');
        } catch (_) { return null; }
    }

    function cbBinderLocalLesen() {
        try {
            const roh = JSON.parse(localStorage.getItem(CB_BINDERS_KEY) || '[]');
            return Array.isArray(roh) ? roh : [];
        } catch (_) { return []; }
    }

    function cbBinderLocalSchreiben() {
        try { localStorage.setItem(CB_BINDERS_KEY, JSON.stringify(cbBinders)); } catch (_) { /* voll */ }
    }

    /**
     * Ordnerliste laden. Angemeldet aus Firestore, sonst aus localStorage.
     * Beim ersten angemeldeten Laden werden alte Presets uebernommen — sie
     * haben keinen Schnappschuss, ihr erster Abgleich meldet darum ehrlich
     * "noch nie abgeglichen" statt hunderte Karten als neu.
     */
    async function cbLadeBinderListe(erzwingen) {
        if (cbBindersGeladen && !erzwingen) return cbBinders;
        const col = cbBinderCol();
        if (!col) {
            cbBinders = cbBinderLocalLesen();
            cbBindersGeladen = true;
            return cbBinders;
        }
        try {
            const snap = await col.get();
            cbBinders = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
            if (cbBinders.length === 0) await cbUebernehmePresets(col);
            cbBinders.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
            cbBindersGeladen = true;
            cbBinderLocalSchreiben();
        } catch (e) {
            console.warn('[CustomBinder] Ordnerliste nicht ladbar:', e && e.message);
            cbBinders = cbBinderLocalLesen();
            cbBindersGeladen = true;
        }
        return cbBinders;
    }

    async function cbUebernehmePresets(col) {
        const alt = cbLoadPresets();
        if (!Array.isArray(alt) || alt.length === 0) return;
        alt.forEach(p => {
            const id = col.doc().id;
            const doc = {
                schemaVersion: 1,
                name: p.name || cbText('cb.binderDefaultName', 'Mein Ordner'),
                archetypes: Array.isArray(p.archetypes) ? p.archetypes : [],
                threshold: cbThreshold,
                snapshot: null,
                erledigt: []
            };
            cbBinders.push(Object.assign({ id }, doc));
            col.doc(id).set(doc).catch(err =>
                console.warn('[CustomBinder] Preset-Uebernahme fehlgeschlagen:', err && err.message));
        });
    }

    /** Schlanker Schnappschuss: nur was der Vergleich und die Raus-Kacheln brauchen. */
    function cbBaueSchnappschuss(karten) {
        return {
            takenAt: new Date().toISOString(),
            cards: (karten || []).map(c => ({
                cardId: c.cardId, name: c.name, set: c.set, number: c.number,
                maxCount: c.maxCount,
                familyRefs: Array.isArray(c.familyRefs) ? c.familyRefs : []
            }))
        };
    }

    /**
     * Ordner anlegen oder ueberschreiben. Optimistisch: die Liste und die
     * Rueckmeldung stehen sofort, der Schreibvorgang laeuft nebenher — so
     * macht es saveDeck() auch, und aus demselben Grund (ein await haengt
     * offline endlos). Fehler werden gemeldet, nicht verschluckt.
     */
    function cbSchreibeBinder(binder) {
        const idx = cbBinders.findIndex(b => b.id === binder.id);
        if (idx >= 0) cbBinders[idx] = binder; else cbBinders.push(binder);
        cbBinderLocalSchreiben();
        const col = cbBinderCol();
        if (!col) return;
        const nutzlast = {
            schemaVersion: 1,
            name: binder.name,
            archetypes: binder.archetypes,
            threshold: binder.threshold,
            snapshot: binder.snapshot || null,
            erledigt: Array.isArray(binder.erledigt) ? binder.erledigt : []
        };
        const groesse = JSON.stringify(nutzlast).length;
        if (groesse > 700000) {
            // Vor dem Limit abbiegen und es sagen, statt in einen stillen
            // Schreibfehler zu laufen.
            nutzlast.snapshot = binder.snapshot
                ? { takenAt: binder.snapshot.takenAt, cards: binder.snapshot.cards.map(c => ({ cardId: c.cardId, maxCount: c.maxCount })), reduziert: true }
                : null;
            if (typeof showToast === 'function') {
                showToast(cbText('cb.binderTooBig', 'Ordner sehr gross — Schnappschuss verkürzt gespeichert.'), 'warning');
            }
        }
        col.doc(binder.id).set(nutzlast).catch(err => {
            console.warn('[CustomBinder] Ordner nicht gespeichert:', err && err.message);
            if (typeof showToast === 'function') {
                showToast(cbText('cb.binderSaveFailed', 'Ordner konnte nicht im Konto gespeichert werden — nur auf diesem Gerät.'), 'error');
            }
        });
    }

    function cbNeueBinderId() {
        const col = cbBinderCol();
        if (col) { try { return col.doc().id; } catch (_) { /* weiter unten */ } }
        return 'lok-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    // ── Gespeicherte Ordner: Bedienung ──

    function cbAktuellerBinder() {
        return cbBinders.find(b => b.id === cbAktiverBinder) || null;
    }

    function cbVorschlagName() {
        if (cbSelectedArchetypes.length === 0) return cbText('cb.binderDefaultName', 'Mein Ordner');
        if (cbBinders.length === 0) return cbText('cb.binderDefaultName', 'Mein Ordner');
        return cbSelectedArchetypes.slice(0, 2).map(a => a.name).join(' + ');
    }

    /** Aktuelle Auswahl als Ordner sichern. Ohne id: neu anlegen. */
    async function cbSpeichereBinder(alsNeu) {
        if (cbSelectedArchetypes.length === 0) {
            if (typeof showToast === 'function') showToast(cbText('cb.pickFirst', 'Bitte zuerst Decks auswählen.'), 'warning');
            return;
        }
        await cbLadeBinderListe();
        const vorhanden = alsNeu ? null : cbAktuellerBinder();
        const name = vorhanden ? vorhanden.name : (cbFrageName(cbVorschlagName()) || '').trim();
        if (!vorhanden && !name) return;
        const karten = (window._cbDelta && window._cbDelta.cards) || [];
        const binder = {
            id: vorhanden ? vorhanden.id : cbNeueBinderId(),
            name: vorhanden ? vorhanden.name : name,
            archetypes: cbSelectedArchetypes.map(a => ({ name: a.name, source: a.source })),
            threshold: cbThreshold,
            snapshot: karten.length ? cbBaueSchnappschuss(karten) : (vorhanden ? vorhanden.snapshot : null),
            erledigt: []
        };
        cbAktiverBinder = binder.id;
        cbSchreibeBinder(binder);
        cbRenderBinderBar();
        if (typeof showToast === 'function') showToast(cbText('cb.binderSaved', 'Ordner gespeichert.'), 'success');
    }

    function cbFrageName(vorschlag) {
        // prompt() ist auf dem Telefon ein Systemdialog mitten im Screen —
        // haesslich, aber ein eigenes Eingabefeld waere ein zweiter Dialog-
        // Mechanismus fuer eine einzelne Zeile. Bewusst so belassen.
        try { return window.prompt(cbText('cb.nameLabel', 'Name für diesen Ordner'), vorschlag); }
        catch (_) { return vorschlag; }
    }

    /** Ordner oeffnen: Auswahl, Schwelle und Schnappschuss wiederherstellen. */
    async function cbOeffneBinder(id) {
        await cbLadeBinderListe();
        const b = cbBinders.find(x => x.id === id);
        if (!b) return;
        cbAktiverBinder = id;
        cbSelectedArchetypes = Array.isArray(b.archetypes) ? b.archetypes.map(a => ({ name: a.name, source: a.source })) : [];
        if (b.threshold === 0 || b.threshold === 30 || b.threshold === 70) cbThreshold = b.threshold;
        _cbSessionBaseline = null;   // Vergleichspunkt kommt jetzt aus DIESEM Ordner
        _cbAbgleich = null;
        cbSaveSelections();
        cbRenderChips();
        cbRenderBinderBar();
        await buildCustomBinder();
    }

    async function cbLoescheBinder(id) {
        const b = cbBinders.find(x => x.id === id);
        if (!b) return;
        const frage = cbText('cb.deleteConfirm', '„{name}" löschen? Deine Sammlung bleibt unberührt.').replace('{name}', b.name);
        if (typeof window.confirm === 'function' && !window.confirm(frage)) return;
        cbBinders = cbBinders.filter(x => x.id !== id);
        if (cbAktiverBinder === id) { cbAktiverBinder = null; _cbAbgleich = null; }
        cbBinderLocalSchreiben();
        const col = cbBinderCol();
        if (col) col.doc(id).delete().catch(err => console.warn('[CustomBinder] Löschen fehlgeschlagen:', err && err.message));
        cbRenderBinderBar();
    }

    function cbDatumKurz(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
        return m ? `${m[3]}.${m[2]}.${m[1]}` : cbText('cb.never', 'noch nie abgeglichen');
    }

    /** Die Ordnerleiste ueber dem Picker. */
    function cbRenderBinderBar() {
        const el = document.getElementById('cbBinderBar');
        if (!el) return;
        if (!cbBinders.length) {
            el.innerHTML = `<div class="cb-binder-empty">${escapeHtml(cbText('cb.noBinders', 'Noch kein Ordner gespeichert. Wähle Decks und speichere sie als Ordner.'))}</div>`;
            return;
        }
        const zeilen = cbBinders.map(b => {
            const aktiv = b.id === cbAktiverBinder;
            const stand = b.snapshot && b.snapshot.takenAt
                ? cbText('cb.binderMeta', '{n} Decks · Stand {date}')
                    .replace('{n}', String((b.archetypes || []).length))
                    .replace('{date}', cbDatumKurz(b.snapshot.takenAt))
                : cbText('cb.binderMetaNever', '{n} Decks · noch nie abgeglichen')
                    .replace('{n}', String((b.archetypes || []).length));
            return `<div class="cb-binder-row ${aktiv ? 'is-active' : ''}">
                <button type="button" class="cb-binder-open" onclick="cbOeffneBinder('${escapeHtmlAttr(b.id)}')">
                    <span class="cb-binder-name">${escapeHtml(b.name)}</span>
                    <span class="cb-binder-meta">${escapeHtml(stand)}</span>
                </button>
                <button type="button" class="cb-binder-del" onclick="cbLoescheBinder('${escapeHtmlAttr(b.id)}')" aria-label="${escapeHtmlAttr(cbText('cb.delete', 'Löschen'))}: ${escapeHtmlAttr(b.name)}">×</button>
            </div>`;
        }).join('');
        el.innerHTML = `<div class="cb-binder-list">${zeilen}</div>`;
    }

    // ── Abgleich: was muss rein, was muss raus ──

    /**
     * Den geladenen Ordner gegen den heutigen Stand rechnen.
     *
     * Drei Stapel, weil es drei verschiedene Handgriffe sind:
     *   RAUS         — aus dem Ordner nehmen
     *   REIN, hast du— in der Box suchen und einsortieren
     *   REIN, fehlt  — kannst du am Tisch gar nicht erledigen
     * Sie in einen Topf zu werfen hiesse, ein Drittel der Liste anzuzeigen,
     * das man gerade nicht abarbeiten kann.
     */
    async function cbAktualisiereBinder() {
        const b = cbAktuellerBinder();
        if (!b) {
            if (typeof showToast === 'function') showToast(cbText('cb.loadFirst', 'Zuerst einen Ordner laden.'), 'warning');
            return;
        }
        await buildCustomBinder();
        const delta = window._cbDelta;
        if (!delta) return;

        const vorherIds = new Set(((b.snapshot && b.snapshot.cards) || []).map(c => c.cardId));
        const hatSchnappschuss = vorherIds.size > 0;
        const raus = (delta.droppedCards || []).slice();
        const reinAlle = hatSchnappschuss
            ? delta.cards.filter(c => !vorherIds.has(c.cardId))
            : [];

        _cbAbgleich = {
            stand: (b.snapshot && b.snapshot.takenAt) || null,
            hatSchnappschuss,
            raus,
            reinHabe: reinAlle.filter(c => c.missing === 0),
            reinFehlt: reinAlle.filter(c => c.missing > 0)
        };
        cbRenderAbgleich();
        const el = document.getElementById('cbAbgleich');
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    function cbErledigtSet() {
        const b = cbAktuellerBinder();
        return new Set(Array.isArray(b && b.erledigt) ? b.erledigt : []);
    }

    function cbOffeneAnzahl() {
        if (!_cbAbgleich) return 0;
        const fertig = cbErledigtSet();
        const alle = _cbAbgleich.raus.concat(_cbAbgleich.reinHabe, _cbAbgleich.reinFehlt);
        return alle.filter(c => !fertig.has(c.cardId)).length;
    }

    /** Eine Karte als erledigt markieren bzw. zurueckholen. Ueberlebt das Weglegen. */
    function cbHakeAb(cardId) {
        const b = cbAktuellerBinder();
        if (!b) return;
        const liste = Array.isArray(b.erledigt) ? b.erledigt.slice() : [];
        const i = liste.indexOf(cardId);
        if (i >= 0) liste.splice(i, 1); else liste.push(cardId);
        b.erledigt = liste;
        cbSchreibeBinder(b);
        cbRenderAbgleich();
    }

    /** Abgleich abschliessen: der heutige Stand wird der neue Vergleichspunkt. */
    function cbAbgleichFertig() {
        const b = cbAktuellerBinder();
        if (!b) return;
        const karten = (window._cbDelta && window._cbDelta.cards) || [];
        if (karten.length) b.snapshot = cbBaueSchnappschuss(karten);
        b.erledigt = [];
        b.threshold = cbThreshold;
        b.archetypes = cbSelectedArchetypes.map(a => ({ name: a.name, source: a.source }));
        cbSchreibeBinder(b);
        _cbAbgleich = null;
        cbRenderAbgleich();
        cbRenderBinderBar();
        if (typeof showToast === 'function') showToast(cbText('cb.binderUpToDate', 'Ordner ist auf dem aktuellen Stand.'), 'success');
    }

    function cbAbgleichKachel(c, farbe) {
        const fertig = cbErledigtSet().has(c.cardId);
        const rec = (mb().findCardRecord ? mb().findCardRecord(c.name, c.set, c.number) : null);
        const bild = rec && rec.image_url ? rec.image_url : '';
        const menge = c.maxCount || 1;
        return `<button type="button" class="cb-ab-kachel ${fertig ? 'is-fertig' : ''}"
            style="--ab-farbe:${farbe}" onclick="cbHakeAb('${escapeHtmlAttr(c.cardId)}')"
            aria-pressed="${fertig ? 'true' : 'false'}"
            aria-label="${escapeHtmlAttr(c.name)} — ${escapeHtmlAttr(fertig ? cbText('cb.doneUndo', 'erledigt, zurücknehmen') : cbText('cb.markDone', 'als erledigt markieren'))}">
            ${bild ? `<img src="${escapeHtmlAttr(bild)}" alt="" loading="lazy">` : '<span class="cb-ab-kein-bild"></span>'}
            <span class="cb-ab-menge">${menge}</span>
            <span class="cb-ab-name">${escapeHtml(c.name)}</span>
            ${fertig ? '<span class="cb-ab-haken">✓</span>' : ''}
        </button>`;
    }

    function cbAbgleichAbschnitt(titel, hinweis, karten, farbe) {
        if (!karten.length) return '';
        const fertig = cbErledigtSet();
        const offen = karten.filter(c => !fertig.has(c.cardId)).length;
        return `<section class="cb-ab-block">
            <h4 class="cb-ab-titel" style="color:${farbe}">${escapeHtml(titel)} (${offen}/${karten.length})</h4>
            <p class="cb-ab-hinweis">${escapeHtml(hinweis)}</p>
            <div class="cb-ab-gitter">${karten.map(c => cbAbgleichKachel(c, farbe)).join('')}</div>
        </section>`;
    }

    function cbRenderAbgleich() {
        const el = document.getElementById('cbAbgleich');
        if (!el) return;
        if (!_cbAbgleich) { el.innerHTML = ''; el.classList.add('d-none'); return; }
        el.classList.remove('d-none');
        const a = _cbAbgleich;

        if (!a.hatSchnappschuss) {
            el.innerHTML = `<div class="cb-ab-karte"><p class="cb-ab-hinweis">${escapeHtml(cbText('cb.noBaseline', 'Dieser Ordner wurde noch nie abgeglichen — es gibt nichts zu vergleichen. Der heutige Stand wird als Ausgangspunkt gespeichert.'))}</p>
                <button type="button" class="cb-ab-fertig" onclick="cbAbgleichFertig()">${escapeHtml(cbText('cb.setBaseline', 'Als Ausgangspunkt speichern'))}</button></div>`;
            return;
        }

        const gesamt = a.raus.length + a.reinHabe.length + a.reinFehlt.length;
        if (gesamt === 0) {
            el.innerHTML = `<div class="cb-ab-karte"><p class="cb-ab-nix">${escapeHtml(cbText('cb.diffNothing', 'Nichts zu tun — dein Ordner ist auf dem aktuellen Stand.'))}</p></div>`;
            return;
        }

        // Blau statt Gruen fuer "rein": tokens.css verbietet Rot-Gruen als
        // alleinigen Bedeutungstraeger. Zeichen und Wort tragen die Bedeutung,
        // die Farbe ist nur Zugabe.
        const rot = 'var(--dv-neg)';
        const blau = 'var(--dv-pos)';
        const offen = cbOffeneAnzahl();
        const kopf = cbText('cb.diffSummary', '{out} raus · {in} rein · {missing} davon fehlen dir')
            .replace('{out}', String(a.raus.length))
            .replace('{in}', String(a.reinHabe.length + a.reinFehlt.length))
            .replace('{missing}', String(a.reinFehlt.length));

        el.innerHTML = `<div class="cb-ab-karte">
            <div class="cb-ab-kopf">
                <strong>${escapeHtml(kopf)}</strong>
                <span class="cb-ab-offen">${escapeHtml(cbText('cb.diffOpen', 'Noch offen: {n}').replace('{n}', String(offen)))}</span>
            </div>
            ${a.stand ? `<p class="cb-ab-stand">${escapeHtml(cbText('cb.diffSince', 'Verglichen mit deinem Stand vom {date}').replace('{date}', cbDatumKurz(a.stand)))}</p>` : ''}
            ${cbAbgleichAbschnitt(cbText('cb.diffOut', '➖ Raus aus dem Ordner'), cbText('cb.diffOutHint', 'Diese Karten aus dem Ordner nehmen.'), a.raus, rot)}
            ${cbAbgleichAbschnitt(cbText('cb.diffInOwned', '➕ Rein — hast du'), cbText('cb.diffInOwnedHint', 'Liegt in deiner Sammlung — raussuchen und einsortieren.'), a.reinHabe, blau)}
            ${cbAbgleichAbschnitt(cbText('cb.diffInMissing', '➕ Rein — fehlt dir'), cbText('cb.diffInMissingHint', 'Kannst du jetzt nicht einsortieren — Wunschliste oder Druckliste.'), a.reinFehlt, blau)}
            <button type="button" class="cb-ab-fertig" onclick="cbAbgleichFertig()">${escapeHtml(cbText('cb.diffDone', 'Fertig — Ordner ist aktuell'))}</button>
        </div>`;
    }

    // ── Sortierung ──

    /**
     * Die Reihenfolge der Kartenarten — dieselbe wie im Filter "Alle Typen".
     * Wer eine Zeile hier aendert, muss die Auswahlliste mitaendern; der Test
     * test-custom-binder-typ-sortierung.js haelt beide zusammen.
     */
    const CB_TYP_REIHENFOLGE = [
        'Pokemon-Grass', 'Pokemon-Fire', 'Pokemon-Water', 'Pokemon-Lightning',
        'Pokemon-Psychic', 'Pokemon-Fighting', 'Pokemon-Darkness', 'Pokemon-Metal',
        'Pokemon-Dragon', 'Pokemon-Colorless',
        'Supporter', 'Item', 'Tool', 'Stadium',
        'Special Energy', 'Basic Energy', 'ACE SPEC'
    ];

    function cbTypRang(shared, karte) {
        const meta = shared.getMetaBinderTypeMeta(karte);
        const typ = String(meta && meta.type || '');
        const rang = CB_TYP_REIHENFOLGE.indexOf(typ);
        // Unbekannte Art ans Ende, aber nicht durcheinander: alle unbekannten
        // landen auf demselben Rang und werden danach nach Namen sortiert.
        return rang === -1 ? CB_TYP_REIHENFOLGE.length : rang;
    }

    /**
     * Die Ordner-Sortierung. Voreinstellung 'binder' ist exakt die bisherige
     * Reihenfolge (Kartenart, dann neuestes Set, dann Sammelnummer) — sie war
     * schon immer die richtige, nur nie beschriftet und nie umschaltbar.
     */
    function cbSortiere(karten, shared) {
        const nameVergleich = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de');
        if (cbSort === 'name') return karten.sort(nameVergleich);
        if (cbSort === 'decks') {
            return karten.sort((a, b) => {
                const d = (b.decks ? b.decks.length : 0) - (a.decks ? a.decks.length : 0);
                return d !== 0 ? d : nameVergleich(a, b);
            });
        }
        if (cbSort === 'fehlend') {
            return karten.sort((a, b) => {
                const f = (b.missing || 0) - (a.missing || 0);
                if (f !== 0) return f;
                const d = (b.decks ? b.decks.length : 0) - (a.decks ? a.decks.length : 0);
                return d !== 0 ? d : nameVergleich(a, b);
            });
        }
        if (cbSort === 'typ') {
            // Kartenart zuerst, innerhalb der Art nach Name.
            //
            // Hier stand vorher ta.localeCompare(tb) — ein Vergleich der
            // internen Typnamen, also ALPHABETISCH: "ACE SPEC", "Basic Energy",
            // "Item", "Pokemon-Colorless", "Pokemon-Darkness", ... "Stadium",
            // "Supporter", "Tool". Das ist keine Ordnerreihenfolge, das ist
            // Zufall. Der Betreiber hat gemeldet, dass die Sortierung nicht in
            // der richtigen Reihenfolge sortiert.
            //
            // CB_TYP_REIHENFOLGE ist genau die Reihenfolge, die im Filter
            // "Alle Typen" darueber steht: erst die Pokémon nach Element, dann
            // Unterstuetzer, Item, Tool, Stadium, Spezial-Energie,
            // Basis-Energie, ACE SPEC. Zwei Listen, eine Reihenfolge.
            return karten.sort((a, b) => {
                const ra = cbTypRang(shared, a), rb = cbTypRang(shared, b);
                if (ra !== rb) return ra - rb;
                return nameVergleich(a, b);
            });
        }
        if (cbSort === 'set') {
            return karten.sort((a, b) => {
                const sa = shared.getMetaBinderSetOrderValue ? shared.getMetaBinderSetOrderValue(a.set) : 0;
                const sb = shared.getMetaBinderSetOrderValue ? shared.getMetaBinderSetOrderValue(b.set) : 0;
                if (sa !== sb) return sb - sa;
                const na = shared.parseCardNumberForSort ? shared.parseCardNumberForSort(a.number) : 0;
                const nb = shared.parseCardNumberForSort ? shared.parseCardNumberForSort(b.number) : 0;
                if (na !== nb) return na - nb;
                return nameVergleich(a, b);
            });
        }
        return cbAllPrints
            ? shared.sortMetaCardsAllPrints(karten)
            : shared.sortMetaCards(karten, cbAllPrints);
    }

    function cbSetSort(wert) {
        const erlaubt = ['binder', 'set', 'typ', 'decks', 'fehlend', 'name'];
        cbSort = erlaubt.indexOf(wert) >= 0 ? wert : 'binder';
        cbApplyFilter();
    }

    // ── UI: Archetype Picker ──
    function cbRenderChips() {
        const el = document.getElementById('cbSelectedChips');
        if (!el) return;

        if (cbSelectedArchetypes.length === 0) {
            el.innerHTML = '<span class="color-grey fs-85">No archetypes selected.</span>';
        } else {
            el.innerHTML = cbSelectedArchetypes.map((a, i) => {
                const safeName = escapeHtml(a.name);
                const sourceTag = a.source === 'current-meta' ? 'Meta' : (a.source === 'city-current' ? 'City' : 'Past');
                const sourceCls = a.source === 'current-meta' ? 'cb-src-meta'
                                : (a.source === 'city-current' ? 'cb-src-city' : 'cb-src-past');
                const icon = (typeof window.ArchetypeIcons !== 'undefined')
                    ? window.ArchetypeIcons.getIconHtml(a.name, { size: 'sm', layout: 'inline' })
                    : '';
                return `<span class="custom-binder-chip ${sourceCls}" title="${escapeHtml(a.source)}">
                    ${icon}${safeName} <small class="cb-src-tag">${sourceTag}</small>
                    <button type="button" class="custom-binder-chip-remove" onclick="cbRemoveArchetype(${i})" aria-label="Remove">&times;</button>
                </span>`;
            }).join('');
        }

        // Update generate button state
        const btn = document.getElementById('cbGenerateBtn');
        if (btn) btn.disabled = cbSelectedArchetypes.length === 0;
    }

    function cbAddArchetype(name, source) {
        const shared = mb();
        const key = (shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(name) : name.toLowerCase()) + '|' + source;
        const exists = cbSelectedArchetypes.some(a => {
            const aKey = (shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(a.name) : a.name.toLowerCase()) + '|' + a.source;
            return aKey === key;
        });
        if (exists) return;

        cbSelectedArchetypes.push({ name, source });
        cbSaveSelections();
        cbRenderChips();
        cbRenderDropdownList();
    }

    function cbToggleArchetype(name, source) {
        const shared = mb();
        const key = (shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(name) : name.toLowerCase()) + '|' + source;
        const idx = cbSelectedArchetypes.findIndex(a => {
            const aKey = (shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(a.name) : a.name.toLowerCase()) + '|' + a.source;
            return aKey === key;
        });
        if (idx >= 0) {
            cbSelectedArchetypes.splice(idx, 1);
        } else {
            cbSelectedArchetypes.push({ name, source });
        }
        cbSaveSelections();
        cbRenderChips();
        // Re-render dropdown without closing it
        _cbSkipNextClose = true;
        cbRenderDropdownList();
    }

    function cbRemoveArchetype(index) {
        cbSelectedArchetypes.splice(index, 1);
        cbSaveSelections();
        cbRenderChips();
        cbRenderDropdownList();
    }

    function cbToggleArchetypeDropdown() {
        const dd = document.getElementById('cbArchetypeDropdown');
        if (!dd) return;

        if (dd.classList.contains('d-none')) {
            cbOpenDropdown();
        } else {
            dd.classList.add('d-none');
        }
    }

    async function cbOpenDropdown() {
        const dd = document.getElementById('cbArchetypeDropdown');
        if (!dd) return;

        dd.classList.remove('d-none');
        dd.innerHTML = `<div class="custom-binder-dropdown-loading">${cbText('cb.loadingArchetypes','Loading archetypes…')}</div>`;

        await cbEnsureArchetypeList();
        await cbEnsureTierGroups();
        cbRenderDropdownList();
    }

    async function cbEnsureTierGroups() {
        // If Meta Binder already built the groups, use those
        if (Array.isArray(window._metaBinderArchetypeGroups) && window._metaBinderArchetypeGroups.length > 0) {
            _cbTierGroups = window._metaBinderArchetypeGroups;
            return;
        }
        // Already loaded our own fallback
        if (_cbTierGroups && _cbTierGroups.length > 0) return;

        const shared = mb();
        const groups = [];
        try {
            // Use same ranking functions as Meta Binder
            if (shared.getTopCurrentMetaArchetypes) {
                const top20 = await shared.getTopCurrentMetaArchetypes(20);
                if (top20.length) groups.push({ title: 'Top 20 Current Meta', source: 'current-meta', items: top20.map(n => ({ name: n, source: 'current-meta' })) });
            }

            const cityCurrentRows = Array.isArray(window.cityLeagueAnalysisDataCurrent)
                ? window.cityLeagueAnalysisDataCurrent
                : (Array.isArray(window.cityLeagueAnalysisData) ? window.cityLeagueAnalysisData : []);
            const cityPastRows = Array.isArray(window.cityLeagueAnalysisDataPast)
                ? window.cityLeagueAnalysisDataPast
                : (Array.isArray(window.cityLeagueAnalysisM3Data) ? window.cityLeagueAnalysisM3Data : []);

            if (shared.getTopCityArchetypes) {
                const topCity = await shared.getTopCityArchetypes('city_league_archetypes_comparison.csv', cityCurrentRows, 10);
                if (topCity.length) groups.push({ title: 'Top 10 City League', source: 'city-current', items: topCity.map(n => ({ name: n, source: 'city-current' })) });

                const topCityPast = await shared.getTopCityArchetypes('city_league_archetypes_past_comparison.csv', cityPastRows, 10);
                if (topCityPast.length) groups.push({ title: 'Top 10 City League Past', source: 'city-past', items: topCityPast.map(n => ({ name: n, source: 'city-past' })) });
            }
        } catch (e) {
            console.warn('[CustomBinder] tier groups fallback error:', e);
        }
        _cbTierGroups = groups.length > 0 ? groups : null;
    }

    // ── Helper: extract main pokemon key from archetype name ──
    function cbGetMainPokemon(name) {
        const raw = String(name || '').trim().toLowerCase();
        if (!raw) return '';
        if (raw.startsWith('mega ')) return raw.split(' ').slice(0, 2).join(' ');
        if (raw.startsWith('alolan ') || raw.startsWith('galarian ') || raw.startsWith('hisuian ')) return raw.split(' ').slice(0, 2).join(' ');
        // Group every "<Trainer>'s X" under its owner token via the shared
        // helper (N's, Rocket's, Hop's, Cynthia's, \u2026). Was a hardcoded
        // rocket's/n's/ethan's list that missed every other trainer.
        const owner = (typeof window !== 'undefined' && window.stripTrainerOwnerPrefix)
            ? window.stripTrainerOwnerPrefix(raw).owner : '';
        if (owner) return owner;
        return raw.split(' ')[0];
    }

    function cbTitleCase(s) {
        return String(s || '').split(' ').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    function cbRenderDropdownList() {
        const dd = document.getElementById('cbArchetypeDropdown');
        if (!dd || dd.classList.contains('d-none')) return;

        const searchEl = document.getElementById('cbArchetypeSearch');
        const query = String(searchEl ? searchEl.value : '').trim().toLowerCase();
        const shared = mb();

        // Build set of already-selected keys
        const selectedKeys = new Set(cbSelectedArchetypes.map(a =>
            (shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(a.name) : a.name.toLowerCase()) + '|' + a.source
        ));

        // Get ranking map for sorting
        const exactMap = window._metaBinderCurrentMetaExactMap instanceof Map
            ? window._metaBinderCurrentMetaExactMap : null;

        // Helper: get rank for an archetype name
        const getRank = (name) => {
            if (!exactMap) return 9999;
            const entry = exactMap.get(String(name).trim().toLowerCase());
            return (entry && Number.isFinite(entry.rank)) ? entry.rank : 9999;
        };
        const getShare = (name) => {
            if (!exactMap) return 0;
            const entry = exactMap.get(String(name).trim().toLowerCase());
            return (entry && Number.isFinite(entry.share)) ? entry.share : 0;
        };

        let items = cbAllArchetypes;
        if (query) {
            items = items.filter(a => a.name.toLowerCase().includes(query));
        }

        if (items.length === 0) {
            dd.innerHTML = `<div class="custom-binder-dropdown-empty">${cbText('cb.noArchetypesFound','No archetypes found.')}</div>`;
            return;
        }

        let html = '';

        // ── Top 5 Main Pokemon quick-select (only when not searching) ──
        if (!query) {
            // Build main pokemon groups from current-meta items
            const currentMetaItems = items.filter(a => a.source === 'current-meta');
            const mainGroupMap = new Map();
            currentMetaItems.forEach(a => {
                const mainKey = cbGetMainPokemon(a.name);
                if (!mainKey) return;
                if (!mainGroupMap.has(mainKey)) {
                    mainGroupMap.set(mainKey, { key: mainKey, label: cbTitleCase(mainKey), variants: [], totalShare: 0 });
                }
                const g = mainGroupMap.get(mainKey);
                g.variants.push(a);
                g.totalShare += getShare(a.name);
            });

            const topMainGroups = Array.from(mainGroupMap.values())
                .filter(g => g.variants.length > 0)
                .sort((a, b) => b.totalShare - a.totalShare)
                .slice(0, 5);

            if (topMainGroups.length > 0) {
                html += `<div class="custom-binder-dropdown-group-label" style="color:var(--accent,#3b4cca);font-weight:900;">${cbText('cb.topMainPokemon','🏆 Top Main Pokémon')}</div>`;
                html += '<div class="cb-main-pokemon-grid">';
                topMainGroups.forEach((g, idx) => {
                    // Check if all variants are already selected
                    const allSelected = g.variants.every(a => {
                        const key = (shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(a.name) : a.name.toLowerCase()) + '|' + a.source;
                        return selectedKeys.has(key);
                    });
                    const shareText = g.totalShare > 0 ? g.totalShare.toFixed(1) + '%' : '';
                    const variantCount = g.variants.length;
                    const variantNames = g.variants.map(v => v.name.replace(/'/g, "\\'")).join('|||');
                    // Top-5 button shows the main Pokémon's icon (uses first
                    // variant's name since the group label might itself be
                    // the raw Pokémon slug — getIconHtml falls back to []
                    // either way if no match is found).
                    const icon = (typeof window.ArchetypeIcons !== 'undefined')
                        ? (window.ArchetypeIcons.getIconHtml(g.label, { size: 'md' })
                           || window.ArchetypeIcons.getIconHtml(g.variants[0] && g.variants[0].name, { size: 'md' }))
                        : '';
                    html += `<button type="button" class="cb-main-pokemon-btn ${allSelected ? 'is-selected' : ''}"
                        onclick="cbToggleMainPokemonGroup('${variantNames}','current-meta')" title="${g.variants.map(v => v.name).join(', ')}">
                        <span class="cb-mpg-rank">#${idx + 1}</span>
                        ${icon}
                        <span class="cb-mpg-name">${escapeHtml(g.label)}</span>
                        <span class="cb-mpg-meta">${variantCount} ${variantCount === 1 ? 'Deck' : 'Decks'}${shareText ? ' · ' + shareText : ''}</span>
                    </button>`;
                });
                html += '</div>';
                html += '<div style="border-top:2px solid var(--border-color,#ddd);margin:6px 0;"></div>';
            }
        }

        // ── All decks sorted by Current Meta ranking ──
        // Group by source, sort each group by rank
        const groups = {};
        items.forEach(a => {
            if (!groups[a.label]) groups[a.label] = [];
            groups[a.label].push(a);
        });

        // Preferred source order: Current Meta first, then City League, then Past
        const sourceOrder = ['Current Meta', 'City League', 'City League Past'];
        const sortedLabels = Object.keys(groups).sort((a, b) => {
            const ia = sourceOrder.indexOf(a);
            const ib = sourceOrder.indexOf(b);
            return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        });

        for (const label of sortedLabels) {
            const archetypes = groups[label];
            // Sort by meta rank (ascending), unranked last, then alphabetically
            archetypes.sort((a, b) => {
                const ra = getRank(a.name);
                const rb = getRank(b.name);
                if (ra !== rb) return ra - rb;
                return a.name.localeCompare(b.name);
            });

            html += `<div class="custom-binder-dropdown-group-label">${escapeHtml(label)}</div>`;
            archetypes.slice(0, 60).forEach((a, idx) => {
                const key = (shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(a.name) : a.name.toLowerCase()) + '|' + a.source;
                const isSelected = selectedKeys.has(key);
                const safeName = escapeHtml(a.name);
                const rank = getRank(a.name);
                const share = getShare(a.name);
                const rankBadge = rank < 9999 ? `<span class="cb-dd-rank">#${rank}</span>` : '';
                const shareText = share > 0 ? `<small class="opacity-60">${share.toFixed(1)}%</small>` : '';
                const icon = (typeof window.ArchetypeIcons !== 'undefined')
                    ? window.ArchetypeIcons.getIconHtml(a.name, { size: 'sm', layout: 'inline' })
                    : '';
                // Datenlage sichtbar machen statt still ein fremdes Deck liefern.
                let hinweis = '';
                let klasse = '';
                if (a.datenlage === 'keine') {
                    klasse = ' is-ohne-daten';
                    hinweis = `<small class="cb-dd-warn">${escapeHtml(cbText('cb.noCardData', 'keine Kartendaten'))}</small>`;
                } else if (a.datenlage === 'ersatz') {
                    klasse = ' is-ersatz';
                    hinweis = `<small class="cb-dd-warn" title="${escapeHtmlAttr(cbText('cb.substituteHint', 'Für diesen Namen liegen keine eigenen Kartendaten vor. Angezeigt werden die Karten von:') + ' ' + a.ersatzFuer)}">${escapeHtml(cbText('cb.substituteShort', 'Karten von'))} ${escapeHtml(a.ersatzFuer)}</small>`;
                }
                html += `<button type="button" class="custom-binder-dropdown-item ${isSelected ? 'is-selected' : ''}${klasse}"
                    onclick="cbToggleArchetype('${a.name.replace(/'/g, "\\'")}','${escapeHtml(a.source)}')">
                    <span class="cb-dd-check">${isSelected ? '✓' : ''}</span>${rankBadge}${icon} ${safeName} ${shareText}${hinweis}
                </button>`;
            });
        }

        dd.innerHTML = html;
    }

    // ── Toggle all variants of a main pokemon group ──
    function cbToggleMainPokemonGroup(variantNamesStr, source) {
        const names = variantNamesStr.split('|||');
        const shared = mb();
        // Check if all are already selected → deselect all, else select all
        const allSelected = names.every(name => {
            const key = (shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(name) : name.toLowerCase()) + '|' + source;
            return cbSelectedArchetypes.some(a =>
                ((shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(a.name) : a.name.toLowerCase()) + '|' + a.source) === key
            );
        });

        if (allSelected) {
            // Remove all variants
            names.forEach(name => {
                const normKey = shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(name) : name.toLowerCase();
                cbSelectedArchetypes = cbSelectedArchetypes.filter(a =>
                    !((shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(a.name) : a.name.toLowerCase()) === normKey && a.source === source)
                );
            });
        } else {
            // Alle fehlenden Varianten aufnehmen. Frueher stand hier eine
            // Obergrenze von 30; gemessen ergibt die Vereinigung ALLER 60
            // Archetypen mit Kartendaten 533 verschiedene Karten, bei der
            // Standardschwelle 329 — also kein Groessenproblem, das eine
            // Obergrenze rechtfertigt.
            names.forEach(name => {
                const normKey = shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(name) : name.toLowerCase();
                const already = cbSelectedArchetypes.some(a =>
                    (shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(a.name) : a.name.toLowerCase()) === normKey && a.source === source
                );
                if (!already) cbSelectedArchetypes.push({ name, source });
            });
        }

        cbSaveSelections();
        cbRenderChips();
        _cbSkipNextClose = true;
        cbRenderDropdownList();
    }
    window.cbToggleMainPokemonGroup = cbToggleMainPokemonGroup;

    function cbFilterArchetypeList() {
        if (!cbArchetypesLoaded) {
            cbOpenDropdown();
            return;
        }
        const dd = document.getElementById('cbArchetypeDropdown');
        if (dd && dd.classList.contains('d-none')) {
            dd.classList.remove('d-none');
        }
        cbRenderDropdownList();
    }

    // ── Close dropdown when clicking outside ──
    document.addEventListener('click', function (e) {
        if (_cbSkipNextClose) { _cbSkipNextClose = false; return; }
        const dd = document.getElementById('cbArchetypeDropdown');
        if (!dd || dd.classList.contains('d-none')) return;
        const picker = e.target.closest('.custom-binder-picker');
        if (!picker) dd.classList.add('d-none');
    });

    // ── Build Custom Binder ──
    async function buildCustomBinder() {
        if (cbSelectedArchetypes.length === 0) {
            if (typeof showToast === 'function') showToast(cbText('cb.selectAtLeastOne','Please select at least one archetype.'), 'warning');
            return;
        }

        const shared = mb();
        const grid = document.getElementById('cbGrid');
        if (grid) grid.innerHTML = `<p class="color-grey">${cbText('mb.loading', 'Loading meta data…')}</p>`;

        await shared.ensureMetaDataLoaded();

        // Build source targets from user selection
        const sourceTargets = cbSelectedArchetypes.map(a => ({ name: a.name, source: a.source }));

        // Load format label
        const currentMetaRows = Array.isArray(window.currentMetaAnalysisData) ? window.currentMetaAnalysisData : [];
        window._metaBinderCurrentMetaLabel = shared.getCurrentMetaFormatLabelFromRows(currentMetaRows);

        // Gather archetype groups for display
        const metricMaps = await shared.loadMetaBinderArchetypeMetricMaps();
        const groupDefs = buildCbGroupDefs();
        window._cbArchetypeGroups = shared.buildMetaBinderArchetypeGroups(groupDefs, metricMaps);

        // Collect cards (same logic as Meta Binder, user-chosen threshold;
        // ACE SPECs always bypass the threshold — floor, never cap)
        const binderMap = shared.collectBinderCards(sourceTargets, { thresholdPercent: cbThreshold });

        if (binderMap.size === 0) {
            if (typeof showToast === 'function') showToast(cbText('mb.noCards', 'No card data found for the selected archetypes.'), 'warning');
            if (grid) grid.innerHTML = '';
            return;
        }

        // Compute delta with own cache key
        const delta = await cbComputeDelta(binderMap, shared);
        window._cbDelta = delta;

        if (cbMode === 'print') await cbLoadPrintedSet();
        cbRenderBinder(delta, shared);
        if (typeof showToast === 'function') showToast(cbText('cb.generated','Custom Binder generated!'), 'success');
    }

    function buildCbGroupDefs() {
        const groups = { 'current-meta': [], 'city-current': [], 'city-past': [] };
        cbSelectedArchetypes.forEach(a => {
            if (groups[a.source]) groups[a.source].push(a.name);
        });

        const defs = [];
        if (groups['current-meta'].length > 0) defs.push({ title: 'Current Meta (Custom)', source: 'current-meta', names: groups['current-meta'] });
        if (groups['city-current'].length > 0) defs.push({ title: 'City League (Custom)', source: 'city-current', names: groups['city-current'] });
        if (groups['city-past'].length > 0) defs.push({ title: 'City League Past (Custom)', source: 'city-past', names: groups['city-past'] });
        return defs;
    }

    // ── Delta with the Custom Binder's OWN baseline ──
    // The old version swapped the 'metaBinderCacheV1' localStorage key
    // around shared.computeDelta — but that key was never read by anything,
    // while computeDelta read AND wrote the Meta Binder's Firestore snapshot.
    // Result: every Custom Binder generation destroyed the Meta Binder's
    // "what's new" baseline (and vice versa). computeDelta is now pure;
    // the CB keeps its baseline (ids + card objects for the dropped-diff)
    // in localStorage, per device.
    async function cbComputeDelta(binderMap, shared) {
        let previous = { ids: new Set(), cards: [], date: null, hasProfile: false };

        // Ist ein Ordner geladen, ist SEIN Schnappschuss der Vergleichspunkt.
        // Vorher gab es genau einen globalen Schluessel customBinderCacheV2 fuer
        // alle Ordner: sobald es zwei gab, ueberschrieben sie gegenseitig ihren
        // "was ist neu"-Bezugspunkt, und ein Wechsel meldete den halben anderen
        // Ordner als neu. Der Vergleichspunkt gehoert zum Ordner, nicht zum Geraet.
        const geladen = cbAktuellerBinder();
        if (geladen && geladen.snapshot && Array.isArray(geladen.snapshot.cards)) {
            const gleicheSchwelle = geladen.threshold === undefined || geladen.threshold === cbThreshold;
            if (gleicheSchwelle) {
                return shared.computeDelta(binderMap, {
                    previous: {
                        ids: new Set(geladen.snapshot.cards.map(c => c.cardId)),
                        cards: geladen.snapshot.cards,
                        date: geladen.snapshot.takenAt || null,
                        hasProfile: true
                    }
                });
            }
        }

        try {
            const cachedV2 = JSON.parse(localStorage.getItem(CB_CACHE_KEY_V2) || 'null');
            // A baseline generated at a DIFFERENT threshold is not comparable:
            // diffing a 70%-binder against an all-cards binder flags hundreds
            // of cards as "new"/"no longer in the meta" that never changed.
            const thresholdMatches = cachedV2
                && (cachedV2.threshold === undefined || cachedV2.threshold === cbThreshold);
            if (cachedV2 && Array.isArray(cachedV2.ids) && thresholdMatches) {
                previous = {
                    ids: new Set(cachedV2.ids),
                    cards: Array.isArray(cachedV2.cards) ? cachedV2.cards : [],
                    date: cachedV2.date || null,
                    hasProfile: true
                };
            } else if (cachedV2 && Array.isArray(cachedV2.ids)) {
                // Threshold changed → no comparison this run; the save below
                // records the new threshold so the NEXT run compares cleanly.
            } else {
                // Legacy v1 cache: ids only (no card objects — dropped
                // entries from it show the raw id until the next save).
                const cachedV1 = JSON.parse(localStorage.getItem(CB_CACHE_KEY) || '[]');
                if (Array.isArray(cachedV1) && cachedV1.length > 0) {
                    previous = { ids: new Set(cachedV1), cards: [], date: null, hasProfile: true };
                }
            }
        } catch (_) { /* ignore */ }

        // Baseline stays stable within the session (repeated Generate
        // clicks diff against the same reference, not against themselves).
        if (_cbSessionBaseline) previous = _cbSessionBaseline;
        else _cbSessionBaseline = previous;

        const delta = await shared.computeDelta(binderMap, { previous });

        try {
            localStorage.setItem(CB_CACHE_KEY_V2, JSON.stringify({
                ids: Array.from(binderMap.keys()),
                // familyRefs included so "Aus Binder laden" (proxy tab)
                // answers "is it printed?" family-wide, same as the grid.
                cards: delta.cards.map(c => ({
                    cardId: c.cardId, name: c.name, set: c.set,
                    number: c.number, maxCount: c.maxCount,
                    familyRefs: Array.isArray(c.familyRefs) ? c.familyRefs : []
                })),
                threshold: cbThreshold,
                date: new Date().toISOString()
            }));
            localStorage.removeItem(CB_CACHE_KEY);
        } catch (_) { /* storage full/blocked — next diff just reuses the old baseline */ }

        return delta;
    }

    // ── Render (mirrors meta-binder renderMetaBinder but targets CB DOM) ──
    function cbRenderBinder(delta, shared) {
        const grid = document.getElementById('cbGrid');
        const statsEl = document.getElementById('cbStats');
        const deltaEl = document.getElementById('cbDelta');
        const filtersEl = document.getElementById('cbFilters');
        if (!grid) return;

        const { cards, droppedCards } = delta;
        window._cbDroppedCards = droppedCards;
        const totalUnique = cards.length;
        const totalCopies = cards.reduce((s, c) => s + c.maxCount, 0);
        const missingUnique = cards.filter(c => c.missing > 0).length;
        const missingCopies = cards.reduce((s, c) => s + c.missing, 0);
        const ownedComplete = cards.filter(c => c.missing === 0).length;
        const newCount = cards.filter(c => c.isNew).length;
        // Die binderspezifischste Zahl ueberhaupt und bisher nirgends zu sehen:
        // wie viele Neunerseiten das Ganze braucht. Sie entscheidet, ob der
        // Ordner reicht. Ein Fach je verschiedener Karte, nicht je Kopie.
        const seiten = Math.ceil(totalUnique / 9);

        // Stats (mode-dependent: ownership vs print status)
        if (statsEl) {
            statsEl.classList.remove('d-none');
            if (cbMode === 'print') {
                cbRenderPrintStats();
            } else {
                statsEl.innerHTML = `
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value">${totalUnique}</span>
                    <span class="meta-binder-stat-label">${cbText('mb.uniqueCards', 'Unique Cards')}</span>
                </div>
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value">${totalCopies}</span>
                    <span class="meta-binder-stat-label">${cbText('mb.totalCopies', 'Total Copies')}</span>
                </div>
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value meta-binder-stat-green">${ownedComplete}</span>
                    <span class="meta-binder-stat-label">${cbText('mb.complete', 'Complete')}</span>
                </div>
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value meta-binder-stat-red">${missingUnique} / ${missingCopies}</span>
                    <span class="meta-binder-stat-label">${cbText('mb.missing', 'Missing (Cards / Copies)')}</span>
                </div>
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value" style="color:#3B4CCA">${newCount}</span>
                    <span class="meta-binder-stat-label">${cbText('mb.newThisWeek', 'New This Week')}</span>
                </div>
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value">${seiten}</span>
                    <span class="meta-binder-stat-label">${cbText('cb.pages', 'Seiten (9er)')}</span>
                </div>`;
            }
        }

        // Archetype groups
        if (deltaEl) {
            const groups = Array.isArray(window._cbArchetypeGroups) ? window._cbArchetypeGroups : [];
            if (groups.length > 0) {
                const html = groups.map(group => {
                    const cardsHtml = group.items.map(item => {
                        const safeName = escapeHtml(item.name || 'Unknown');
                        const safeImage = escapeHtml(item.imageUrl || '');
                        const escapedJsName = shared.escapeArchetypeForJs(item.name || '');
                        const navFn = item.source === 'current-meta' ? 'navigateToCurrentMetaWithDeck' : 'navigateToAnalysisWithDeck';
                        const currentMetaLabel = escapeHtml(item.currentMetaFormatLabel || (typeof window.getCurrentMetaFormat === 'function' && window.getCurrentMetaFormat()) || 'TEF-POR');
                        const rankText = shared.formatMetaBinderMetric(item.currentMetaRank, 1);
                        const shareText = Number.isFinite(item.currentMetaShare) ? `${item.currentMetaShare.toFixed(1)}%` : '—';
                        const cityCurrentText = shared.formatMetaBinderMetric(item.cityCurrentAvgRank, 1);
                        const cityPastText = shared.formatMetaBinderMetric(item.cityPastAvgRank, 1);
                        return `
                            <div class="deck-banner-card" onclick="${navFn}('${escapedJsName}')">
                                ${item.imageUrl ? `<div class="deck-banner-bg" style="background-image: url('${safeImage}')"></div>` : ''}
                                <div class="deck-banner-content">
                                    <div class="deck-banner-name">${safeName}</div>
                                    <div class="deck-banner-stats" style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;">
                                        <span class="stat-badge rank-performance-hint" style="background:var(--tint-warn);color:var(--tint-warn-ink);">${currentMetaLabel}: ${rankText}</span>
                                        <span class="stat-badge">${currentMetaLabel}: ${shareText}</span>
                                        <span class="stat-badge">City current: ${cityCurrentText}</span>
                                        <span class="stat-badge">City past: ${cityPastText}</span>
                                    </div>
                                </div>
                            </div>`;
                    }).join('');

                    return `
                        <div class="meta-binder-archetype-group">
                            <details class="meta-binder-archetype-panel" open>
                                <summary class="meta-binder-archetype-summary">
                                    <h3 class="meta-binder-archetype-title">${escapeHtml(group.title)}</h3>
                                    <span class="meta-binder-archetype-count">${group.items.length}</span>
                                </summary>
                                <div class="meta-binder-archetype-grid">${cardsHtml}</div>
                            </details>
                        </div>`;
                }).join('');
                deltaEl.classList.remove('d-none');
                deltaEl.innerHTML = `<div class="meta-binder-archetype-groups">${html}</div>`;
            } else {
                deltaEl.classList.add('d-none');
                deltaEl.innerHTML = '';
            }
        }

        // Filters — the chip row is the mode's main navigation. In print
        // mode the chips ARE the binder comparison (to print / printed /
        // no longer in the meta) — no extra modal flow needed.
        const droppedCount = Array.isArray(droppedCards) ? droppedCards.length : 0;
        const printedCount = cards.filter(c => cbIsPrinted(c)).length;
        const toPrintCount = totalUnique - printedCount;
        const chipRow = cbMode === 'print'
            ? `
                <div class="filter-group">
                    <button class="meta-binder-filter-btn active" data-filter="all" onclick="cbSetFilter('all')">${cbText('cb.filterAll','All')} (${totalUnique})</button>
                    <button class="meta-binder-filter-btn" data-filter="toprint" onclick="cbSetFilter('toprint')">${cbText('cb.filterToPrint','To print')} (${toPrintCount})</button>
                    <button class="meta-binder-filter-btn" data-filter="printed" onclick="cbSetFilter('printed')">${cbText('cb.filterPrinted','Printed')} ✓ (${printedCount})</button>
                    <button class="meta-binder-filter-btn" data-filter="dropped" onclick="cbOpenDroppedModal()">${cbText('cb.filterDropped','No longer in the meta')} (${droppedCount})</button>
                </div>`
            : `
                <div class="filter-group">
                    <button class="meta-binder-filter-btn active" data-filter="all" onclick="cbSetFilter('all')">${cbText('cb.filterAll','All')} (${totalUnique})</button>
                    <button class="meta-binder-filter-btn" data-filter="owned" onclick="cbSetFilter('owned')">${cbText('cb.filterOwned','In Collection')} (${ownedComplete})</button>
                    <button class="meta-binder-filter-btn" data-filter="missing" onclick="cbSetFilter('missing')">${cbText('cb.filterMissing','Missing')} (${missingUnique})</button>
                    <button class="meta-binder-filter-btn" data-filter="new" onclick="cbSetFilter('new')">🆕 ${cbText('cb.filterNew','New')} (${newCount})</button>
                </div>`;
        if (filtersEl) {
            filtersEl.classList.remove('d-none');
            filtersEl.innerHTML = `${chipRow}
                <div class="filter-group">
                    <select id="cbFilterType" onchange="cbApplyFilter()" class="select-system">
                        <option value="all">${cbText('cb.filterAllTypes','All Types')}</option>
                        <option value="Pokemon-Grass">${cbText('profile.filterPokemonGrass','Pokémon: Grass')}</option>
                        <option value="Pokemon-Fire">${cbText('profile.filterPokemonFire','Pokémon: Fire')}</option>
                        <option value="Pokemon-Water">${cbText('profile.filterPokemonWater','Pokémon: Water')}</option>
                        <option value="Pokemon-Lightning">${cbText('profile.filterPokemonLightning','Pokémon: Lightning')}</option>
                        <option value="Pokemon-Psychic">${cbText('profile.filterPokemonPsychic','Pokémon: Psychic')}</option>
                        <option value="Pokemon-Fighting">${cbText('profile.filterPokemonFighting','Pokémon: Fighting')}</option>
                        <option value="Pokemon-Darkness">${cbText('profile.filterPokemonDarkness','Pokémon: Darkness')}</option>
                        <option value="Pokemon-Metal">${cbText('profile.filterPokemonMetal','Pokémon: Metal')}</option>
                        <option value="Pokemon-Dragon">${cbText('profile.filterPokemonDragon','Pokémon: Dragon')}</option>
                        <option value="Pokemon-Colorless">${cbText('profile.filterPokemonColorless','Pokémon: Colorless')}</option>
                        <option value="Supporter">${cbText('profile.filterSupporter','Supporter')}</option>
                        <option value="Item">${cbText('profile.filterItem','Item')}</option>
                        <option value="Tool">${cbText('profile.filterTool','Tool')}</option>
                        <option value="Stadium">Stadium</option>
                        <option value="Special Energy">${cbText('profile.filterSpecialEnergy','Special Energy')}</option>
                        <option value="Basic Energy">${cbText('profile.filterBasicEnergy','Basic Energy')}</option>
                        <option value="ACE SPEC">ACE SPEC</option>
                    </select>
                    <select id="cbFilterSet" onchange="cbApplyFilter()" class="select-system">
                        <option value="all">${cbText('cb.filterAllSets','All Sets')}</option>
                    </select>
                </div>
                <div class="filter-group">
                    <input type="search" id="cbFilterName" class="input-system cb-filter-name" oninput="cbApplyFilter()"
                        placeholder="${escapeHtmlAttr(cbText('cb.filterName','Kartenname suchen'))}"
                        aria-label="${escapeHtmlAttr(cbText('cb.filterName','Kartenname suchen'))}">
                    <select id="cbFilterDecks" onchange="cbApplyFilter()" class="select-system" aria-label="${escapeHtmlAttr(cbText('cb.filterDecks','Wie viele Decks'))}">
                        <option value="0">${cbText('cb.decksAny','Decks: alle')}</option>
                        <option value="2">${cbText('cb.decks2','ab 2 Decks')}</option>
                        <option value="3">${cbText('cb.decks3','ab 3 Decks')}</option>
                        <option value="5">${cbText('cb.decks5','ab 5 Decks')}</option>
                    </select>
                    <select id="cbFilterMissing" onchange="cbApplyFilter()" class="select-system" aria-label="${escapeHtmlAttr(cbText('cb.filterMissingAria','Fehlmenge'))}">
                        <option value="all">${cbText('cb.missingAny','Fehlmenge: egal')}</option>
                        <option value="ab1">${cbText('cb.missing1','fehlt mindestens 1')}</option>
                        <option value="ab2">${cbText('cb.missing2','fehlen mindestens 2')}</option>
                        <option value="voll">${cbText('cb.missingFull','fehlt komplett')}</option>
                    </select>
                    <select id="cbSortOrder" onchange="cbSetSort(this.value)" class="select-system" aria-label="${escapeHtmlAttr(cbText('cb.sortLabel','Sortierung'))}">
                        <option value="binder">${cbText('cb.sortBinder','Ordner-Reihenfolge')}</option>
                        <option value="set">${cbText('cb.sortSet','Set (neu → alt)')}</option>
                        <option value="typ">${cbText('cb.sortType','Kartenart')}</option>
                        <option value="decks">${cbText('cb.sortDecks','Meiste Decks zuerst')}</option>
                        <option value="fehlend">${cbText('cb.sortMissing','Fehlende zuerst')}</option>
                        <option value="name">${cbText('cb.sortName','Name A–Z')}</option>
                    </select>
                </div>
                <div class="filter-group">
                    <button id="cbBtnStandardPrint" class="meta-binder-filter-btn active" onclick="cbSetPrintView(false)">${cbText('mb.standardPrint','Standard Print')}</button>
                    <button id="cbBtnAllPrints" class="meta-binder-filter-btn" onclick="cbSetPrintView(true)">${cbText('mb.allPrints','All Prints')}</button>
                </div>`;

            // Populate set filter
            cbUpdateSetFilter(cards);
            // Die Sortierung ueberlebt den Neuaufbau der Filterzeile — sonst
            // muesste man sie nach jedem Generieren neu einstellen.
            const sortEl = document.getElementById('cbSortOrder');
            if (sortEl) sortEl.value = cbSort;
        }

        // Enable action buttons
        const wishlistBtn = document.getElementById('cbAddWishlist');
        const proxyBtn = document.getElementById('cbSendProxy');
        if (wishlistBtn) wishlistBtn.disabled = missingCopies === 0;
        if (proxyBtn) proxyBtn.disabled = missingCopies === 0;
        const unprintedBtn = document.getElementById('cbSendUnprinted');
        const bulkBtn = document.getElementById('cbBulkMarkPrinted');
        if (unprintedBtn) unprintedBtn.disabled = false;
        if (bulkBtn) bulkBtn.disabled = false;
        cbUpdateActionButtons();

        cbFilter = 'all';
        cbRenderGrid(delta, shared);
    }

    // Print-mode stats: printed vs to-print, copies included.
    function cbRenderPrintStats() {
        if (cbMode !== 'print') return;
        const statsEl = document.getElementById('cbStats');
        const delta = window._cbDelta;
        if (!statsEl || !delta || !Array.isArray(delta.cards)) return;
        const cards = delta.cards;
        const printed = cards.filter(c => cbIsPrinted(c));
        const printedCopies = printed.reduce((s, c) => s + (c.maxCount || 0), 0);
        const totalCopies = cards.reduce((s, c) => s + (c.maxCount || 0), 0);
        statsEl.innerHTML = `
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value">${cards.length}</span>
                    <span class="meta-binder-stat-label">${cbText('mb.uniqueCards', 'Unique Cards')}</span>
                </div>
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value">${totalCopies}</span>
                    <span class="meta-binder-stat-label">${cbText('mb.totalCopies', 'Total Copies')}</span>
                </div>
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value meta-binder-stat-green">${printed.length}</span>
                    <span class="meta-binder-stat-label">${cbText('cb.statPrinted', 'Printed')}</span>
                </div>
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value meta-binder-stat-red">${cards.length - printed.length} / ${totalCopies - printedCopies}</span>
                    <span class="meta-binder-stat-label">${cbText('cb.statToPrint', 'To print (Cards / Copies)')}</span>
                </div>`;
    }

    function cbUpdateSetFilter(cards) {
        const setSelect = document.getElementById('cbFilterSet');
        if (!setSelect) return;

        const setOrderMap = window.setOrderMap || {};
        const setCodes = [...new Set(cards.map(c => String(c.set || '').trim()).filter(Boolean))]
            .sort((a, b) => {
                const orderA = setOrderMap[a] || setOrderMap[a.toLowerCase()] || 0;
                const orderB = setOrderMap[b] || setOrderMap[b.toLowerCase()] || 0;
                if (orderA !== orderB) return orderB - orderA;
                return a.localeCompare(b);
            });

        setSelect.innerHTML = [
            `<option value="all">${cbText('cb.filterAllSets','All Sets')}</option>`,
            ...setCodes.map(code => `<option value="${escapeHtml(code)}">${escapeHtml(code)}</option>`)
        ].join('');
    }

    function cbSetFilter(filter) {
        cbFilter = filter;
        const filtersEl = document.getElementById('cbFilters');
        if (filtersEl) {
            filtersEl.querySelectorAll('.meta-binder-filter-btn').forEach(btn => {
                // Buttons without data-filter (Standard Print / All Prints)
                // carry independent state — never strip their highlight.
                if (!btn.dataset.filter) return;
                btn.classList.toggle('active', btn.dataset.filter === filter);
            });
        }
        cbApplyFilter();
    }

    function cbSetPrintView(showAll) {
        cbAllPrints = showAll;
        const btnStd = document.getElementById('cbBtnStandardPrint');
        const btnAll = document.getElementById('cbBtnAllPrints');
        if (btnStd) btnStd.classList.toggle('active', !showAll);
        if (btnAll) btnAll.classList.toggle('active', showAll);
        cbApplyFilter();
    }

    function cbApplyFilter() {
        const delta = window._cbDelta;
        if (!delta) return;
        cbRenderGrid(delta, mb());
    }

    // The filtered list BEFORE the All-Prints expansion — bulk actions
    // must run on this (the expansion invents per-print ids that don't
    // exist as binder entries).
    function cbComputeFilteredCards() {
        const delta = window._cbDelta;
        const shared = mb();
        if (!delta || !Array.isArray(delta.cards)) return [];
        const cards = delta.cards;
        const typeFilterEl = document.getElementById('cbFilterType');
        const setFilterEl = document.getElementById('cbFilterSet');
        const typeFilter = typeFilterEl ? String(typeFilterEl.value || 'all') : 'all';
        const setFilter = setFilterEl ? String(setFilterEl.value || 'all').toLowerCase() : 'all';

        let filtered;
        if (cbFilter === 'new') {
            filtered = cards.filter(c => c.isNew);
        } else if (cbFilter === 'missing') {
            filtered = cards.filter(c => c.missing > 0);
        } else if (cbFilter === 'owned') {
            filtered = cards.filter(c => c.missing === 0);
        } else if (cbFilter === 'toprint') {
            filtered = cards.filter(c => !cbIsPrinted(c));
        } else if (cbFilter === 'printed') {
            filtered = cards.filter(c => cbIsPrinted(c));
        } else {
            filtered = cards;
        }

        // Zusaetzliche, stapelbare Filter. Sie greifen ZUSAMMEN mit den Chips
        // oben, nicht statt ihrer — die eine Frage, die man bei 500 Karten
        // wirklich stellt, ist zusammengesetzt ("fehlt mir UND in >= 3 Decks").
        const suchEl = document.getElementById('cbFilterName');
        const deckEl = document.getElementById('cbFilterDecks');
        const fehltEl = document.getElementById('cbFilterMissing');
        const suche = suchEl ? String(suchEl.value || '').trim().toLowerCase() : '';
        const minDecks = deckEl ? (parseInt(deckEl.value, 10) || 0) : 0;
        const minFehlt = fehltEl ? String(fehltEl.value || 'all') : 'all';

        return filtered.filter(card => {
            const meta = shared.getMetaBinderTypeMeta(card);
            const cardSet = String(card.set || '').toLowerCase();
            if (typeFilter !== 'all' && meta.type !== typeFilter) return false;
            if (setFilter !== 'all' && cardSet !== setFilter) return false;
            if (minDecks > 0 && (card.decks ? card.decks.length : 0) < minDecks) return false;
            if (minFehlt === 'ab1' && !(card.missing >= 1)) return false;
            if (minFehlt === 'ab2' && !(card.missing >= 2)) return false;
            if (minFehlt === 'voll' && !(card.missing >= card.maxCount)) return false;
            if (suche) {
                const rec = shared.findCardRecord ? shared.findCardRecord(card.name, card.set, card.number) : null;
                const treffer = String(card.name || '').toLowerCase().includes(suche)
                    || (rec && String(rec.name_de || '').toLowerCase().includes(suche));
                if (!treffer) return false;
            }
            // Print mode: basic energies are hidden by default — nobody
            // proxies them, and 8 energy tiles are pure noise in a print
            // list. Explicitly selecting the type filter still shows them.
            if (cbMode === 'print' && typeFilter === 'all' && meta.type === 'Basic Energy') return false;
            return true;
        });
    }

    function cbRenderGrid(delta, shared) {
        const grid = document.getElementById('cbGrid');
        if (!grid) return;

        let filtered = cbComputeFilteredCards();

        // All Prints expansion
        if (cbAllPrints) {
            const collectionCounts = window.userCollectionCounts || new Map();
            const expanded = [];
            filtered.forEach(card => {
                const refs = Array.isArray(card.familyRefs) ? card.familyRefs : [];
                if (refs.length <= 1) { expanded.push(card); return; }
                refs.forEach(ref => {
                    const parsed = shared.parseIntlPrintRef(ref);
                    if (!parsed.set || !parsed.number) return;
                    const printCardId = shared.buildCardId(card.name, parsed.set, parsed.number);
                    const ownedExact = collectionCounts.get(printCardId) || 0;
                    expanded.push({
                        ...card,
                        set: parsed.set, number: parsed.number,
                        cardId: printCardId, ownedExact, owned: ownedExact,
                        ownedIntlTotal: ownedExact,
                        missing: Math.max(0, card.maxCount - ownedExact),
                        ownershipMode: ownedExact >= card.maxCount ? 'exact' : 'missing',
                        familyRefs: refs, _isPrintExpansion: true
                    });
                });
            });
            filtered = expanded;
        }

        const sorted = cbSortiere([...filtered], shared);

        if (sorted.length === 0) {
            // "Everything printed" is success, not an error-looking empty state.
            grid.innerHTML = (cbMode === 'print' && cbFilter === 'toprint')
                ? `<p class="cb-all-printed">✓ ${cbText('cb.allPrinted', 'Everything printed — your binder is complete.')}</p>`
                : `<p class="color-grey">${cbText('mb.empty', 'No cards found for current filter.')}</p>`;
            return;
        }

        const isPrintMode = cbMode === 'print';
        const cardHtmlEntries = sorted.map(card => {
            const imageUrl = shared.findCardImage(card.name, card.set, card.number);
            // Print mode: the frame colour means PRINT status, never
            // ownership — one axis at a time, so green stays unambiguous.
            const isPrinted = isPrintMode && cbIsPrinted(card);
            const statusClass = isPrintMode
                ? (isPrinted ? 'meta-binder-card-printed' : 'meta-binder-card-toprint')
                : (card.ownershipMode === 'exact'
                    ? 'meta-binder-card-owned card-owned'
                    : (card.ownershipMode === 'intl-complete'
                        ? 'meta-binder-card-owned-intl card-owned'
                        : 'meta-binder-card-missing card-missing'));
            const newBadge = card.isNew ? `<span class="meta-binder-badge-new">NEW</span>` : '';
            const safeImage = escapeHtml(imageUrl);
            const safeName = escapeHtml(card.name);
            const deckList = card.decks.map(d => escapeHtml(d)).join(', ');
            const typeMeta = shared.getMetaBinderTypeMeta(card);
            const cardDb = shared.findCardRecord(card.name, card.set, card.number);
            const sortCategory = shared.getMetaBinderSortCategory(typeMeta);
            const dexNumber = sortCategory === 'Pokemon' ? shared.getMetaBinderPokemonDex(card, cardDb) : Number.MAX_SAFE_INTEGER;
            const setOrder = shared.getMetaBinderSetOrderValue(card.set);
            const numberSort = shared.parseCardNumberForSort(card.number);
            const countLabel = card.ownershipMode === 'exact'
                ? `<span class="meta-binder-count-ok">${card.ownedExact}/${card.maxCount} ✓</span>`
                : (card.ownershipMode === 'intl-complete'
                    ? `<span class="meta-binder-count-intl">${card.ownedIntlTotal}/${card.maxCount} ✓</span>`
                    : `<span class="meta-binder-count-missing">${card.ownedIntlTotal}/${card.maxCount}</span>`);

            const safeCardId = escapeHtml(card.cardId);
            const ownedCount = card.ownedExact || 0;
            const userWantsCard = window.userWishlist && window.userWishlist.has(card.cardId);
            const missingCount = Math.max(0, card.maxCount - ownedCount);

            // Print mode: no collection +/-/wishlist micro-badges (other
            // axis, and 21px targets), instead a full-width 44px toggle
            // bar under the image. Ownership only as a grey side note.
            const topActions = isPrintMode ? '' : `
                    <div class="pos-abs card-action-row-wide card-database-top-actions">
                        <button type="button" data-card-id="${safeCardId}" onclick="addCollectionFromCardDbButton(this)" class="btn-green card-badge" title="Add to collection (${ownedCount}/4)" aria-label="Add ${safeName} to collection">+</button>
                        <button type="button" data-card-id="${safeCardId}" onclick="removeCollectionFromCardDbButton(this)" class="btn-red card-badge" style="color: ${ownedCount > 0 ? '#fff' : '#999'}; background: ${ownedCount > 0 ? '#dc3545' : '#fff'};" title="Remove from collection (${ownedCount}/4)" aria-label="Remove ${safeName} from collection">-</button>
                        <button type="button" data-card-id="${safeCardId}" data-missing="${String(missingCount)}" onclick="toggleWishlistMetaBinder(this)" class="btn-wishlist card-badge" style="color: #fff; background: ${userWantsCard ? '#E91E63' : '#F48FB1'}; border: 2px solid ${userWantsCard ? '#E91E63' : '#F48FB1'};" title="${userWantsCard ? 'Remove from wishlist' : 'Add missing (' + missingCount + ') to wishlist'}" aria-label="${userWantsCard ? 'Remove' : 'Add'} ${safeName} wishlist">${userWantsCard ? '&#9829;' : '&#9825;'}</button>
                    </div>`;
            const infoBlock = isPrintMode ? `
                    <div class="meta-binder-card-info">
                        ${newBadge}
                        <span class="meta-binder-card-need">${card.maxCount}x</span>
                        <div class="deck-indicator-count">${card.decks.length} Decks</div>
                        <span class="cb-owned-line">${card.ownedIntlTotal || 0} ${cbText('cb.ownedLine', 'in collection')}</span>
                    </div>
                    <button type="button" class="cb-print-toggle ${isPrinted ? 'is-printed' : ''}" onclick="cbTogglePrintedBtn(this)" aria-pressed="${isPrinted ? 'true' : 'false'}" aria-label="${isPrinted ? cbText('cb.ariaUnmarkPrinted', 'Mark as not printed') : cbText('cb.ariaMarkPrinted', 'Mark as printed')}: ${safeName}">
                        ${isPrinted ? `${cbText('cb.printedBadge', 'Printed')} ✓` : cbText('cb.toPrintBadge', 'To print')}
                    </button>` : `
                    <div class="meta-binder-card-info">
                        ${newBadge}
                        <span class="meta-binder-card-need">${card.maxCount}x</span>
                        <div class="deck-indicator-count">${card.decks.length} Decks</div>
                        ${countLabel}
                    </div>`;

            return { name: card.name, html: `
                <div class="meta-binder-card ${statusClass}" data-type="${escapeHtml(typeMeta.type)}" data-set="${escapeHtml(String(card.set || ''))}" data-supertype="${escapeHtml(typeMeta.supertype)}" data-is-ace-spec="${typeMeta.isAceSpec ? 'true' : 'false'}" data-name="${safeName}" data-pokedex="${String(dexNumber)}" data-set-order="${String(setOrder)}" data-number-sort="${String(numberSort)}" data-card-id="${safeCardId}" data-family-refs="${escapeHtml((Array.isArray(card.familyRefs) ? card.familyRefs : []).join(','))}" data-max-count="${String(card.maxCount || 0)}" title="Decks: ${deckList}">
                    ${imageUrl
                        ? `<img src="${safeImage}" alt="${safeName}" class="meta-binder-card-img" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                           <div class="meta-binder-card-fallback" style="display:none">${safeName}</div>`
                        : `<div class="meta-binder-card-fallback">${safeName}<br><small>${escapeHtml(card.set)} ${escapeHtml(card.number)}</small></div>`}${topActions}${infoBlock}
                </div>` };
        });

        // In All Prints mode: group same-name cards into horizontal rows
        if (cbAllPrints) {
            const groups = [];
            let currentGroup = null;
            cardHtmlEntries.forEach(entry => {
                if (!currentGroup || currentGroup.name !== entry.name) {
                    currentGroup = { name: entry.name, cards: [] };
                    groups.push(currentGroup);
                }
                currentGroup.cards.push(entry.html);
            });
            grid.innerHTML = '<style>.cb-print-group{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;margin-bottom:16px;padding:10px;background:rgba(0,0,0,0.03);border-radius:10px;border:1px solid rgba(0,0,0,0.06)}.cb-print-group .meta-binder-card{margin:0;width:110px;flex:0 0 110px}@media(min-width:600px){.cb-print-group .meta-binder-card{width:130px;flex:0 0 130px}}</style>'
                + groups.map(g => g.cards.length > 1
                    ? `<div class="cb-print-group">${g.cards.join('')}</div>`
                    : g.cards[0]
                ).join('');
        } else {
            grid.innerHTML = cardHtmlEntries.map(e => e.html).join('');
        }
        refreshCustomBinderOwnership();
    }

    // ── Print status: load / persist / query / toggle ──
    async function cbLoadPrintedSet() {
        const uid = window.auth?.currentUser?.uid ?? null;
        // The cached set belongs to ONE account. Sign-out/sign-in without a
        // reload must not leak user A's printed list into user B's doc.
        if (_cbPrintedSet && _cbPrintedOwner !== uid) {
            _cbPrintedSet = null;
            _cbPrintedLoadPromise = null;
            _cbPrintedRemoteOk = false;
        }
        if (_cbPrintedSet) return _cbPrintedSet;
        if (_cbPrintedLoadPromise) return _cbPrintedLoadPromise;
        _cbPrintedLoadPromise = (async () => {
            let entries = null;
            _cbPrintedRemoteOk = false;
            if (uid && window.db) {
                try {
                    const doc = await window.db.collection('users').doc(uid)
                        .collection('binders').doc('printedProxies').get();
                    // The read SUCCEEDED — remote is authoritative from here,
                    // whether or not the doc exists yet. Merging in the local
                    // mirror could resurrect un-marked cards from a stale
                    // mirror on another device.
                    _cbPrintedRemoteOk = true;
                    if (doc.exists) {
                        const data = doc.data() || {};
                        entries = Array.isArray(data.entries) ? data.entries : [];
                    } else {
                        entries = [];
                    }
                } catch (e) {
                    // Read FAILED: fall back to the mirror for display, but
                    // cbPersistPrintedSet refuses the Firestore write in this
                    // state — a full-doc set() based on a possibly-empty
                    // mirror would wipe the server's good data.
                    console.warn('[CustomBinder] printed-status load failed — read-only fallback to local mirror', e);
                }
            }
            if (entries === null) {
                try { entries = JSON.parse(localStorage.getItem(CB_PRINTED_LS_KEY) || '[]'); }
                catch (_) { entries = []; }
            }
            _cbPrintedSet = new Set((entries || [])
                .map(e => (typeof e === 'string' ? e : (e && e.cardId)))
                .filter(Boolean));
            _cbPrintedOwner = uid;
            return _cbPrintedSet;
        })().finally(() => { _cbPrintedLoadPromise = null; });
        return _cbPrintedLoadPromise;
    }

    function cbPersistPrintedSet() {
        const arr = Array.from(_cbPrintedSet || []);
        try { localStorage.setItem(CB_PRINTED_LS_KEY, JSON.stringify(arr)); } catch (_) { /* mirror only */ }
        const uid = window.auth?.currentUser?.uid ?? null;
        if (!uid || !window.db) return;
        if (uid !== _cbPrintedOwner) {
            // Account changed underneath us — never write one user's list
            // into another user's document.
            console.warn('[CustomBinder] printed-status save skipped: account changed');
            return;
        }
        if (!_cbPrintedRemoteOk) {
            // The remote read never succeeded this session: a full-doc set()
            // would overwrite good server data with the local fallback.
            if (typeof showToast === 'function') {
                showToast(cbText('cb.printedSyncOffline', 'Print status saved on this device only — cloud sync is currently unavailable.'), 'warning');
            }
            return;
        }
        _cbPrintedDirty = true;
        clearTimeout(_cbPrintedSaveTimer);
        _cbPrintedSaveTimer = setTimeout(() => cbFlushPrintedSet(uid), 800);
    }

    function cbFlushPrintedSet(uid) {
        if (!_cbPrintedDirty || !_cbPrintedSet) return;
        const targetUid = uid || (window.auth?.currentUser?.uid ?? null);
        if (!targetUid || !window.db || targetUid !== _cbPrintedOwner || !_cbPrintedRemoteOk) return;
        _cbPrintedDirty = false;
        clearTimeout(_cbPrintedSaveTimer);
        window.db.collection('users').doc(targetUid)
            .collection('binders').doc('printedProxies')
            .set({ entries: Array.from(_cbPrintedSet), updatedAt: new Date().toISOString() })
            .catch(e => {
                _cbPrintedDirty = true;
                console.warn('[CustomBinder] printed-status save failed (kept in local mirror)', e);
            });
    }

    // Flush the debounced write before the page goes away — marking the
    // last card and closing the tab inside the 800ms window must not
    // silently revert on the next load (the remote doc wins over the mirror).
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') cbFlushPrintedSet();
        });
        window.addEventListener('pagehide', () => cbFlushPrintedSet());
    }

    // Family-aware: a proxy printed as any print of the card counts —
    // it is the same piece of paper in the box.
    function cbPrintedIdsForCard(card) {
        const shared = mb();
        const ids = [String(card.cardId || '')];
        const refs = Array.isArray(card.familyRefs) ? card.familyRefs : [];
        refs.forEach(ref => {
            const p = typeof shared.parseIntlPrintRef === 'function' ? shared.parseIntlPrintRef(ref) : null;
            if (p && p.set && p.number && typeof shared.buildCardId === 'function') {
                ids.push(shared.buildCardId(card.name, p.set, p.number));
            }
        });
        return ids.filter(Boolean);
    }

    function cbIsPrinted(card) {
        if (!_cbPrintedSet) return false;
        return cbPrintedIdsForCard(card).some(id => _cbPrintedSet.has(id));
    }

    function cbTogglePrintedBtn(btn) {
        const cardEl = btn.closest('.meta-binder-card');
        if (!cardEl || !_cbPrintedSet) return;
        const cardId = cardEl.getAttribute('data-card-id') || '';
        const name = cardEl.getAttribute('data-name') || '';
        const familyRefs = (cardEl.getAttribute('data-family-refs') || '').split(',').filter(Boolean);
        const card = { cardId, name, familyRefs };
        if (cbIsPrinted(card)) {
            cbPrintedIdsForCard(card).forEach(id => _cbPrintedSet.delete(id));
        } else {
            _cbPrintedSet.add(cardId);
        }
        cbPersistPrintedSet();
        // Grid frames + stats + chip counts all show the same numbers.
        cbApplyFilter();
        cbRenderPrintStats();
        cbUpdatePrintChipCounts();
    }

    // The chips live in #cbFilters, which only cbRenderBinder rewrites —
    // and calling that resets cbFilter to 'all'. Patch the counts in place
    // instead so toggling cards doesn't leave "Noch drucken (40)" next to
    // a stats block saying 0.
    function cbUpdatePrintChipCounts() {
        if (cbMode !== 'print') return;
        const delta = window._cbDelta;
        const filtersEl = document.getElementById('cbFilters');
        if (!delta || !Array.isArray(delta.cards) || !filtersEl) return;
        const printedCount = delta.cards.filter(c => cbIsPrinted(c)).length;
        const toPrint = filtersEl.querySelector('[data-filter="toprint"]');
        const printed = filtersEl.querySelector('[data-filter="printed"]');
        if (toPrint) toPrint.textContent = `${cbText('cb.filterToPrint', 'To print')} (${delta.cards.length - printedCount})`;
        if (printed) printed.textContent = `${cbText('cb.filterPrinted', 'Printed')} ✓ (${printedCount})`;
    }

    // ── Mode & threshold ──
    function cbSetMode(mode) {
        const next = mode === 'print' ? 'print' : 'collection';
        if (next === cbMode) return;
        cbMode = next;
        const btnColl = document.getElementById('cbModeCollection');
        const btnPrint = document.getElementById('cbModePrint');
        if (btnColl) btnColl.classList.toggle('active', cbMode === 'collection');
        if (btnPrint) btnPrint.classList.toggle('active', cbMode === 'print');
        cbUpdateActionButtons();
        const rerender = () => {
            const delta = window._cbDelta;
            if (delta) cbRenderBinder(delta, mb());
        };
        if (cbMode === 'print') { cbLoadPrintedSet().then(rerender); } else { rerender(); }
    }

    function cbSetThreshold(value) {
        const v = Number(value);
        const changed = ((v === 0 || v === 30) ? v : 70) !== cbThreshold;
        cbThreshold = (v === 0 || v === 30) ? v : 70;
        try { localStorage.setItem(CB_THRESHOLD_KEY, String(cbThreshold)); } catch (_) { /* ignore */ }
        document.querySelectorAll('#cbThresholdSegment .cb-seg-btn').forEach(btn => {
            btn.classList.toggle('active', Number(btn.dataset.threshold) === cbThreshold);
        });
        // A binder is already on screen: tapping the segment must change it,
        // not silently wait for another Generate press.
        if (changed && window._cbDelta && cbSelectedArchetypes.length > 0) {
            buildCustomBinder();
        }
    }

    function cbLoadThreshold() {
        try {
            const v = Number(localStorage.getItem(CB_THRESHOLD_KEY));
            if (v === 0 || v === 30 || v === 70) cbThreshold = v;
        } catch (_) { /* ignore */ }
    }

    function cbUpdateActionButtons() {
        const isPrint = cbMode === 'print';
        const toggleEl = (id, show) => {
            const el = document.getElementById(id);
            if (el) el.classList.toggle('d-none', !show);
        };
        toggleEl('cbAddWishlist', !isPrint);
        toggleEl('cbSendProxy', !isPrint);
        toggleEl('cbSendUnprinted', isPrint);
        toggleEl('cbBulkMarkPrinted', isPrint);
    }

    // ── Print-mode quick actions ──
    function cbUnprintedCards() {
        const delta = window._cbDelta;
        if (!delta || !Array.isArray(delta.cards)) return [];
        return delta.cards.filter(c => !cbIsPrinted(c));
    }

    async function cbSendUnprintedToProxy() {
        // The printed set may still be loading right after a mode switch —
        // without this await every card counts as unprinted and the whole
        // binder floods the queue.
        await cbLoadPrintedSet();
        const unprinted = cbUnprintedCards();
        if (unprinted.length === 0) {
            if (typeof showToast === 'function') showToast(cbText('cb.allPrinted', 'Everything printed — your binder is complete.'), 'info');
            return;
        }
        let copies = 0;
        unprinted.forEach(card => {
            if (typeof addCardToProxy === 'function') {
                addCardToProxy(card.name, card.set, card.number, card.maxCount, true);
                copies += card.maxCount;
            }
        });
        if (typeof renderProxyQueue === 'function') renderProxyQueue();
        if (typeof showToast === 'function') {
            showToast(cbText('cb.unprintedSent', '{n} proxies added to the print list (Proxy Printer tab). Note: the print list is per device — on another device, use "Load from binder" there.').replace('{n}', String(copies)), 'success');
        }
    }

    function cbMarkFilteredPrinted() {
        if (!_cbPrintedSet) return;
        // Uses the PRE-expansion filtered list: the All-Prints expansion
        // creates per-print ids that don't exist as binder entries.
        const filtered = cbComputeFilteredCards();
        const toMark = filtered.filter(c => !cbIsPrinted(c));
        if (toMark.length === 0) {
            if (typeof showToast === 'function') showToast(cbText('cb.nothingToMark', 'All shown cards are already marked as printed.'), 'info');
            return;
        }
        const msg = cbText('cb.bulkMarkConfirm', 'Mark {n} shown cards as printed?').replace('{n}', String(toMark.length));
        if (!window.confirm(msg)) return;
        toMark.forEach(c => _cbPrintedSet.add(c.cardId));
        cbPersistPrintedSet();
        cbApplyFilter();
        cbRenderPrintStats();
        cbUpdatePrintChipCounts();
        if (typeof showToast === 'function') showToast(cbText('cb.bulkMarked', '{n} cards marked as printed.').replace('{n}', String(toMark.length)), 'success');
    }

    // ── "Top 10 of the meta" one-tap selection ──
    async function cbAddTopMetaArchetypes() {
        const shared = mb();
        if (typeof shared.getTopCurrentMetaArchetypes !== 'function') return;
        try {
            await shared.ensureMetaDataLoaded();
            const names = await shared.getTopCurrentMetaArchetypes(10);
            if (!Array.isArray(names) || names.length === 0) {
                if (typeof showToast === 'function') showToast(cbText('mb.noData', 'No meta data loaded yet.'), 'warning');
                return;
            }
            names.forEach(n => cbAddArchetype(n, 'current-meta'));
        } catch (e) {
            console.warn('[CustomBinder] top-meta selection failed', e);
        }
    }

    // ── Proxy-tab entry: load unprinted binder cards into the queue ──
    // Works from the SAVED binder (localStorage cache), so the user can
    // fill the queue on the PC without re-generating first.
    async function cbLoadBinderIntoProxy() {
        let cached = null;
        try { cached = JSON.parse(localStorage.getItem(CB_CACHE_KEY_V2) || 'null'); } catch (_) { /* ignore */ }
        const cards = cached && Array.isArray(cached.cards) ? cached.cards : [];
        if (cards.length === 0) {
            if (typeof showToast === 'function') showToast(cbText('cb.noBinderSaved', 'No saved binder on this device — generate one under Profile → Custom Binder first.'), 'warning');
            return;
        }
        await cbLoadPrintedSet();
        const unprinted = cards.filter(c => !cbIsPrinted(c));
        if (unprinted.length === 0) {
            if (typeof showToast === 'function') showToast(cbText('cb.allPrinted', 'Everything printed — your binder is complete.'), 'info');
            return;
        }
        let copies = 0;
        unprinted.forEach(card => {
            if (typeof addCardToProxy === 'function') {
                addCardToProxy(card.name, card.set, card.number, card.maxCount || 1, true);
                copies += card.maxCount || 1;
            }
        });
        if (typeof renderProxyQueue === 'function') renderProxyQueue();
        if (typeof showToast === 'function') {
            showToast(cbText('cb.binderProxyLoaded', '{n} unprinted proxies loaded from your binder.').replace('{n}', String(copies)), 'success');
        }
    }

    // ── Dropped-cards modal (print mode "no longer in the meta") ──
    // One renderer for both binders: the Meta Binder modal takes an
    // override list, so this stays a two-liner instead of a drifting copy.
    function cbOpenDroppedModal() {
        if (typeof window.openMetaBinderDroppedModal !== 'function') return;
        window.openMetaBinderDroppedModal(Array.isArray(window._cbDroppedCards) ? window._cbDroppedCards : []);
    }

    // ── Quick Actions ──
    function cbAddMissingToWishlist() {
        const delta = window._cbDelta;
        if (!delta || !delta.cards) return;

        if (!window.auth?.currentUser) {
            if (typeof showToast === 'function') showToast(cbText('cb.signInRequired','Please sign in to use this feature.'), 'warning');
            return;
        }

        const missingCards = delta.cards.filter(c => c.missing > 0);
        if (missingCards.length === 0) {
            if (typeof showToast === 'function') showToast(cbText('cb.nothingMissing','All cards are already in your collection!'), 'info');
            return;
        }

        let added = 0;
        missingCards.forEach(card => {
            if (!window.userWishlist || !window.userWishlist.has(card.cardId)) {
                if (typeof addToWishlist === 'function') {
                    addToWishlist(card.cardId);
                    added++;
                }
            }
        });

        if (typeof showToast === 'function') showToast(cbText('cb.wishlistDone','{n} cards added to wishlist.').replace('{n}', added), 'success');
    }

    function cbSendMissingToProxy() {
        const delta = window._cbDelta;
        if (!delta || !delta.cards) return;

        const missingCards = delta.cards.filter(c => c.missing > 0);
        if (missingCards.length === 0) {
            if (typeof showToast === 'function') showToast(cbText('cb.nothingMissing','All cards are already in your collection!'), 'info');
            return;
        }

        let totalAdded = 0;
        missingCards.forEach(card => {
            if (typeof addCardToProxy === 'function') {
                addCardToProxy(card.name, card.set, card.number, card.missing, true);
                totalAdded += card.missing;
            }
        });

        if (typeof renderProxyQueue === 'function') renderProxyQueue();
        if (typeof showToast === 'function') showToast(cbText('cb.proxyDone','{n} cards sent to Proxy Printer.').replace('{n}', totalAdded), 'success');
    }

    // ── Init: Load previous selections ──
    cbLoadSelections();
    cbLoadPresets();
    cbLoadThreshold();
    // Defer chip rendering until DOM is ready
    function _cbInitDom() {
        cbRenderChips();
        cbRenderPresetBar();
        cbUpdateActionButtons();
        cbSetThreshold(cbThreshold); // paint the persisted segment state
        // Ordnerliste nachziehen: sie ist der Einstieg in den Tab. Bewusst
        // ohne await — die Liste erscheint, sobald sie da ist, und blockiert
        // den Rest der Oberflaeche nicht.
        cbLadeBinderListe().then(cbRenderBinderBar).catch(() => cbRenderBinderBar());
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _cbInitDom);
    } else {
        _cbInitDom();
    }

    // ── Ownership Refresh (analog to refreshMetaBinderOwnership) ──
    function refreshCustomBinderOwnership() {
        // Print mode renders print-status frames and no ownership badges —
        // rewriting classes here would repaint the grid in the wrong axis.
        if (cbMode === 'print') return;
        const grid = document.getElementById('cbGrid');
        if (!grid) return;
        const t = window.userCollectionCounts || new Map();
        grid.querySelectorAll('.meta-binder-card[data-card-id]').forEach(e => {
            const n = e.getAttribute('data-card-id');
            if (!n) return;
            const needEl = e.querySelector('.meta-binder-card-need');
            const a = needEl && parseInt(needEl.textContent, 10) || 1;
            const i = t.get(n) || 0;
            const s = e.getAttribute('data-family-refs') || '';
            const o = e.getAttribute('data-name') || '';
            let c = 0;
            if (s && o) {
                s.split(',').forEach(ref => {
                    const pos = ref.indexOf('-');
                    if (pos < 0) return;
                    const set = ref.substring(0, pos).trim();
                    const num = ref.substring(pos + 1).trim();
                    c += t.get(o + '|' + set + '|' + num) || 0;
                });
            } else {
                c = i;
            }
            const l = i >= a, d = !l && c >= a, u = !l && !d;
            e.classList.toggle('meta-binder-card-owned', l);
            e.classList.toggle('card-owned', l || d);
            e.classList.toggle('meta-binder-card-owned-intl', d);
            e.classList.toggle('meta-binder-card-missing', u);
            e.classList.toggle('card-missing', u);
            const m = e.querySelector('.meta-binder-count-ok') ||
                      e.querySelector('.meta-binder-count-intl') ||
                      e.querySelector('.meta-binder-count-missing');
            if (m) {
                if (l) { m.className = 'meta-binder-count-ok'; m.textContent = i + '/' + a + ' \u2713'; }
                else if (d) { m.className = 'meta-binder-count-intl'; m.textContent = c + '/' + a + ' \u2713'; }
                else { m.className = 'meta-binder-count-missing'; m.textContent = i + '/' + a; }
            }
            const y = e.querySelector('.btn-wishlist[data-card-id]');
            if (y) {
                const missing = Math.max(0, a - i);
                y.setAttribute('data-missing', String(missing));
                y.style.background = window.userWishlist && window.userWishlist.has(n) ? '#E91E63' : '#F48FB1';
                y.style.borderColor = y.style.background;
                y.innerHTML = window.userWishlist && window.userWishlist.has(n) ? '&#9829;' : '&#9825;';
            }
        });
    }

    // ── Expose ──
    window.buildCustomBinder = buildCustomBinder;
    window.refreshCustomBinderOwnership = refreshCustomBinderOwnership;
    window.cbAddArchetype = cbAddArchetype;
    window.cbToggleArchetype = cbToggleArchetype;
    window.cbRemoveArchetype = cbRemoveArchetype;
    window.cbToggleArchetypeDropdown = cbToggleArchetypeDropdown;
    window.cbFilterArchetypeList = cbFilterArchetypeList;
    window.cbSetFilter = cbSetFilter;
    /* Sprachwechsel zeichnet den Custom Binder neu.
     *
     * URSACHE (gemessen 30.08.2026): cbRenderBinder() baut Kennzahlen,
     * Filterzeile, Ordner-Leiste und Kartenraster als HTML-String
     * zusammen. switchLanguage() ruft nur updateTranslationsInDOM(),
     * und das fasst ausschliesslich Elemente mit data-i18n an. FOLGE:
     * nach dem Umschalten standen die gebauten Beschriftungen weiter in
     * der alten Sprache, bis der Nutzer neu generierte.
     *
     * Nur neu zeichnen, wenn das Raster ueberhaupt schon gefuellt ist —
     * sonst baut ein Sprachwechsel auf einer anderen Seite still Inhalt
     * in einen verborgenen Reiter. Vorbild: js/app-quellen.js.
     */
    document.addEventListener('languageChanged', function () {
        var grid = document.getElementById('cbGrid');
        if (!grid || !grid.children.length) return;
        var delta = window._cbDelta;
        if (!delta || !Array.isArray(delta.cards)) return;
        try {
            cbRenderBinder(delta, mb());
            cbRenderBinderBar();
            cbRenderPresetBar();
        } catch (err) {
            console.warn('[i18n] Custom Binder nicht neu gezeichnet:', err);
        }
    });

    window.cbSetPrintView = cbSetPrintView;
    window.cbApplyFilter = cbApplyFilter;
    window.cbAddMissingToWishlist = cbAddMissingToWishlist;
    window.cbSendMissingToProxy = cbSendMissingToProxy;
    window.cbSaveCurrentAsPreset = cbSaveCurrentAsPreset;
    window.cbLoadPreset = cbLoadPreset;
    window.cbDeletePreset = cbDeletePreset;
    window.cbSetMode = cbSetMode;
    window.cbSetThreshold = cbSetThreshold;
    window.cbTogglePrintedBtn = cbTogglePrintedBtn;
    window.cbSendUnprintedToProxy = cbSendUnprintedToProxy;
    window.cbMarkFilteredPrinted = cbMarkFilteredPrinted;
    window.cbAddTopMetaArchetypes = cbAddTopMetaArchetypes;
    window.cbLoadBinderIntoProxy = cbLoadBinderIntoProxy;
    window.cbOpenDroppedModal = cbOpenDroppedModal;
    window.cbSpeichereBinder = cbSpeichereBinder;
    window.cbOeffneBinder = cbOeffneBinder;
    window.cbLoescheBinder = cbLoescheBinder;
    window.cbAktualisiereBinder = cbAktualisiereBinder;
    window.cbHakeAb = cbHakeAb;
    window.cbAbgleichFertig = cbAbgleichFertig;
    window.cbSetSort = cbSetSort;
    window.cbLadeBinderListe = cbLadeBinderListe;
    window.cbRenderBinderBar = cbRenderBinderBar;
})();
