/**
 * Fremder Code, der sich unter dir aendert.
 *
 * `uses: actions/checkout@v7` heisst nicht "Version 7.0.1", sondern
 * "was auch immer der Tag v7 gerade zeigt". Der Tag wandert: actions/cache
 * hat v6 am 02.09.2026 auf v6.1.0 stehen, morgen kann es v6.2.0 sein.
 * Bei einem beweglichen Tag laeuft in JEDEM Lauf fremder Code, der sich
 * ohne einen einzigen Pull Request geaendert haben kann — und dieser
 * Code hat Schreibrechte auf das Repository.
 *
 * Das Repo hatte beides nebeneinander: 44 Verweise per SHA gepinnt (mit
 * Versionskommentar), 11 an einem beweglichen Tag. Am 02.09.2026
 * angeglichen — alle 55 per SHA.
 *
 * Der Kommentar dahinter ist kein Schmuck: ohne ihn liest niemand mehr,
 * WELCHE Version da laeuft, und Dependabot braucht ihn, um die Zeile
 * ueberhaupt aktualisieren zu koennen.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DIR = path.join(ROOT, '.github', 'workflows');
const DATEIEN = fs.readdirSync(DIR).filter(f => /\.ya?ml$/.test(f));

/** Jede `uses:`-Zeile mit Datei, Zeilennummer und Inhalt. */
function alleUses() {
    const out = [];
    DATEIEN.forEach(f => {
        const zeilen = fs.readFileSync(path.join(DIR, f), 'utf8').split(/\r?\n/);
        zeilen.forEach((z, i) => {
            const m = z.match(/^\s*-?\s*uses:\s*(\S+)(.*)$/);
            if (!m) return;
            out.push({ datei: f, zeile: i + 1, ref: m[1], rest: m[2] || '' });
        });
    });
    return out;
}

describe('Workflows — fremder Code ist festgenagelt', () => {
    const uses = alleUses();

    it('es gibt ueberhaupt Workflows zu pruefen', () => {
        assert.ok(DATEIEN.length > 5, `nur ${DATEIEN.length} Workflow-Dateien`);
        assert.ok(uses.length > 20, `nur ${uses.length} uses-Zeilen`);
    });

    it('keine fremde Action haengt an einem beweglichen Tag', () => {
        const beweglich = uses
            // Lokale Actions (./...) und Docker-Referenzen sind kein
            // fremder Tag.
            .filter(u => !u.ref.startsWith('./') && !u.ref.startsWith('docker://'))
            .filter(u => !/@[0-9a-f]{40}$/.test(u.ref))
            .map(u => `${u.datei}:${u.zeile}  ${u.ref}`);
        assert.deepEqual(beweglich, [],
            'diese Verweise zeigen auf einen Tag, der wandern kann — '
            + 'dort laeuft in jedem Lauf fremder Code mit Schreibrechten, '
            + 'der sich ohne Pull Request geaendert haben kann');
    });

    it('hinter jedem SHA steht, welche Version das ist', () => {
        const ohneKommentar = uses
            .filter(u => /@[0-9a-f]{40}$/.test(u.ref))
            .filter(u => !/#\s*v?\d+(\.\d+)*/.test(u.rest))
            .map(u => `${u.datei}:${u.zeile}  ${u.ref}`);
        assert.deepEqual(ohneKommentar, [],
            'ohne Versionskommentar liest niemand mehr, welche Version '
            + 'laeuft — und Dependabot kann die Zeile nicht aktualisieren');
    });

    it('derselbe Name traegt ueberall denselben SHA', () => {
        // Zwei verschiedene Staende derselben Action in einem Repo sind
        // fast immer ein vergessener Nachzieher.
        const proName = {};
        uses.filter(u => /@[0-9a-f]{40}$/.test(u.ref)).forEach(u => {
            const [name, sha] = u.ref.split('@');
            (proName[name] = proName[name] || new Set()).add(sha);
        });
        const uneinig = Object.entries(proName)
            .filter(([, s]) => s.size > 1)
            .map(([n, s]) => `${n}: ${[...s].join(', ')}`);
        assert.deepEqual(uneinig, [],
            'dieselbe Action laeuft in verschiedenen Workflows auf '
            + 'verschiedenen Staenden');
    });

    it('jeder SHA ist ein vollstaendiger, kleingeschriebener Commit-Hash', () => {
        const krumm = uses
            .filter(u => u.ref.includes('@') && !u.ref.startsWith('./'))
            .filter(u => {
                const sha = u.ref.split('@')[1] || '';
                return /^[0-9a-fA-F]+$/.test(sha) && sha !== sha.toLowerCase();
            })
            .map(u => `${u.datei}:${u.zeile}  ${u.ref}`);
        assert.deepEqual(krumm, [], 'ein SHA steht in Grossbuchstaben');
    });
});
