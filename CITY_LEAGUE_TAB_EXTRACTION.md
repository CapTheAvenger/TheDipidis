# City League Tab - Complete Extraction

## 1. HTML STRUCTURE

### Main Container (HTML Tab Structure)
```html
<div id="city-league" class="tab-content">
    <div class="container">
        <div class="header">
            <h1>🇯🇵 City League Development</h1>
        </div>
        <div id="cityLeagueContent" style="padding: 30px; background: #ffffff;">
            <div style="text-align: center; padding: 40px; color: #999;">Lädt...</div>
        </div>
    </div>
</div>
```

### Generated HTML Structure (from renderCityLeagueTable)

The main content is rendered dynamically into `#cityLeagueContent` with the following structure:

#### A. Metadata Section
```html
<div style="background: #ecf0f1; padding: 15px; border-radius: 5px; margin-bottom: 30px; text-align: center;">
    <span style="display: inline-block; margin: 0 15px; font-weight: bold;">📅 Generated: [DATETIME]</span>
    <span style="display: inline-block; margin: 0 15px; font-weight: bold;">📊 Total Archetypes Tracked: [COUNT]</span>
</div>
```

#### B. Overview Cards Grid (3-Column)
```html
<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px;">
    <!-- Card 1: Archetype Overview -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1);">
        <h3 style="margin: 0 0 10px 0; font-size: 1.1em; opacity: 0.9;">📊 Archetype Overview</h3>
        <div style="font-size: 2.5em; font-weight: bold; margin: 10px 0;">[TOTAL_ARCHETYPES]</div>
        <div style="font-size: 0.85em; opacity: 0.9; margin-top: 15px; text-align: left;">
            <strong>Top 3 by Count:</strong><br>
            [ARCHETYPE_NAME]: [COUNT]x<br>
            ...<br>
            <strong>Top 3 by Avg Placement:</strong><br>
            [ARCHETYPE_NAME]: [AVG_PLACEMENT]<br>
            ...
        </div>
    </div>
    
    <!-- Card 2: Top 10 Changes -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1);">
        <h3 style="margin: 0 0 10px 0; font-size: 1.1em; opacity: 0.9;">🔄 Top 10 Changes</h3>
        <div style="font-size: 0.85em; opacity: 0.9; margin-top: 10px; text-align: left;">
            <strong style="color: #7fff7f;">⬆ Entries:</strong><br>
            [NEW_ARCHETYPES_IN_TOP_10]<br>
            <strong style="color: #ff6b6b;">⬇ Exits:</strong><br>
            [ARCHETYPES_OUT_OF_TOP_10]
        </div>
    </div>
    
    <!-- Card 3: Data Source -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1);">
        <h3 style="margin: 0 0 10px 0; font-size: 1.1em; opacity: 0.9;">📋 Datenquelle</h3>
        <div style="font-size: 0.85em; opacity: 0.9; margin-top: 10px;">
            <strong>Zeitraum:</strong><br>[DATE_RANGE]<br>
            <strong>Turniere:</strong><br>[TOURNAMENT_COUNT]
        </div>
    </div>
</div>
```

#### C. Popularity Decreases Table (conditional - shown if decreased.length > 0)
```html
<div style="margin-bottom: 40px;">
    <h2 style="color: #34495e; border-bottom: 3px solid #3498db; padding-bottom: 10px; margin-bottom: 20px;">📉 Popularity Decreases</h2>
    <table style="width: 100%; border-collapse: collapse; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <thead>
            <tr style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                <th style="padding: 12px; text-align: left; font-weight: 600;">Archetype</th>
                <th style="padding: 12px; text-align: center; font-weight: 600;">Old Count</th>
                <th style="padding: 12px; text-align: center; font-weight: 600;">New Count</th>
                <th style="padding: 12px; text-align: center; font-weight: 600;">Change</th>
                <th style="padding: 12px; text-align: center; font-weight: 600;">Avg Placement</th>
            </tr>
        </thead>
        <tbody>
            <!-- Rows: Top 10 decreased archetypes -->
            <tr style="border-bottom: 1px solid #ecf0f1;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background=''">
                <td style="padding: 12px; font-weight: bold;">[ARCHETYPE]</td>
                <td style="padding: 12px; text-align: center;">[OLD_COUNT]</td>
                <td style="padding: 12px; text-align: center;">[NEW_COUNT]</td>
                <td style="padding: 12px; text-align: center; color: #e74c3c; font-weight: bold;">[CHANGE]</td>
                <td style="padding: 12px; text-align: center;">[NEW_AVG_PLACEMENT] <span style="color: [PLACEMENT_COLOR]; font-weight: bold;">([PLACEMENT_CHANGE])</span></td>
            </tr>
        </tbody>
    </table>
</div>
```

#### D. Performance Improvers Table (conditional - shown if improvers.length > 0)
```html
<div style="margin-bottom: 40px;">
    <h2 style="color: #34495e; border-bottom: 3px solid #3498db; padding-bottom: 10px; margin-bottom: 20px;">⭐ Performance Improvers (Better Avg Placement)</h2>
    <table style="width: 100%; border-collapse: collapse; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <thead>
            <tr style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                <th style="padding: 12px; text-align: left; font-weight: 600;">Archetype</th>
                <th style="padding: 12px; text-align: center; font-weight: 600;">Count</th>
                <th style="padding: 12px; text-align: center; font-weight: 600;">Old Avg</th>
                <th style="padding: 12px; text-align: center; font-weight: 600;">New Avg</th>
                <th style="padding: 12px; text-align: center; font-weight: 600;">Improvement</th>
                <th style="padding: 12px; text-align: center; font-weight: 600;">Best Placement</th>
            </tr>
        </thead>
        <tbody>
            <!-- Rows: Top 10 improver archetypes -->
            <tr style="border-bottom: 1px solid #ecf0f1;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background=''">
                <td style="padding: 12px; font-weight: bold;">[ARCHETYPE]</td>
                <td style="padding: 12px; text-align: center;">[NEW_COUNT]</td>
                <td style="padding: 12px; text-align: center;">[OLD_AVG_PLACEMENT]</td>
                <td style="padding: 12px; text-align: center;">[NEW_AVG_PLACEMENT]</td>
                <td style="padding: 12px; text-align: center; color: #27ae60; font-weight: bold;">-[IMPROVEMENT]</td>
                <td style="padding: 12px; text-align: center;">[NEW_BEST]</td>
            </tr>
        </tbody>
    </table>
</div>
```

#### E. Performance Decliners Table (conditional - shown if decliners.length > 0)
```html
<div style="margin-bottom: 40px;">
    <h2 style="color: #34495e; border-bottom: 3px solid #3498db; padding-bottom: 10px; margin-bottom: 20px;">📉 Performance Decliners (Worse Avg Placement)</h2>
    <table style="width: 100%; border-collapse: collapse; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <thead>
            <tr style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                <th style="padding: 12px; text-align: left; font-weight: 600;">Archetype</th>
                <th style="padding: 12px; text-align: center; font-weight: 600;">Count</th>
                <th style="padding: 12px; text-align: center; font-weight: 600;">Old Avg</th>
                <th style="padding: 12px; text-align: center; font-weight: 600;">New Avg</th>
                <th style="padding: 12px; text-align: center; font-weight: 600;">Decline</th>
                <th style="padding: 12px; text-align: center; font-weight: 600;">Best Placement</th>
            </tr>
        </thead>
        <tbody>
            <!-- Rows: Top 10 decliner archetypes -->
            <tr style="border-bottom: 1px solid #ecf0f1;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background=''">
                <td style="padding: 12px; font-weight: bold;">[ARCHETYPE]</td>
                <td style="padding: 12px; text-align: center;">[NEW_COUNT]</td>
                <td style="padding: 12px; text-align: center;">[OLD_AVG_PLACEMENT]</td>
                <td style="padding: 12px; text-align: center;">[NEW_AVG_PLACEMENT]</td>
                <td style="padding: 12px; text-align: center; color: #e74c3c; font-weight: bold;">+[DECLINE]</td>
                <td style="padding: 12px; text-align: center;">[NEW_BEST]</td>
            </tr>
        </tbody>
    </table>
</div>
```

#### F. Full Comparison Table (Top 30)
```html
<div style="margin-bottom: 40px;">
    <h2 style="color: #34495e; border-bottom: 3px solid #3498db; padding-bottom: 10px; margin-bottom: 20px;">📋 Full Comparison Table (Top 30)</h2>
    <table style="width: 100%; border-collapse: collapse; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <thead>
            <tr style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                <th style="padding: 12px; text-align: left; font-weight: 600;">Archetype</th>
                <th style="padding: 12px; text-align: center; font-weight: 600;">Trend</th>
                <th style="padding: 12px; text-align: center; font-weight: 600;">Count Old</th>
                <th style="padding: 12px; text-align: center; font-weight: 600;">Count New</th>
                <th style="padding: 12px; text-align: center; font-weight: 600;">Count Δ</th>
                <th style="padding: 12px; text-align: center; font-weight: 600;">Avg Placement</th>
            </tr>
        </thead>
        <tbody>
            <!-- Rows: Top 30 archetypes sorted by new_count (descending) -->
            <tr style="border-bottom: 1px solid #ecf0f1;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background=''">
                <td style="padding: 12px; font-weight: bold;">[ARCHETYPE]</td>
                <td style="padding: 12px; text-align: center; font-size: 1.2em; color: [TREND_COLOR]; font-weight: bold;">[TREND_ARROW]</td>
                <td style="padding: 12px; text-align: center;">[OLD_COUNT]</td>
                <td style="padding: 12px; text-align: center;">[NEW_COUNT]</td>
                <td style="padding: 12px; text-align: center; color: [CHANGE_COLOR]; font-weight: bold;">([COUNT_CHANGE])</td>
                <td style="padding: 12px; text-align: center;">[NEW_AVG_PLACEMENT]</td>
            </tr>
        </tbody>
    </table>
</div>
```

---

## 2. CSS STYLES FOR CITY LEAGUE

### Container Styles
```css
.container {
    max-width: 1400px;
    margin: 0 auto;
    background: white;
    border-radius: 15px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    overflow: hidden;
}

.header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 30px;
    text-align: center;
}

.header h1 {
    font-size: 2.5em;
    margin-bottom: 10px;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
}
```

### Table Styles
```css
table {
    width: 100%;
    border-collapse: collapse;
}

thead {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
}

th {
    padding: 15px;
    text-align: left;
    font-weight: 600;
}

td {
    padding: 12px 15px;
    border-bottom: 1px solid #f0f0f0;
}

tbody tr:hover {
    background: #f8f9fa;
}
```

### Status & Trend Color Scheme
```css
/* Trend Colors */
.trend.improved { color: #27ae60; }    /* Green for ↑ VERBESSERT */
.trend.declined { color: #e67e22; }    /* Orange for ↓ VERSCHLECHTERT */
.trend.stable { color: #95a5a6; }      /* Gray for → STABIL */

/* Change Colors */
.change.positive { color: #27ae60; }   /* Green for positive changes */
.change.negative { color: #e74c3c; }   /* Red for negative changes */
```

### Grid & Card Styles
```css
.overview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
}

.stat-card {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 20px;
    border-radius: 10px;
    box-shadow: 0 5px 15px rgba(0,0,0,0.1);
}

.stat-card h3 {
    margin: 0 0 10px 0;
    font-size: 1.1em;
    opacity: 0.9;
}

.stat-card .value {
    font-size: 2.5em;
    font-weight: bold;
    margin: 10px 0;
}
```

---

## 3. JAVASCRIPT FUNCTIONS

### Main Function: Load City League Data
```javascript
async function loadCityLeagueData() {
    try {
        const timestamp = new Date().getTime();
        const response = await fetch(`${BASE_PATH}data/city_league_archetypes_comparison.csv?t=${timestamp}`);
        if (response.ok) {
            const text = await response.text();
            cityLeagueData = parseCSV(text);
            console.log('Loaded City League development - Entries:', cityLeagueData.length);
            
            // Load tournament count and date range from main archetype CSV
            let tournamentCount = 0;
            let dateRange = '';
            try {
                const tournamentsResponse = await fetch(`${BASE_PATH}data/city_league_archetypes.csv?t=${timestamp}`);
                if (tournamentsResponse.ok) {
                    const tournamentsText = await tournamentsResponse.text();
                    const tournamentsData = parseCSV(tournamentsText);
                    const uniqueTournaments = new Set(tournamentsData.map(d => d.tournament_id));
                    tournamentCount = uniqueTournaments.size;
                    
                    // Extract date range with proper date parsing
                    if (tournamentsData.length > 0) {
                        const dates = tournamentsData.map(d => d.date).filter(d => d);
                        if (dates.length > 0) {
                            const parsedDates = dates.map(d => {
                                const parts = d.split(' ');
                                if (parts.length >= 3) {
                                    const day = parts[0];
                                    const month = parts[1];
                                    const year = parts[2];
                                    const monthMap = {'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06', 
                                                      'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'};
                                    const monthNum = monthMap[month] || '01';
                                    const fullYear = '20' + year;
                                    return {original: d, comparable: fullYear + monthNum + day.padStart(2, '0')};
                                }
                                return {original: d, comparable: '99999999'};
                            });
                            
                            const minDateObj = parsedDates.reduce((a, b) => a.comparable < b.comparable ? a : b);
                            const maxDateObj = parsedDates.reduce((a, b) => a.comparable > b.comparable ? a : b);
                            
                            dateRange = `${minDateObj.original} - ${maxDateObj.original}`;
                        }
                    }
                }
            } catch (e) {
                console.warn('Could not load tournament data:', e);
            }
            
            renderCityLeagueTable(tournamentCount, dateRange);
        } else {
            console.warn('City League development data not found - generating from cardsData');
            generateCityLeagueDataFallback();
        }
    } catch (error) {
        console.error('Error loading City League data:', error);
        generateCityLeagueDataFallback();
    }
}
```

### Render Function: Build HTML from Data
```javascript
function renderCityLeagueTable(tournamentCount = 0, dateRange = '') {
    const content = document.getElementById('cityLeagueContent');
    if (!content || !cityLeagueData || cityLeagueData.length === 0) return;

    // Separate data by status and trend
    const newArchetypes = cityLeagueData.filter(d => d.status === 'NEU');
    const disappeared = cityLeagueData.filter(d => d.status === 'VERSCHWUNDEN');
    const increased = cityLeagueData.filter(d => d.status !== 'NEU' && parseInt(d.count_change) > 0)
        .sort((a, b) => parseInt(b.count_change) - parseInt(a.count_change));
    const decreased = cityLeagueData.filter(d => parseInt(d.count_change) < 0)
        .sort((a, b) => parseInt(a.count_change) - parseInt(b.count_change));
    
    // Get max count for threshold filtering
    const maxCountForThreshold = Math.max(...cityLeagueData.map(d => parseInt(d.new_count)));
    const countThreshold = maxCountForThreshold * 0.1;
    
    // Performance improvers/decliners (better/worse avg placement) - with 10% threshold
    const improvers = cityLeagueData
        .filter(d => parseFloat(d.avg_placement_change) < 0 && parseInt(d.new_count) >= countThreshold)
        .sort((a, b) => parseFloat(a.avg_placement_change) - parseFloat(b.avg_placement_change));
    
    const decliners = cityLeagueData
        .filter(d => parseFloat(d.avg_placement_change) > 0 && parseInt(d.new_count) >= countThreshold)
        .sort((a, b) => parseFloat(b.avg_placement_change) - parseFloat(a.avg_placement_change));
    
    // Most active (by count)
    const sorted = [...cityLeagueData].sort((a, b) => parseInt(b.new_count) - parseInt(a.new_count));
    const totalArchetypes = cityLeagueData.length;

    // Generate timestamp
    const now = new Date();
    const generatedDate = now.toLocaleString('de-DE', { 
        year: 'numeric', month: '2-digit', day: '2-digit', 
        hour: '2-digit', minute: '2-digit', second: '2-digit' 
    });

    // Get top 3 by count and top 3 by avg placement
    const topByCount = [...cityLeagueData]
        .sort((a, b) => parseInt(b.new_count) - parseInt(a.new_count))
        .slice(0, 3);
    
    const maxCount = parseInt(topByCount[0].new_count);
    const minCountThreshold = maxCount * 0.1;
    const topByPlacement = [...cityLeagueData]
        .filter(d => parseInt(d.new_count) >= minCountThreshold)
        .sort((a, b) => parseFloat(a.new_avg_placement) - parseFloat(b.new_avg_placement))
        .slice(0, 3);
    
    // Get top 10 changes
    const top10New = [...cityLeagueData]
        .sort((a, b) => parseInt(b.new_count) - parseInt(a.new_count))
        .slice(0, 10)
        .map(d => d.archetype);
    const top10Old = [...cityLeagueData]
        .sort((a, b) => parseInt(b.old_count) - parseInt(a.old_count))
        .slice(0, 10)
        .map(d => d.archetype);
    
    const entries = top10New.filter(arch => !top10Old.includes(arch));
    const exits = top10Old.filter(arch => !top10New.includes(arch));

    // Build HTML (see complete HTML structure above)
    let html = `
        <!-- Metadata section -->
        <!-- Overview cards -->
        <!-- Conditional tables based on data availability -->
        <!-- Full comparison table -->
    `;
    
    content.innerHTML = html;
}
```

### Tab Switching Function
```javascript
function switchTab(tabName) {
    // Hide all tabs
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.classList.remove('active'));
    
    // Deactivate all buttons
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    // Show selected tab
    const selectedTab = document.getElementById(tabName);
    if (selectedTab) {
        selectedTab.classList.add('active');
        
        // Load Limitless comparison if needed
        if (tabName === 'limitless-online') {
            loadLimitlessComparison();
        }
    }
    
    // Activate corresponding button
    const activeBtn = Array.from(buttons).find(btn => 
        btn.getAttribute('onclick')?.includes(tabName)
    );
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
}
```

---

## 4. DATA STRUCTURE EXPECTED

### Cities League CSV Columns (city_league_archetypes_comparison.csv)

```
archetype              | Deck name/archetype
status                 | "NEU" | "BESTEHEND" | "VERSCHWUNDEN"
trend                  | "VERBESSERT" | "VERSCHLECHTERT" | "STABIL"
old_count              | Number of occurrences in previous period
new_count              | Number of occurrences in current period
count_change           | Difference (new - old)
old_avg_placement      | Previous average placement
new_avg_placement      | Current average placement
avg_placement_change   | Difference (new - old), lower is better
old_best               | Best placement in previous period
new_best               | Best placement in current period
```

### Tournament Data CSV Columns (city_league_archetypes.csv)

```
tournament_id          | Unique tournament identifier
date                   | Format: "DD Mon YY" (e.g., "15 Feb 26")
archetype              | Deck archetype name
count                  | Number of decklists
avg_placement          | Average placement
best_placement         | Best placement
```

---

## 5. KEY FEATURES & LOGIC

### Data Processing Steps:
1. **Load comparison CSV** → Parse into `cityLeagueData` global array
2. **Load tournaments CSV** → Extract unique tournament count and date range
3. **Filter data** into categories:
   - New archetypes (status = "NEU")
   - Disappeared archetypes (status = "VERSCHWUNDEN")
   - Increased popularity (count_change > 0)
   - Decreased popularity (count_change < 0)
   - Performance improvers (avg_placement_change < 0, count >= 10% threshold)
   - Performance decliners (avg_placement_change > 0, count >= 10% threshold)
4. **Calculate statistics**:
   - Total archetype count
   - Top 3 by count, Top 3 by placement
   - Top 10 entries/exits
5. **Render sections** (conditional on data availability):
   - Metadata & overview cards (always shown)
   - Popularity Decreases table (if decreased.length > 0)
   - Performance Improvers table (if improvers.length > 0)
   - Performance Decliners table (if decliners.length > 0)
   - Full Comparison table (Top 30, always shown)

### Color Coding:
- **Trend Arrow Colors**:
  - ↑ Green (#27ae60) = VERBESSERT
  - ↓ Orange (#e67e22) = VERSCHLECHTERT
  - → Gray (#95a5a6) = STABIL
- **Change Colors**:
  - Green = Positive (more appearances, better placement)
  - Red = Negative (fewer appearances, worse placement)
- **Placement Colors** (in avg placement column):
  - Green = Placement improved
  - Red = Placement worsened

### Interactive Features:
- Row hover effect: Changes background to light gray (#f8f9fa)
- Generated timestamp (German locale)
- Responsive grid layout (min 300px cards, auto-fill)
- Sorted data (decreases, improvers, decliners by magnitude; full comparison by count)

---

## 6. REPLICATION CHECKLIST

To replicate this exact layout in another HTML file:

- [ ] Add CSS styles for `.container`, `.header`, `table`, `th`, `td`
- [ ] Add CSS for `.stat-card` gradient background styling
- [ ] Create `#city-league` div with `tab-content` class
- [ ] Create `#cityLeagueContent` container inside
- [ ] Implement `loadCityLeagueData()` async function
- [ ] Implement `renderCityLeagueTable()` function with all conditional sections
- [ ] Implement `parseCSV()` utility function
- [ ] Set up global `cityLeagueData` array
- [ ] Populate table rows with proper color coding based on `trend` and `count_change` fields
- [ ] Ensure date parsing logic handles "DD Mon YY" format correctly
- [ ] Add hover effects and interactive styling to table rows
- [ ] Test with actual CSV data from `data/city_league_archetypes_comparison.csv`
