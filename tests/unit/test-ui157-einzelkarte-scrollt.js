/* UI-157: die Einzelkarten-Ansicht muss scrollen und darf oben nichts abschneiden.
   CSS ist hier wirklich Text (eine Regel); das VERHALTEN misst scripts/messe_einzelkarte.js.
   Kommentare werden vorher herausgeschnitten, sonst besteht die Probe durch den eigenen Kommentar. */
const assert = require('assert');
const fs = require('fs');
const css = fs.readFileSync(require('path').join(__dirname, '..', '..', 'css', 'knopfsystem.css'), 'utf8');
const ohne = css.replace(/\/\*[\s\S]*?\*\//g, '');
assert.ok(ohne.length > css.length * 0.3, 'Ausschneiden hat zu viel entfernt');
const regel = (sel) => { const m = new RegExp(sel.replace(/[.#]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(ohne); assert.ok(m, 'Regel fehlt: ' + sel); return m[1]; };
const fenster = regel('#singleCardModal.active');
assert.match(fenster, /overflow-y:\s*auto/, 'Fenster muss scrollen');
assert.match(fenster, /align-items:\s*flex-start/, 'nicht mittig ausrichten (schneidet oben ab)');
assert.match(fenster, /env\(safe-area-inset-top/, 'Abstand zum sicheren Bereich oben');
assert.match(fenster, /env\(safe-area-inset-bottom/, 'Abstand unten');
const inhalt = regel('#singleCardModal .single-card-modal-content');
assert.match(inhalt, /margin:\s*auto\s*!important/, 'auto-Raender zentrieren nur bei Platz');
assert.match(inhalt, /max-height:\s*none\s*!important/, 'Inhalt darf hoeher als 92vh werden');
console.log('ok test-ui157-einzelkarte-scrollt');
