/**
 * card-tooltips.js – Card hover tooltips & table enhancement
 * Extracted from inline <script> in index.html for cacheability.
 * Consolidates the two duplicate tooltip implementations into one.
 */

// --- Sidebar open-tab helper (legacy, used by sidebar onclick) ---
function openTab(event, tabId) {
    if (event && event.currentTarget) {
        const btn = event.currentTarget;
        const siblings = btn.parentElement.querySelectorAll('.tab-link');
        siblings.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    const tab = document.getElementById(tabId);
    if (tab) tab.classList.add('active');
}

// --- Card Image Tooltip (single implementation, event-delegated) ---
let _cardTooltipEl = null;

function _ensureCardTooltip() {
    if (_cardTooltipEl) return;
    _cardTooltipEl = document.createElement('div');
    _cardTooltipEl.className = 'card-hover-tooltip';
    document.body.appendChild(_cardTooltipEl);
}

function _positionTooltip(x, y) {
    if (!_cardTooltipEl) return;
    let left = x + 24;
    let top = y - 20;
    const rect = _cardTooltipEl.getBoundingClientRect();
    if (left + rect.width > window.innerWidth) left = window.innerWidth - rect.width - 12;
    if (top + rect.height > window.innerHeight) top = window.innerHeight - rect.height - 12;
    if (top < 0) top = 8;
    _cardTooltipEl.style.left = left + 'px';
    _cardTooltipEl.style.top = top + 'px';
}

function _onTooltipMove(e) {
    _positionTooltip(e.clientX, e.clientY);
}

document.body.addEventListener('mouseover', function (e) {
    const el = e.target.closest('[data-card-img]');
    if (!el) return;
    _ensureCardTooltip();
    const imgUrl = el.getAttribute('data-card-img');
    _cardTooltipEl.innerHTML = '<img src="' + imgUrl + '" alt="Card preview">';
    _cardTooltipEl.style.display = 'block';
    _positionTooltip(e.clientX, e.clientY);
    document.body.addEventListener('mousemove', _onTooltipMove);
});

document.body.addEventListener('mouseout', function (e) {
    const el = e.target.closest('[data-card-img]');
    if (!el || !_cardTooltipEl) return;
    _cardTooltipEl.style.display = 'none';
    document.body.removeEventListener('mousemove', _onTooltipMove);
});

// --- Table beautification: modern-table class & winrate colouring ---
document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('table').forEach(function (tbl) {
        tbl.classList.add('modern-table');
    });
    document.querySelectorAll('td.winrate, span.winrate').forEach(function (cell) {
        var val = parseFloat(cell.textContent.replace('%', ''));
        if (!isNaN(val)) {
            cell.style.color = val >= 50 ? 'var(--success)' : 'var(--danger)';
        }
    });
});
