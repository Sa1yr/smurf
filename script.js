document.addEventListener('DOMContentLoaded', () => {
    
    // --- Global-like references ---
    const gameNameInput = document.getElementById('gameNameInput');
    const tagLineInput = document.getElementById('tagLineInput');
    const regionSelect = document.getElementById('regionSelect');
    const searchButton = document.getElementById('searchButton');
    const statsBox = document.getElementById('statsBox');
    const masteryBox = document.getElementById('masteryBox');
    const legendBox = document.getElementById('legendBox');

    let currentMasteryData = []; // Store mastery data for sorting
    let masterySortState = 'level_desc'; // NEW: 4-state sort
    
    // Store the analyzePlayer function globally to make it clickable from generated HTML
    window.currentAnalysis = {
        analyzePlayer: analyzePlayer
    };

    // --- Event Listeners ---
    searchButton.addEventListener('click', () => analyzePlayer());
    gameNameInput.addEventListener('keypress', (e) => e.key === 'Enter' && analyzePlayer());
    tagLineInput.addEventListener('keypress', (e) => e.key === 'Enter' && analyzePlayer());

    // --- Helper Functions ---

    function getOpGgRegion(platformId) {
        const regionMap = {
            'na1': 'na', 'euw1': 'euw', 'eun1': 'eune', 'kr': 'kr', 'br1': 'br',
            'jp1': 'jp', 'la1': 'lan', 'la2': 'las', 'oc1': 'oce', 'tr1': 'tr', 'ru': 'ru'
        };
        return regionMap[platformId.toLowerCase()] || 'na';
    }

    function buildOpGgLink(gameName, tagLine, region) {
        const opGgRegion = getOpGgRegion(region);
        const formattedName = `${gameName}-${tagLine}`; // Correct op.gg format
        return `https://op.gg/summoners/${opGgRegion}/${encodeURIComponent(formattedName)}`;
    }
    
    // Helper to create a stat's visual block
    function createStatDisplay(value, highlight) {
        const asterisk = highlight === 'red' ? ' *' : '';
        return `<span class="stat-${highlight}">${value}${asterisk}</span>`;
    }

    // --- Main Search Function ---
    async function analyzePlayer(customName, customTag, customRegion) {
        const gameName = customName || gameNameInput.value.trim();
        const tagLine = customTag || tagLineInput.value.trim();
        const region = customRegion || regionSelect.value;
        
        if (customName) {
            gameNameInput.value = customName;
            tagLineInput.value = customTag;
            regionSelect.value = customRegion;
        }

        if (!gameName || !tagLine) {
            statsBox.innerHTML = '<p class="error">Please enter both a Game Name and a Tagline.</p>';
            masteryBox.innerHTML = '';
            legendBox.style.display = 'none';
            return;
        }

        statsBox.innerHTML = '<p class="loading">Analyzing recent matches...</p>';
        masteryBox.innerHTML = '<p class="loading">Fetching champion mastery...</p>';
        legendBox.style.display = 'none';

        try {
            const response = await fetch(`/api/analyze?name=${gameName}&tag=${tagLine}&region=${region}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'An unknown error occurred.');
            }

            renderStatsBox(data, region);
            renderMasteryBox(data.mastery);
            renderLegendBox(data.highlights); // Pass highlights to legend

        } catch (error) {
            statsBox.innerHTML = `<p class="error"><strong>Error:</strong> ${error.message}</p>`;
            masteryBox.innerHTML = '';
            legendBox.style.display = 'none';
            console.error(error);
        }
    }

    // --- UPDATED: Function to render the stats box ---
    function renderStatsBox(data, region) {
        const playerLink = buildOpGgLink(data.searchedPlayer.gameName, data.searchedPlayer.tagLine, region);
        
        // --- Create all stat display elements ---
        
        // This correctly displays the "Unranked" or "GOLD IV (20 LP)" string from the API
        const currentRankDisplay = createStatDisplay(data.currentRank, 'neutral');

        const totalRankDisplay = createStatDisplay(data.totalRank.display, data.highlights.totalWinRate);
        const profileIconDisplay = createStatDisplay(data.profileIcon.isDefault ? "Yes" : "No", data.highlights.profileIcon);
        const flashDisplay = createStatDisplay(data.flashKey, data.highlights.flash);
        const multiKillDisplay = createStatDisplay(data.multiKills, data.highlights.multiKills);
        
        // Stats from 20 recent ranked games
        const recentWinRateDisplay = createStatDisplay(`${data.recentWinRate.toFixed(1)}% (${data.wins}W - ${data.losses}L)`, 'neutral');
        const avgKdaDisplay = createStatDisplay(data.avgKDA.toFixed(2), 'neutral');
        const avgDpmDisplay = createStatDisplay(data.avgDPM.toFixed(0), data.highlights.dpm);
        const avgCspmDisplay = createStatDisplay(data.avgCSPM.toFixed(1), data.highlights.cspm);
        const avgKpDisplay = createStatDisplay(data.avgKP.toFixed(1) + '%', data.highlights.kp);

        // Build the Duo Partner list
        let duoHtml = '<strong>Duo Partners (>= 3 games):</strong>';
        if (data.duoList.length === 0) {
            duoHtml += "<p style='margin:0; padding-left:10px;'>None found.</p>";
        } else {
            duoHtml += '<ul>';
            for (const duo of data.duoList) {
                const [duoName, duoTag] = duo.name.split('#');
                const reSearchLink = `window.currentAnalysis.analyzePlayer('${duoName}', '${duoTag}', '${region}')`;
                const opggLink = buildOpGgLink(duoName, duoTag, region);
                
                duoHtml += `
                    <li>
                        <a href="#" onclick="${reSearchLink}" class="duo-link">${duo.name}</a>
                        (${duo.games} games)
                        <a href="${opggLink}" target="_blank" class="opgg-link">[op.gg]</a>
                    </li>
                `;
            }
            duoHtml += '</ul>';
        }

        // Display final stats
        statsBox.innerHTML = `
            <div class="result-item">
                <strong>Player:</strong>
                <span class="result-value">
                    <span>${data.searchedPlayer.gameName}#${data.searchedPlayer.tagLine}</span>
                    <a href="${playerLink}" target="_blank" class="opgg-link">[op.gg]</a>
                </span>
            </div>
            <div class="result-item"><strong>Account Level:</strong> <span class="result-value">${data.accountLevel}</span></div>
            <div class="result-item"><strong>Default Icon:</strong> <span class="result-value">${profileIconDisplay}</span></div>
            <hr>
            <div class="result-item"><strong>Current Rank:</strong> <span class="result-value">${currentRankDisplay}</span></div>
            <div class="result-item"><strong>Total Ranked:</strong> <span class="result-value">${totalRankDisplay}</span></div>
            <hr>
            <div class="result-item"><strong>Recent 20 (Ranked):</strong> <span class="result-value">${recentWinRateDisplay}</span></div>
            <div class="result-item"><strong>Recent KDA:</strong> <span class="result-value">${avgKdaDisplay}</span></div>
            <div class="result-item"><strong>Recent DPM:</strong> <span class="result-value">${avgDpmDisplay}</span></div>
            <div class="result-item"><strong>Recent CSPM:</strong> <span class="result-value">${avgCspmDisplay}</span></div>
            <div class="result-item"><strong>Recent KP:</strong> <span class="result-value">${avgKpDisplay}</span></div>
            <div class="result-item"><strong>Multi-kills:</strong> <span class="result-value">${multiKillDisplay}</span></div>
            <div class="result-item"><strong>Flash on:</strong> <span class="result-value">${flashDisplay}</span></div>
            <hr>
            <div class="result-item">${duoHtml}</div>
        `;
    }

    // --- UPDATED: Function to render the mastery box ---
    function renderMasteryBox(masteryData) {
        if (!masteryData) {
            masteryBox.innerHTML = '<h3>Champion Mastery</h3><p>No mastery data found.</p>';
            return;
        }

        currentMasteryData = masteryData; // Save for sorting
        masterySortState = 'level_desc'; // Default sort (High-Low)

        masteryBox.innerHTML = `
            <h3>Champion Mastery (All)</h3>
            <div class="mastery-controls">
                <input type="text" id="masterySearch" placeholder="Search champions...">
                <button id="masterySortButton">Sort Low-High</button>
            </div>
            <div id="masteryList"></div>
        `;

        drawMasteryList(); // Initial draw (already sorted High-Low from API)

        document.getElementById('masterySearch').addEventListener('keyup', (e) => {
            drawMasteryList(e.target.value.toLowerCase());
        });

        // --- NEW: 4-State Sort Logic ---
        document.getElementById('masterySortButton').addEventListener('click', () => {
            const button = document.getElementById('masterySortButton');
            
            if (masterySortState === 'level_desc') {
                masterySortState = 'level_asc';
                button.textContent = 'Sort A-Z';
                currentMasteryData.sort((a, b) => a.points - b.points); // Low-High
            } else if (masterySortState === 'level_asc') {
                masterySortState = 'alpha_asc';
                button.textContent = 'Sort Z-A';
                currentMasteryData.sort((a, b) => a.name.localeCompare(b.name)); // A-Z
            } else if (masterySortState === 'alpha_asc') {
                masterySortState = 'alpha_desc';
                button.textContent = 'Sort High-Low';
                currentMasteryData.sort((a, b) => b.name.localeCompare(a.name)); // Z-A
            } else { // 'alpha_desc'
                masterySortState = 'level_desc';
                button.textContent = 'Sort Low-High';
                currentMasteryData.sort((a, b) => b.points - a.points); // High-Low
            }
            
            drawMasteryList(document.getElementById('masterySearch').value);
        });
    }

    function drawMasteryList(searchTerm = '') {
        const listElement = document.getElementById('masteryList');
        if (!listElement) return; // Guard clause
        
        let masteryHtml = '';

        for (const champ of currentMasteryData) {
            if (champ.name.toLowerCase().includes(searchTerm)) {
                let masteryClass = 'mastery-0';
                if (champ.level === 1) {
                    masteryClass = 'mastery-1';
                } else if (champ.level > 1) {
                    masteryClass = 'mastery-high';
                }
                
                const pointsDisplay = champ.points.toLocaleString();
                const asterisk = champ.level === 0 ? " *" : ""; // Add asterisk for 0 mastery

                masteryHtml += `
                    <div class="mastery-item ${masteryClass}" data-champ-name="${champ.name.toLowerCase()}">
                        <span>${champ.name}${asterisk}</span>
                        <span>Level ${champ.level} (${pointsDisplay} pts)</span>
                    </div>
                `;
            }
        }
        listElement.innerHTML = masteryHtml;
    }

    // --- NEW: Function to render the legend box ---
    function renderLegendBox(highlights) {
        let legendHtml = '<h3>* Potential Smurf Indicators</h3>';
        let items = 0;

        // Check all highlights. If any are 'red', we add the legend.
        const hasRedStat = Object.values(highlights).some(value => value === 'red');

        if (hasRedStat) {
            legendHtml += `
                <div class="legend-item">
                    <div class="legend-color-box stat-red" style="background-color: #4a2d2d;"></div>
                    <span><b>High Stats / Inconsistency:</b> One or more stats (Win Rate, DPM, KP, Flash Key) are significant outliers, which can indicate a smurf, a shared, or a boosted account.</span>
                </div>
            `;
            items++;
        }
        
        legendHtml += `
            <div class="legend-item">
                <div class="legend-color-box mastery-0" style="background-color: #4a2d2d;"></div>
                <span><b>Mastery 0:</b> Player has no mastery on this champion. High performance on a 0-mastery champ is a potential smurf indicator for tournament play.</span>
            </div>
        `;
        items++;

        legendBox.innerHTML = legendHtml;
        legendBox.style.display = 'block';
    }
});
