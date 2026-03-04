# VS Code Optimization Settings

## Problem
VS Code wird langsam oder "not responding" bei großen Dateien (js/app.js, css/styles.css).

## Lösung
Kopiere diese Settings in deine VS Code Workspace-Settings.

### Automatisch (Empfohlen)
1. Drücke `F1` oder `Ctrl+Shift+P`
2. Tippe: `Preferences: Open Workspace Settings (JSON)`
3. Kopiere folgenden Inhalt:

```json
{
    "files.exclude": {
        "**/__pycache__": true,
        "**/*.pyc": true,
        "**/index_original_backup.html": true
    },
    "search.exclude": {
        "**/node_modules": true,
        "**/bower_components": true,
        "**/*.code-search": true,
        "**/js/app.js": true,
        "**/css/styles.css": true,
        "**/index_original_backup.html": true
    },
    "files.watcherExclude": {
        "**/.git/objects/**": true,
        "**/.git/subtree-cache/**": true,
        "**/node_modules/*/**": true,
        "**/__pycache__/**": true,
        "**/data/**/*.csv": true,
        "**/data/**/*.json": true
    },
    "[javascript]": {
        "editor.maxTokenizationLineLength": 20000,
        "editor.largeFileOptimizations": true
    },
    "[css]": {
        "editor.maxTokenizationLineLength": 20000,
        "editor.largeFileOptimizations": true
    },
    "editor.largeFileOptimizations": true,
    "files.maxMemoryForLargeFilesMB": 4096,
    "git.ignoreLimitWarning": true,
    "python.analysis.memory.keepLibraryAst": false,
    "python.analysis.diagnosticMode": "openFilesOnly"
}
```

4. Speichern
5. **VS Code neu laden:** `F1` → `Developer: Reload Window`

### Manuell
Die Settings wurden bereits in `.vscode/settings.json` erstellt (lokal, nicht in Git).

## Was wird optimiert?

| Setting | Effekt |
|---------|---------|
| `files.exclude` | Versteckt Backup-Dateien vom Explorer |
| `search.exclude` | Schließt große generierte Dateien von Search aus |
| `files.watcherExclude` | Reduziert File Watcher Last (Performance) |
| `largeFileOptimizations` | Aktiviert Optimierungen für große Dateien |
| `maxMemoryForLargeFilesMB` | Erlaubt mehr RAM für große Dateien |
| `python.analysis.diagnosticMode` | Nur offene Files analysieren (Performance) |

## Zusätzliche Tipps

### 1. VS Code Extension deaktivieren (optional)
Einige Extensions verlangsamen VS Code bei großen Projekten:
- `F1` → `Extensions: Show Running Extensions`
- Deaktiviere nicht benötigte Extensions

### 2. TypeScript Server Memory erhöhen (falls TypeScript Extension)
Füge hinzu:
```json
"typescript.tsserver.maxTsServerMemory": 4096
```

### 3. Terminal-Output-Limit erhöhen
```json
"terminal.integrated.scrollback": 5000
```

## Testen
1. VS Code neu laden: `F1` → `Developer: Reload Window`
2. Öffne `js/app.js` → Sollte schneller laden
3. File Search: `Ctrl+P` → Sollte responsive sein

## Ergebnis
✅ VS Code lädt schneller  
✅ Keine "not responding" Fehler mehr  
✅ File Search funktioniert flüssig  
✅ Reduzierter RAM-Verbrauch  
