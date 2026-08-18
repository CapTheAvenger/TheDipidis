"""Die vier inhaltlichen index.html-Aenderungen — ohne Versionsstempel.

Idempotent: laeuft das Skript zweimal, passiert beim zweiten Mal nichts.
Die neuen Assets bekommen `?v=0` als Platzhalter. bump-version.sh ersetzt
`\?v=[0-9]+` und deploy-pages.yml ersetzt `\?v=[^"]*` — beide greifen darauf.
Ein fester Stempel im Commit haette dagegen bei jedem Datenjob einen Konflikt
erzeugt, und laut Commit 4 ist er ohnehin wirkungslos.
"""
import re, sys, io

p = 'index.html'
s = io.open(p, encoding='utf-8').read()
orig = s
did = []

# 1) CSS-Link nach components.css
if 'css/ds-nav.css' not in s:
    m = re.search(r'\n[ \t]*<link rel="stylesheet" href="css/components\.css[^>]*>', s)
    if not m:
        sys.exit('components.css-Link nicht gefunden')
    s = s[:m.end()] + '\n    <link rel="stylesheet" href="css/ds-nav.css?v=0">' + s[m.end():]
    did.append('css-link')

# 2) Tote Navigationsleiste ersetzen
DEAD = re.compile(
    r'[ \t]*<nav class="tab-navigation cards-tab-navigation" aria-label="Main navigation">'
    r'.*?</nav>\n', re.S)
NEW_NAV = '''            <!-- Hauptnavigation. Ersetzt die frühere .tab-navigation, die
                 css/pokeball-menu.css mit `display: none !important` global
                 abgeschaltet hatte — fünf Knöpfe Markup, auf Desktop und Mobil
                 unsichtbar. Befüllt von js/ds-nav.js; ohne JS bleibt der
                 Pokéball die Navigation, wie bisher. -->
            <nav id="dsNavHost" class="ds-nav" aria-label="Hauptnavigation"></nav>
            <div id="dsSpaceHost" class="ds-space" hidden></div>
'''
if 'dsNavHost' not in s:
    s, n = DEAD.subn(NEW_NAV, s, count=1)
    if n != 1:
        sys.exit('tote .tab-navigation nicht gefunden')
    did.append('nav')

# 3) Mobile Tab-Bar nach </main>
if 'dsTabbarHost' not in s:
    idx = s.rindex('</main>')
    end = idx + len('</main>')
    s = s[:end] + '''

        <!-- Mobile Hauptnavigation: unten, wo der Daumen liegt. Auf Desktop
             per CSS ausgeblendet, befüllt von js/ds-nav.js. -->
        <nav id="dsTabbarHost" class="ds-tabbar" aria-label="Hauptnavigation (mobil)"></nav>''' + s[end:]
    did.append('tabbar')

# 4) Script ans Ende der defer-Kette (ds-nav.js umschliesst switchTab aus app-core.js)
if 'src="js/ds-nav.js' not in s:
    m = re.search(r'\n[ \t]*<script src="js/current-meta-quickref\.js[^>]*></script>', s)
    if not m:
        sys.exit('current-meta-quickref.js-Script nicht gefunden')
    s = s[:m.end()] + '\n    <script src="js/ds-nav.js?v=0" defer></script>' + s[m.end():]
    did.append('script')

if s != orig:
    io.open(p, 'w', encoding='utf-8').write(s)
print('angewendet:', ', '.join(did) if did else '(nichts, bereits vorhanden)')
