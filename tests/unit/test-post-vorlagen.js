'use strict';
/*
 * DIE POST-VORLAGEN MÜSSEN AUSSEHEN WIE DIE BILDER DER SEITE
 * ==========================================================
 *
 * ANLASS (04.09.2026)
 * -------------------
 * Betreiber: "ich baue den Kanal erst jetzt auf sobald alles steht.
 * @thedipidis [...] Erstelle mal ein paar Vorlagen, das Grund Design
 * steht ja schon."
 *
 * Es steht wirklich schon — in js/ds-share.js. Dort liegen Grund,
 * Blütenlage, Logo, Kopf, Fuß und Farbtafel der Bilder, die die Seite
 * selbst erzeugt (Meta Call, Format-Staples). posts/index.html malt
 * dieselbe Marke, kann diese Datei aber nicht laden: ds-share.js
 * erwartet die ganze Anwendung (i18n, Login, Datenladung), und die
 * Vorlagenseite soll allein aufgehen.
 *
 * DAS RISIKO, DAS DIESE DATEI ABDECKT
 * -----------------------------------
 * Zwei Kopien derselben Gestaltung wandern auseinander, und niemand
 * merkt es — bis auf Instagram ein Bild mit anderem Gold steht als das,
 * das aus der Seite fällt. Der Betreiber hat genau dazu schon einmal
 * eine Ansage gemacht: "dann sollten wir die gleichen Farben ueberall
 * nutzen, nicht einmal Balken neon Blau und andere Gold."
 *
 * Geprüft wird deshalb Zahl für Zahl, dass beide Fassungen dieselbe
 * Marke tragen: Bildmaß, Farbtafel, Blütenlage, Verlaufsfarben. Nicht
 * "es gibt eine Farbe", sondern "es ist DIESE Farbe".
 *
 * Was NICHT geprüft wird: die Körper. Die Vorlagenseite hat vier eigene
 * (Feature, Zahl, Liste, Ansage), ds-share.js hat fünf andere. Das ist
 * Absicht — sie malen verschiedene Dinge.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const wurzel = path.join(__dirname, '..', '..');
const lies = (...t) => fs.readFileSync(path.join(wurzel, ...t), 'utf8');

const seite = lies('posts', 'index.html');
const share = lies('js', 'ds-share.js');

/* Farbwerte aus einem Textstück ziehen: '#F7EFE4' und
   'rgba(74,45,85,.80)'. Kleinschreibung vereinheitlicht, damit
   '#e3b276' und '#E3B276' als dasselbe zählen. */
function farben(text) {
    const treffer = text.match(/#[0-9a-fA-F]{6}\b|rgba?\([^)]*\)/g) || [];
    return treffer.map(f => f.toLowerCase().replace(/\s+/g, ''));
}

describe('Die Post-Vorlagen tragen die Marke der Seite', () => {

    it('das Bildmaß ist dasselbe wie bei den Bildern der Anwendung', () => {
        // 1080 x 1350 — Instagram hochkant. Aufgabe #120 nennt genau
        // dieses Maß, und ds-share.js malt in demselben.
        assert.match(share, /var MP = \{ W: 1080, H: 1350 \}/,
            'ds-share.js malt nicht mehr in 1080x1350 — dann stimmt die '
            + 'Vorlagenseite daneben nicht mehr');
        assert.match(seite, /var MP = \{ W: 1080, H: 1350 \}/,
            'posts/index.html malt nicht mehr in 1080x1350');
        assert.match(seite, /<canvas id="cv" width="1080" height="1350"/,
            'die Vorschau auf der Seite hat ein anderes Maß als das Bild, '
            + 'das sie ausgibt — dann lügt die Vorschau');
    });

    it('die Farbtafel ist Wert für Wert dieselbe', () => {
        // MC_FARBEN in ds-share.js, F in posts/index.html. Beide Namen
        // sind egal; die sieben Werte sind es nicht.
        const tafel = /MC_FARBEN = \{([\s\S]*?)\};/.exec(share);
        assert.ok(tafel, 'MC_FARBEN steht nicht mehr in js/ds-share.js');
        const seiteTafel = /var F = \{([\s\S]*?)\};/.exec(seite);
        assert.ok(seiteTafel, 'die Farbtafel steht nicht mehr in posts/index.html');

        const werte = t => Object.fromEntries(
            [...t.matchAll(/(\w+):\s*'([^']+)'/g)].map(m => [m[1], m[2].toLowerCase()]));
        const a = werte(tafel[1]);
        const b = werte(seiteTafel[1]);
        const fehlend = Object.keys(a).filter(k => !(k in b));
        assert.deepStrictEqual(fehlend, [],
            `die Vorlagenseite kennt diese Farben nicht (mehr): ${fehlend.join(', ')}`);
        const anders = Object.keys(a).filter(k => a[k] !== b[k]);
        assert.deepStrictEqual(anders, [],
            'die beiden Fassungen sind auseinandergelaufen: '
            + anders.map(k => `${k} ${a[k]} vs ${b[k]}`).join(' · ')
            + ' — dann steht auf Instagram ein anderes Gold als auf der Seite');
    });

    it('die Blütenlage ist dieselbe, die der Betreiber freigegeben hat', () => {
        // Lage B1: sieben Blüten, je [Datei, x, y, Breite, Drehung,
        // Deckung]. Ein verschobenes Blütenblatt fällt beim Nebeneinander
        // zweier Posts sofort auf.
        const lage = t => {
            const m = /(?:MC_)?BLUETEN = \[([\s\S]*?)\];/.exec(t);
            assert.ok(m, 'die Blütenlage fehlt');
            return [...m[1].matchAll(/\[\s*'(\w+)'[^\]]*\]/g)]
                .map(x => x[0].replace(/\s+/g, ''));
        };
        const a = lage(share);
        const b = lage(seite);
        assert.strictEqual(a.length, 7, `ds-share.js hat ${a.length} Blüten statt sieben`);
        assert.deepStrictEqual(b, a,
            'die Blütenlage der Vorlagenseite weicht ab. Sie ist nicht '
            + 'irgendeine — der Betreiber hat Lage B1 für die Posts '
            + 'ausgesucht');
    });

    it('der Grund ist derselbe Verlauf', () => {
        // Drei Halte im Linearverlauf, zwei im Radialverlauf.
        // Von malGrund bis zur nächsten Funktion. Ein fester Ausschnitt
        // ("die nächsten 900 Zeichen") griff in beiden Dateien
        // verschieden weit — in posts/index.html reichte er bis in
        // malBluete hinein und zählte deren Schlagschatten mit.
        const grund = t => {
            const i = t.indexOf('function malGrund');
            assert.ok(i > 0, 'malGrund fehlt');
            const rest = t.slice(i + 10);
            const ende = rest.indexOf('function ');
            return farben(rest.slice(0, ende > 0 ? ende : rest.length));
        };
        assert.deepStrictEqual(grund(seite), grund(share),
            'der Grund der Vorlagen ist ein anderer als der der Bilder '
            + 'aus der Anwendung');
    });

    it('der Fuß nennt die Seite', () => {
        // Der ganze Zweck: wer über Instagram kommt, soll wissen wohin.
        assert.match(seite, /'thedipidis\.app'/,
            'die Fußzeile nennt die Seite nicht mehr — dann ist der Post '
            + 'ein Bild ohne Absender');
    });
});

describe('Die Vorlagen halten die Hausregeln ein', () => {

    it('die Zahl-Vorlage hat ein Pflichtfeld für den Nenner', () => {
        /* "Report, don't silently repair" hat eine Schwester in der
           Anzeige: keine Quote ohne ihre Grundlage. Auf einem Bild, das
           durch Instagram wandert, kann niemand nachschlagen, worauf
           sich "7,4 %" bezieht. */
        assert.match(seite, /id="zahlNenner"/,
            'das Feld für die Grundlage ist weg. Ein Prozentwert ohne '
            + 'Nenner ist auf einem geteilten Bild nicht nachprüfbar');
        assert.match(seite, /Grundlage — Pflicht/,
            'die Beschriftung sagt nicht mehr, dass der Nenner Pflicht ist');
        const koerper = /function malZahl\(([\s\S]*?)\n\}/.exec(seite);
        assert.ok(koerper, 'malZahl fehlt');
        assert.match(koerper[1], /zahlNenner/,
            'malZahl malt den Nenner nicht mehr — dann steht das Feld im '
            + 'Formular und nicht auf dem Bild');
    });

    it('die Aufnahmen sind deutsche Aufnahmen', () => {
        const liste = /var SHOTS = \[([\s\S]*?)\];/.exec(seite);
        assert.ok(liste, 'die Liste der Aufnahmen fehlt');
        const pfade = [...liste[1].matchAll(/'([^']+\.png)'/g)].map(m => m[1]);
        assert.ok(pfade.length >= 5, `nur ${pfade.length} Aufnahmen in der Liste`);
        const englisch = pfade.filter(p => !/\/de\//.test(p));
        assert.deepStrictEqual(englisch, [],
            'diese Aufnahmen liegen nicht unter einem /de/-Pfad und zeigen '
            + `damit die englische Oberfläche: ${englisch.join(', ')} — auf `
            + 'einem deutschen Post ist das derselbe Fehler wie eine '
            + 'vergessene Übersetzung');
    });

    it('jede genannte Aufnahme liegt auch im Repo', () => {
        // Dieselbe Zusicherung wie bei der Anleitung: ein Bildpfad, den
        // niemand geprüft hat, ist ein leerer Rahmen im Post.
        const liste = /var SHOTS = \[([\s\S]*?)\];/.exec(seite)[1];
        const fehlend = [...liste.matchAll(/'\.\.\/([^']+\.png)'/g)]
            .map(m => m[1])
            .filter(p => !fs.existsSync(path.join(wurzel, p)));
        assert.deepStrictEqual(fehlend, [],
            `diese Aufnahmen fehlen im Repo: ${fehlend.join(', ')}`);
    });

    it('die Telefonaufnahmen stehen vor den Schreibtischaufnahmen', () => {
        /* Gemessen am 04.09.2026: eine Schreibtischaufnahme (2560 px
           breit) sitzt im Post 968 px breit — ihr Text steht auf gut ein
           Drittel geschrumpft und ist nicht mehr zu lesen. Die
           Hochkantaufnahmen sind bei 440 px aufgenommen und stehen fast
           in Originalgröße. Wer die Liste aufklappt, soll die brauchbare
           zuerst sehen. */
        const liste = /var SHOTS = \[([\s\S]*?)\];/.exec(seite)[1];
        const pfade = [...liste.matchAll(/'([^']+\.png)'/g)].map(m => m[1]);
        const ersteSchreibtisch = pfade.findIndex(p => p.includes('/tutorials/'));
        const letzteTelefon = pfade.map(p => p.includes('/posts/')).lastIndexOf(true);
        assert.ok(letzteTelefon >= 0, 'es steht keine Telefonaufnahme in der Liste');
        assert.ok(ersteSchreibtisch === -1 || letzteTelefon < ersteSchreibtisch,
            'die Aufnahmen stehen gemischt in der Liste — die lesbaren '
            + 'gehören nach oben');
    });

    it('der Punkteblock wird vermessen, bevor er gemalt wird', () => {
        /* BEFUND am ersten Entwurf: die Stichpunkte standen auf festen
           Abständen, und der vierte lief unter die Fußzeile. Halb
           abgeschnittener Text auf einem Bild, das geteilt wird, ist
           schlimmer als ein weggelassener Punkt. */
        assert.match(seite, /function punkteBlock\(/,
            'die Vermessung des Punkteblocks ist weg — dann kann der '
            + 'letzte Punkt wieder unter der Fußzeile landen');
        assert.match(seite, /var FUSS_OBEN = /,
            'die Grenze zur Fußzeile ist nicht mehr benannt');
        const malen = /function malPunkte\(([\s\S]*?)\n\}/.exec(seite);
        assert.ok(malen, 'malPunkte fehlt');
        // Nicht "das Wort grenze kommt vor" — das steht auch noch in
        // der Parameterliste, wenn der Vergleich herausgenommen ist.
        // Geprueft wird der Vergleich selbst.
        assert.match(malen[1], /if\s*\([^)]*\bgrenze\b[^)]*\)\s*return;/,
            'malPunkte vergleicht nicht mehr gegen die Grenze und malt '
            + 'wieder blind bis unter den Rand');
    });

    it('der Deploy nimmt die Seite mit', () => {
        /* _site wird aus einer Positivliste gebaut, nicht aus dem
           Repo-Inhalt. Genau das hat die Anleitung schon einmal gekostet
           — sie lag im Repo und war live weg. Bei posts/ faellt es noch
           weniger auf, weil die Seite in keinem Menue steht: sie ist
           entweder da oder 404, und niemand stolpert darueber. */
        const wf = lies('.github', 'workflows', 'deploy-pages.yml');
        assert.match(wf, /cp -r posts _site\/posts/,
            'deploy-pages.yml kopiert posts/ nicht nach _site — die '
            + 'Vorlagenseite ist dann live nicht erreichbar');
    });

    it('die Telefonaufnahmen kommen mit', () => {
        // images/ wird als Ganzes kopiert; die Zusicherung haelt fest,
        // dass das so bleibt, denn images/posts/de/ haengt daran.
        const wf = lies('.github', 'workflows', 'deploy-pages.yml');
        assert.match(wf, /cp -r images _site\/images/,
            'images/ wird nicht mehr im Ganzen kopiert — dann pruefen, ob '
            + 'images/posts/de/ noch im Deploy landet');
    });

    it('das Skript für die Telefonaufnahmen liegt bei', () => {
        // Bilder ohne ihr Skript sind nicht erneuerbar; beim nächsten
        // Umbau der Ansicht sind sie still veraltet.
        const skript = lies('prerender', 'screenshot-posts.js');
        assert.match(skript, /width: 440, height: 956/,
            'das Aufnahmeskript schießt nicht mehr im Telefonmaß');
        // Der Aufruf selbst, nicht irgendein 'de' in einem Pfad.
        assert.match(skript, /setItem\(\s*'app_lang'\s*,\s*'de'\s*\)/,
            'das Aufnahmeskript stellt die Oberfläche nicht mehr auf Deutsch — '
            + 'genau dieser Fehler hat am 03.09.2026 fast englische Bilder '
            + 'in die deutsche Anleitung gebracht');
    });
});
