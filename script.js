document.addEventListener('DOMContentLoaded', () => {
    
    // --- Global-like references ---
    const gameNameInput = document.getElementById('gameNameInput');
    const tagLineInput = document.getElementById('tagLineInput');
    const regionSelect = document.getElementById('regionSelect');
    const searchButton = document.getElementById('searchButton');
    const statsBox = document.getElementById('statsBox');
    const masteryBox = document.getElementById('masteryBox');
    const legendBox = document.getElementById('legendBox'); // <-- NEW

    let currentMasteryData = []; // Store mastery data for sorting
    let masterySortState = 'level'; // 'level' or 'alpha'

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
        // Correct format: {name}-{tag}
        const formattedName = `${gameName}-${tagLine}`;
        return `https://op.gg/summoners/${opGgRegion}/${encodeURIComponent(formattedName)}`;
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
        legendBox.style.display = 'none'; // Hide legend during load

        try {
            const response = await fetch(`/api/analyze?name=${gameName}&tag=${tagLine}&region=${region}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'An unknown error occurred.');
            }

            renderStatsBox(data, region);
            renderMasteryBox(data.mastery);
            renderLegendBox(data); // <-- NEW

        } catch (error) {
            statsBox.innerHTML = `<p class="error"><strong>Error:</strong> ${error.message}</p>`;
            masteryBox.innerHTML = '';
            legendBox.style.display = 'none';
            console.error(error);
        }
    }

    // --- NEW: Function to render the stats box ---
    function renderStatsBox(data, region) {
        const playerLink = buildOpGgLink(data.searchedPlayer.gameName, data.searchedPlayer.tagLine, region);
        
        let flashClass = "";
        let flashAsterisk = "";
        if (data.flashKey === "D & F") {
            flashClass = "flash-inconsistent"; // Red
            flashAsterisk = " *"; // Add asterisk
        } else if (data.flashKey === "D" || data.flashKey === "F") {
            flashClass = "flash-consistent"; // Green
        }
        const flashDisplay = `<span class="${flashClass}">${data.flashKey}${flashAsterisk}</span>`;

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

        statsBox.innerHTML = `
            <div class="result-item">
                <strong>Player:</strong>
                <span>${data.searchedPlayer.gameName}#${data.searchedPlayer.tagLine}</span>
                <a href="${playerLink}" target="_blank" class="opgg-link">[op.gg]</a>
            </div>
            <div class="result-item"><strong>Account Level:</strong> ${data.accountLevel}</div>
            <div class="result-item"><strong>Current Rank:</strong> ${data.currentRank}</div>
            <hr>
            <div class="result-item"><strong>Analyzed:</strong> ${data.totalGames} matches</div>
            <div class="result-item"><strong>Win Rate:</strong> ${data.winRate.toFixed(1)}% (${data.wins}W - ${data.losses}L)</div>
            <div class="result-item"><strong>Average KDA:</strong> ${data.avgKDA.toFixed(2)} (${data.avgKills.toFixed(1)} / ${data.avgDeaths.toFixed(1)} / ${data.avgAssists.toFixed(1)})</div>
            <div class="result-item"><strong>Flash on:</strong> ${flashDisplay}</div>
            <hr>
            <div class="result-item">${duoHtml}</div>
        `;
    }

    // --- NEW: Function to render the mastery box ---
    function renderMasteryBox(masteryData) {
        if (!masteryData) {
            masteryBox.innerHTML = '<h3>Champion Mastery</h3><p>No mastery data found.</p>';
            return;
        }

        currentMasteryData = masteryData; // Save for sorting
        masterySortState = 'level'; // Default sort

        masteryBox.innerHTML = `
            <h3>Champion Mastery</h3>
            <div class="mastery-controls">
                <input type="text" id="masterySearch" placeholder="Search champions...">
                <button id="masterySortButton">Sort A-Z</button>
            </div>
            <div id="masteryList"></div>
        `;

        drawMasteryList(); // Initial draw

        // Add event listener for the new search bar
        document.getElementById('masterySearch').addEventListener('keyup', (e) => {
            drawMasteryList(e.target.value.toLowerCase());
        });

        // Add event listener for the sort button
        document.getElementById('masterySortButton').addEventListener('click', () => {
            const button = document.getElementById('masterySortButton');
            if (masterySortState === 'level') {
                masterySortState = 'alpha';
                button.textContent = 'Sort by Mastery';
                currentMasteryData.sort((a, b) => a.name.localeCompare(b.name));
            } else {
                masterySortState = 'level';
                button.textContent = 'Sort A-Z';
                currentMasteryData.sort((a, b) => b.points - a.points);
            }
            drawMasteryList(document.getElementById('masterySearch').value);
        });
    }

    // --- NEW: Helper to draw/redraw the mastery list ---
    function drawMasteryList(searchTerm = '') {
        const listElement = document.getElementById('masteryList');
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
    function renderLegendBox(data) {
        let legendHtml = '<h3>Legend</h3>';
        let items = 0;

        if (data.flashKey === "D & F") {
            legendHtml += `
                <div class="legend-item">
                    <div class="legend-color-box flash-inconsistent" style="background-color: #4a2d2d;"></div>
                    <span><b>Inconsistent Flash:</b> Player uses D and F for Flash. Potential smurf / shared account indicator.</span>
                </div>
            `;
            items++;
        }

        // Always show the mastery 0 legend
        legendHtml += `
            <div class="legend-item">
                <div class="legend-color-box mastery-0" style="background-color: #4a2d2d;"></div>
                <span><b>Mastery 0:</b> Player has no mastery on this champion. High performance on a 0-mastery champ is a potential smurf indicator.</span>
            </div>
        `;
        items++;

        if (items > 0) {
            legendBox.innerHTML = legendHtml;
            legendBox.style.display = 'block';
        } else {
            legendBox.style.display = 'none';
        }
    }
});
