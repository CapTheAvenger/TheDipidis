// Tech-Radar UI rendering for TabContent_Analysis.html
// This script expects a div with id 'tech-radar-grid' in the DOM.
// It uses the backend-provided tech radar data (JSON) and renders the cards with glowing and newcomer effects.

function renderTechRadar(techData) {
    const container = document.getElementById('tech-radar-grid');
    if (!container) return;
    container.innerHTML = techData.map(card => `
        <div class="tech-card-item ${card.is_newcomer ? 'newcomer' : ''}" 
             onmouseover="showTooltip(event, '${card.image_url}')" 
             onmouseout="hideTooltip()">
            <span class="trend-badge">▲ ${card.increase}%</span>
            <div class="tech-card-info">
                <div class="tech-card-name">${card.name}</div>
                <div class="tech-archetype-tag">${card.found_in}</div>
            </div>
            ${card.is_newcomer ? '<div class="new-label">NEW</div>' : ''}
        </div>
    `).join('');
}

// Example usage (replace with real fetch):
// fetch('data/tech_radar_data.json').then(r => r.json()).then(renderTechRadar);
