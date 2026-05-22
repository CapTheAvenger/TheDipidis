/**
 * Lightweight Frontend Error Tracking
 * ====================================
 * Captures uncaught JS errors and unhandled promise rejections,
 * then sends them to Sentry via the Envelope API.
 *
 * The DSN is injected at build time by the CI pipeline.
 * If no DSN is present, errors are silently logged to console only.
 *
 * Size: ~2 KB (no SDK dependency).
 */
(function () {
    'use strict';

    // Injected at build time by deploy-pages.yml — placeholder value means tracking is disabled.
    var SENTRY_DSN = '__SENTRY_DSN__';

    // ---- Parse DSN ----
    var _parsed = null;
    try {
        if (SENTRY_DSN && SENTRY_DSN !== '__SENTRY_DSN__') {
            var m = SENTRY_DSN.match(/^https:\/\/([a-f0-9]+)@([^/]+)\/(\d+)$/);
            if (m) {
                _parsed = { publicKey: m[1], host: m[2], projectId: m[3] };
            }
        }
    } catch (_) { /* ignore */ }

    var _recentErrors = [];
    var MAX_ERRORS_PER_SESSION = 10;
    var THROTTLE_MS = 2000;
    var _lastSentAt = 0;

    function _shouldSend() {
        if (!_parsed) return false;
        if (_recentErrors.length >= MAX_ERRORS_PER_SESSION) return false;
        var now = Date.now();
        if (now - _lastSentAt < THROTTLE_MS) return false;
        _lastSentAt = now;
        return true;
    }

    function _dedupeKey(msg, file, line) {
        return (msg || '') + '|' + (file || '') + '|' + (line || 0);
    }

    function _sendToSentry(errorData) {
        if (!_parsed) return;
        var key = _dedupeKey(errorData.message, errorData.filename, errorData.lineno);
        if (_recentErrors.indexOf(key) !== -1) return;
        _recentErrors.push(key);

        var envelope = _buildEnvelope(errorData);
        var url = 'https://' + _parsed.host + '/api/' + _parsed.projectId + '/envelope/?sentry_key=' + _parsed.publicKey + '&sentry_version=7';

        try {
            if (navigator.sendBeacon) {
                navigator.sendBeacon(url, envelope);
            } else {
                fetch(url, { method: 'POST', body: envelope, keepalive: true }).catch(function () {});
            }
        } catch (_) { /* silent */ }
    }

    function _buildEnvelope(err) {
        var header = JSON.stringify({ dsn: SENTRY_DSN, sent_at: new Date().toISOString() });
        var itemHeader = JSON.stringify({ type: 'event' });
        var event = {
            event_id: _uuid4(),
            timestamp: new Date().toISOString(),
            platform: 'javascript',
            level: 'error',
            logger: 'error-tracking.js',
            environment: location.hostname === 'localhost' ? 'development' : 'production',
            request: {
                url: location.href,
                headers: { 'User-Agent': navigator.userAgent }
            },
            exception: {
                values: [{
                    type: err.type || 'Error',
                    value: err.message || 'Unknown error',
                    stacktrace: err.stack ? { frames: _parseStack(err.stack) } : undefined
                }]
            },
            tags: {
                file: err.filename || '',
                line: String(err.lineno || 0),
                col: String(err.colno || 0)
            },
            extra: {
                componentStack: err.componentStack || undefined
            }
        };
        return header + '\n' + itemHeader + '\n' + JSON.stringify(event);
    }

    function _parseStack(stack) {
        if (!stack) return [];
        return stack.split('\n').slice(0, 10).map(function (line) {
            var m = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/) ||
                    line.match(/at\s+(.+?):(\d+):(\d+)/) ||
                    line.match(/(.+?)@(.+?):(\d+):(\d+)/);
            if (!m) return { filename: line.trim(), function: '?' };
            return {
                function: m[1] || '?',
                filename: m[2] || '',
                lineno: parseInt(m[3]) || 0,
                colno: parseInt(m[4]) || 0
            };
        }).reverse();
    }

    function _uuid4() {
        return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    // ---- Global error handlers ----
    window.addEventListener('error', function (event) {
        if (!_shouldSend()) return;
        _sendToSentry({
            type: event.error ? event.error.name : 'Error',
            message: event.message || 'Unknown error',
            filename: event.filename || '',
            lineno: event.lineno || 0,
            colno: event.colno || 0,
            stack: event.error ? event.error.stack : ''
        });
    });

    window.addEventListener('unhandledrejection', function (event) {
        if (!_shouldSend()) return;
        var reason = event.reason || {};
        _sendToSentry({
            type: 'UnhandledPromiseRejection',
            message: reason.message || String(reason).substring(0, 200),
            filename: '',
            lineno: 0,
            colno: 0,
            stack: reason.stack || ''
        });
    });

    // Expose for manual error reporting
    window.trackError = function (error, context) {
        if (!_shouldSend()) return;
        _sendToSentry({
            type: error.name || 'ManualError',
            message: error.message || String(error),
            filename: '',
            lineno: 0,
            colno: 0,
            stack: error.stack || '',
            componentStack: context || ''
        });
    };

    if (_parsed) {
        console.log('[ErrorTracking] Active — errors will be reported to Sentry');
    }
})();
