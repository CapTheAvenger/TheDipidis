/**
 * Inline Init - Extracted from index.html inline <script> blocks
 * to allow removing 'unsafe-inline' from Content-Security-Policy.
 */

window.CARD_BACK_URL = "https://images.pokemontcg.io/card-back.png";

function toggleMainMenu() {
    document.getElementById('mainMenuDropdown').classList.toggle('show');
    document.getElementById('mainMenuTrigger').classList.toggle('open');
}

function switchTabAndUpdateMenu(tabId) {
    if (typeof switchTab === 'function') switchTab(tabId);

    document.querySelectorAll('.menu-item').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById('menu-btn-' + tabId);
    if (activeBtn) {
        activeBtn.classList.add('active');
        // Strip emoji characters for clean badge text
        let text = activeBtn.innerText.replace(/[\u{1F300}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
        const badge = document.getElementById('current-tab-title');
        if (badge) badge.innerText = text || activeBtn.innerText.trim();
    }

    document.getElementById('mainMenuDropdown').classList.remove('show');
    document.getElementById('mainMenuTrigger').classList.remove('open');
}

document.addEventListener('click', function(e) {
    const menu    = document.getElementById('mainMenuDropdown');
    const trigger = document.getElementById('mainMenuTrigger');
    if (menu && trigger && menu.classList.contains('show')) {
        if (!menu.contains(e.target) && !trigger.contains(e.target)) {
            menu.classList.remove('show');
            trigger.classList.remove('open');
        }
    }
});

document.addEventListener('languageChanged', function() {
    const activeBtn = document.querySelector('.menu-item.active');
    const badge = document.getElementById('current-tab-title');
    if (activeBtn && badge) badge.innerText = activeBtn.innerText.trim();
});

// Wrap all DOM event logic in DOMContentLoaded for safety
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        // All event listeners and DOM manipulations above this line should be moved here for safety if needed
    });
}
