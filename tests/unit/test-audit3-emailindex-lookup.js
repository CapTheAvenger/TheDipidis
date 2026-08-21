/**
 * Audit 3 — CRITICAL publicProfiles-E-Mail-Leak.
 *
 * Befund (live gemessen am 21.08.2026 gegen die Produktivdatenbank): ein
 * einziges db.collection('publicProfiles').get() lieferte jedem eingeloggten
 * Nutzer alle 5 Konten samt vollstaendiger E-Mail-Adresse, zwei davon fremde.
 * Ursache: der Lookup "Mitglied per E-Mail einladen" war eine QUERY
 * (.where('email','==',...)), und eine Query braucht in Firestore die
 * list-Berechtigung fuer die GANZE Collection.
 *
 * Fix: Dokument-ID = SHA-256 der kleingeschriebenen E-Mail. Aus der Query wird
 * ein direkter get() auf genau ein Dokument, damit darf die Regel list sperren.
 *
 * Dieser Test schneidet die ECHTEN Funktionen aus js/app-testing-groups.js und
 * fuehrt sie mit Attrappen aus. Er misst Verhalten, nicht Zeichenfolgen:
 * gegengeprueft, indem der Hash-Zweig aus _lookupUidByEmail entfernt wurde —
 * dann faellt der Test (kein get, sondern eine Query wird abgesetzt).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-testing-groups.js'), 'utf8');

function cutBalanced(src, sig) {
  const a = src.indexOf(sig);
  assert.ok(a > -1, sig + ' nicht gefunden');
  const open = src.indexOf('{', a);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(a, i + 1); }
  }
  throw new Error('Ende ' + sig + ' nicht gefunden');
}

// Firestore-Attrappe: protokolliert JEDEN Zugriff, damit der Test beweisen
// kann, dass kein .where()/list mehr abgesetzt wird.
function makeDb(docs, { queryThrows = false } = {}) {
  const log = [];
  return {
    log,
    collection(name) {
      return {
        doc(id) {
          return {
            async get() {
              log.push({ op: 'get', name, id });
              const key = name + '/' + id;
              return { exists: key in docs, data: () => docs[key] };
            },
            async set(data) { log.push({ op: 'set', name, id, data }); docs[name + '/' + id] = data; },
          };
        },
        where(field, _op, value) {
          log.push({ op: 'where', name, field, value });
          const self = {
            limit() { return self; },
            async get() {
              if (queryThrows) { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; }
              const hit = Object.entries(docs).find(([k, v]) => k.startsWith(name + '/') && v[field] === value);
              return hit ? { empty: false, docs: [{ id: hit[0].split('/')[1], data: () => hit[1] }] } : { empty: true, docs: [] };
            },
          };
          return self;
        },
      };
    },
  };
}

// Die beiden echten Funktionen aus der Quelle holen und mit Attrappen binden.
function build(db, user) {
  const block = cutBalanced(SRC, 'async function _emailHash(')
    + '\n' + cutBalanced(SRC, 'async function _lookupUidByEmail(')
    + '\n' + cutBalanced(SRC, 'async function _ensurePublicProfile(')
    + '\n; return { _emailHash, _lookupUidByEmail, _ensurePublicProfile };';
  const fsNow = () => 'SERVER_TS';
  const firebaseStub = { firestore: { FieldValue: { delete: () => 'DELETE_SENTINEL', serverTimestamp: fsNow } } };
  // eslint-disable-next-line no-new-func
  return new Function('_db', '_currentUser', '_fsNow', 'firebase', 'console', 'window', 'TextEncoder', block)(
    () => db, () => user, fsNow, firebaseStub,
    { warn() {} }, { crypto: globalThis.crypto }, TextEncoder);
}

const sha = (e) => createHash('sha256').update(e.trim().toLowerCase()).digest('hex');
const ME = { uid: 'uid-a', email: 'Hausi@Example.COM', displayName: 'Hausi' };

describe('Audit 3 — E-Mail-Hash-Index statt Query', () => {

  it('_emailHash normalisiert (trim + kleinschreiben) und liefert SHA-256-Hex', async () => {
    const api = build(makeDb({}), ME);
    const h = await api._emailHash('  Hausi@Example.COM ');
    assert.equal(h, sha('hausi@example.com'));
    assert.match(h, /^[0-9a-f]{64}$/);
  });

  it('Lookup nutzt einen direkten get() auf den Hash — KEINE Query', async () => {
    const db = makeDb({
      ['emailIndex/' + sha('fremd@example.com')]: { uid: 'uid-b' },
      'publicProfiles/uid-b': { displayName: 'Fremd' },
    });
    const api = build(db, ME);
    const res = await api._lookupUidByEmail('Fremd@Example.com');

    assert.deepEqual(res, { uid: 'uid-b', displayName: 'Fremd' });
    // Der eigentliche Beweis: es wurde nie ein .where() abgesetzt.
    assert.equal(db.log.filter((e) => e.op === 'where').length, 0,
      'es darf keine Query mehr abgesetzt werden — genau die brauchte list');
    assert.ok(db.log.some((e) => e.op === 'get' && e.name === 'emailIndex'),
      'der Lookup muss ueber emailIndex/{hash} gehen');
  });

  it('gesperrtes list (permission-denied) faellt sauber auf "nicht gefunden"', async () => {
    // Endzustand: emailIndex leer, alte Query verboten. Kein Wurf nach aussen.
    const db = makeDb({}, { queryThrows: true });
    const api = build(db, ME);
    assert.equal(await api._lookupUidByEmail('fremd@example.com'), null);
  });

  it('_ensurePublicProfile schreibt den Index und loescht die Klartext-E-Mail', async () => {
    const docs = { 'publicProfiles/uid-a': { displayName: 'Hausi', email: 'hausi@example.com' } };
    const db = makeDb(docs);
    const api = build(db, ME);
    await api._ensurePublicProfile();

    const idx = db.log.find((e) => e.op === 'set' && e.name === 'emailIndex');
    assert.ok(idx, 'emailIndex-Eintrag muss geschrieben werden');
    assert.equal(idx.id, sha('hausi@example.com'), 'Dokument-ID ist der E-Mail-Hash');
    assert.deepEqual(idx.data, { uid: 'uid-a' },
      'genau ein Feld — die Regel erzwingt hasOnly([uid])');

    const prof = db.log.find((e) => e.op === 'set' && e.name === 'publicProfiles');
    assert.ok(prof, 'Profil muss geschrieben werden');
    assert.equal(prof.data.email, 'DELETE_SENTINEL',
      'die Klartext-E-Mail aus dem Altbestand muss geloescht werden');
    assert.equal(prof.data.displayName, 'Hausi');
  });

  it('kein sicherer Kontext: _emailHash liefert null statt zu werfen', async () => {
    const block = cutBalanced(SRC, 'async function _emailHash(') + '\n; return _emailHash;';
    // eslint-disable-next-line no-new-func
    const f = new Function('console', 'window', 'TextEncoder', block)({ warn() {} }, {}, TextEncoder);
    assert.equal(await f('a@b.de'), null);
  });
});
