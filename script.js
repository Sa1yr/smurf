document.addEventListener('DOMContentLoaded', () => {
    
    const gameNameInput = document.getElementById('gameNameInput');
    const tagLineInput = document.getElementById('tagLineInput');
    const regionSelect = document.getElementById('regionSelect');
    const searchButton = document.getElementById('searchButton');
    const statsBox = document.getElementById('statsBox');
    const masteryBox = document.getElementById('masteryBox');
    const legendBox = document.getElementById('legendBox');

    let currentMasteryData = [];
    let masterySortState = 'level_desc';
    
    window.currentAnalysis = {
        analyzePlayer: analyzePlayer
    };

    searchButton.addEventListener('click', () => analyzePlayer());
    gameNameInput.addEventListener('keypress', (e) => e.key === 'Enter' && analyzePlayer());
    tagLineInput.addEventListener('keypress', (e) => e.key === 'Enter' && analyzePlayer());

    function getOpGgRegion(platformId) {
        const regionMap = {
            'na1': 'na', 'euw1': 'euw', 'eun1': 'eune', 'kr': 'kr', 'br1': 'br',
            'jp1': 'jp', 'la1': 'lan', 'la2': 'las', 'oc1': 'oce', 'tr1': 'tr', 'ru': 'ru'
        };
        return regionMap[platformId.toLowerCase()] || 'na';
    }

    function buildOpGgLink(gameName, tagLine, region) {
        const opGgRegion = getOpGgRegion(region);
        const formattedName = `${gameName}-${tagLine}`;
        return `https://op.gg/summoners/${opGgRegion}/${encodeURIComponent(formattedName)}`;
    }
    
    function createStatDisplay(value, highlight) {
        const asterisk = highlight === 'red' ? ' *' : '';
        if (typeof value === 'string' && value.includes('Error')) {
            highlight = 'red';
        }
        return `<span class="stat-${highlight}">${value}${asterisk}</span>`;
    }

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

        statsBox.innerHTML = '<p class="loading">Analyzing recent matches... (This may take 10-15 seconds)</p>';
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
            renderLegendBox(data.highlights, data);

        } catch (error) {
            statsBox.innerHTML = `<p class="error"><strong>Error:</strong> ${error.message}</p>`;
            masteryBox.innerHTML = '';
            legendBox.style.display = 'none';
            console.error(error);
        }
    }

    function renderStatsBox(data, region) {
        const playerLink = buildOpGgLink(data.searchedPlayer.gameName, data.searchedPlayer.tagLine, region);
        
        // Create stat displays with highlights
        const currentRankDisplay = createStatDisplay(data.currentRank, 'neutral');
        const totalRankDisplay = createStatDisplay(data.totalRank.display, data.highlights.totalWinRate);
        const profileIconDisplay = createStatDisplay(data.profileIcon.isDefault ? "Yes" : "No", data.highlights.profileIcon);
        const flashDisplay = createStatDisplay(data.flashKey, data.highlights.flash);
        const multiKillDisplay = createStatDisplay(data.multiKills, data.highlights.multiKills);
        
        // Recent overall stats
        const recentWinRateDisplay = createStatDisplay(`${data.recentWinRate.toFixed(1)}% (${data.wins}W - ${data.losses}L)`, 'neutral');
        const avgKdaDisplay = createStatDisplay(data.avgKDA.toFixed(2), 'neutral');
        const avgDpmDisplay = createStatDisplay(data.avgDPM.toFixed(0), 'neutral');
        const avgCspmDisplay = createStatDisplay(data.avgCSPM.toFixed(1), 'neutral');
        const avgKpDisplay = createStatDisplay(data.avgKP.toFixed(1) + '%', 'neutral');
        const avgVisionDisplay = createStatDisplay(data.avgVisionScore.toFixed(1), 'neutral');
        const uniqueChampsDisplay = createStatDisplay(data.uniqueChampions, 'neutral');

        // Ranked-only stats
        const rankedWinRateDisplay = createStatDisplay(
            data.rankedGames > 0 ? `${data.rankedWinRate.toFixed(1)}% (${data.rankedWins}W - ${data.rankedLosses}L)` : 'N/A',
            data.highlights.rankedWinRate
        );
        const rankedKdaDisplay = createStatDisplay(
            data.rankedGames > 0 ? data.rankedAvgKDA.toFixed(2) : 'N/A',
            'neutral'
        );
        const rankedDpmDisplay = createStatDisplay(
            data.rankedGames > 0 ? data.rankedAvgDPM.toFixed(0) : 'N/A',
            data.highlights.dpm
        );
        const rankedCspmDisplay = createStatDisplay(
            data.rankedGames > 0 ? data.rankedAvgCSPM.toFixed(1) : 'N/A',
            data.highlights.cspm
        );
        const rankedKpDisplay = createStatDisplay(
            data.rankedGames > 0 ? data.rankedAvgKP.toFixed(1) + '%' : 'N/A',
            data.highlights.kp
        );
        const rankedVisionDisplay = createStatDisplay(
            data.rankedGames > 0 ? data.rankedAvgVisionScore.toFixed(1) : 'N/A',
            data.highlights.visionScore
        );
        const rankedChampsDisplay = createStatDisplay(
            data.rankedGames > 0 ? data.rankedUniqueChampions : 'N/A',
            data.highlights.championPool
        );
        const rankedGamesCountDisplay = createStatDisplay(
            data.rankedGames,
            data.highlights.rankedGamesPlayed
        );

        // Build Duo Partner list
        let duoHtml = '<strong>Duo Partners (Ranked, >= 2 games):</strong>';
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

        // Display final stats with sections
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
            <h3 style="color: #00bfff; margin: 10px 0;">Season Ranked Stats</h3>
            <div class="result-item"><strong>Highest Rank:</strong> <span class="result-value">${currentRankDisplay}</span></div>
            <div class="result-item"><strong>Total Ranked:</strong> <span class="result-value">${totalRankDisplay}</span></div>
            
            <hr>
            <h3 style="color: #00bfff; margin: 10px 0;">Recent 30 Games (All Modes)</h3>
            <div class="result-item"><strong>Win Rate:</strong> <span class="result-value">${recentWinRateDisplay}</span></div>
            <div class="result-item"><strong>KDA:</strong> <span class="result-value">${avgKdaDisplay}</span></div>
            <div class="result-item"><strong>DPM:</strong> <span class="result-value">${avgDpmDisplay}</span></div>
            <div class="result-item"><strong>CSPM:</strong> <span class="result-value">${avgCspmDisplay}</span></div>
            <div class="result-item"><strong>KP:</strong> <span class="result-value">${avgKpDisplay}</span></div>
            <div class="result-item"><strong>Vision Score:</strong> <span class="result-value">${avgVisionDisplay}</span></div>
            <div class="result-item"><strong>Unique Champs:</strong> <span class="result-value">${uniqueChampsDisplay}</span></div>
            
            <hr>
            <h3 style="color: #ffc107; margin: 10px 0;">Recent Ranked Games Only (${data.rankedGames} games) ${rankedGamesCountDisplay}</h3>
            <div class="result-item"><strong>Win Rate:</strong> <span class="result-value">${rankedWinRateDisplay}</span></div>
            <div class="result-item"><strong>KDA:</strong> <span class="result-value">${rankedKdaDisplay}</span></div>
            <div class="result-item"><strong>DPM:</strong> <span class="result-value">${rankedDpmDisplay}</span></div>
            <div class="result-item"><strong>CSPM:</strong> <span class="result-value">${rankedCspmDisplay}</span></div>
            <div class="result-item"><strong>KP:</strong> <span class="result-value">${rankedKpDisplay}</span></div>
            <div class="result-item"><strong>Vision Score:</strong> <span class="result-value">${rankedVisionDisplay}</span></div>
            <div class="result-item"><strong>Unique Champs:</strong> <span class="result-value">${rankedChampsDisplay}</span></div>
            
            <hr>
            <h3 style="color: #00bfff; margin: 10px 0;">Other Indicators</h3>
            <div class="result-item"><strong>Multi-kills (Quad/Penta):</strong> <span class="result-value">${multiKillDisplay}</span></div>
            <div class="result-item"><strong>Flash on:</strong> <span class="result-value">${flashDisplay}</span></div>
            <hr>
            <div class="result-item">${duoHtml}</div>
        `;
    }

    function renderMasteryBox(masteryData) {
        if (!masteryData) {
            masteryBox.innerHTML = '<h3>Champion Mastery</h3><p>No mastery data found.</p>';
            return;
        }

        currentMasteryData = masteryData;
        masterySortState = 'level_desc';

        masteryBox.innerHTML = `
            <h3>Champion Mastery (All)</h3>
            <div class="mastery-controls">
                <input type="text" id="masterySearch" placeholder="Search champions...">
                <button id="masterySortButton">Sort Low-High</button>
            </div>
            <div id="masteryList"></div>
        `;

        drawMasteryList();

        document.getElementById('masterySearch').addEventListener('keyup', (e) => {
            drawMasteryList(e.target.value.toLowerCase());
        });

        document.getElementById('masterySortButton').addEventListener('click', () => {
            const button = document.getElementById('masterySortButton');
            
            if (masterySortState === 'level_desc') {
                masterySortState = 'level_asc';
                button.textContent = 'Sort A-Z';
                currentMasteryData.sort((a, b) => a.points - b.points);
            } else if (masterySortState === 'level_asc') {
                masterySortState = 'alpha_asc';
                button.textContent = 'Sort Z-A';
                currentMasteryData.sort((a, b) => a.name.localeCompare(b.name));
            } else if (masterySortState === 'alpha_asc') {
                masterySortState = 'alpha_desc';
                button.textContent = 'Sort High-Low';
                currentMasteryData.sort((a, b) => b.name.localeCompare(a.name));
            } else {
                masterySortState = 'level_desc';
                button.textContent = 'Sort Low-High';
                currentMasteryData.sort((a, b) => b.points - a.points);
            }
            
            drawMasteryList(document.getElementById('masterySearch').value);
        });
    }

    function drawMasteryList(searchTerm = '') {
        const listElement = document.getElementById('masteryList');
        if (!listElement) return;
        
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
                const asterisk = champ.level === 0 ? " *" : "";

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

    function renderLegendBox(highlights, data) {
        let legendHtml = '<h3>* Potential Smurf Indicators</h3>';
        let items = 0;

        // Check for API errors first
        if (data.currentRank.includes('Error')) {
             legendHtml += `
                <div class="legend-item">
                    <div class="legend-color-box stat-red" style="background-color: #4a2d2d;"></div>
                    <span><b>Rank API Error:</b> ${data.currentRank}. Common causes: 403 (expired API key), 429 (rate limit exceeded).</span>
                </div>
            `;
            items++;
        }

        // Check all highlights
        const hasRedStat = Object.values(highlights).some(value => value === 'red');

        if (hasRedStat) {
            const redStats = [];
            if (highlights.totalWinRate === 'red') redStats.push('Season Win Rate');
            if (highlights.rankedWinRate === 'red') redStats.push('Recent Ranked Win Rate');
            if (highlights.profileIcon === 'red') redStats.push('Default Icon');
            if (highlights.flash === 'red') redStats.push('Flash on D & F');
            if (highlights.multiKills === 'red') redStats.push('Multi-kills');
            if (highlights.dpm === 'red') redStats.push('DPM');
            if (highlights.cspm === 'red') redStats.push('CSPM');
            if (highlights.kp === 'red') redStats.push('Kill Participation');
            if (highlights.visionScore === 'red') redStats.push('Vision Score');
            if (highlights.rankedGamesPlayed === 'red') redStats.push('Low Ranked Games for Rank');
            if (highlights.championPool === 'red') redStats.push('Small Champion Pool');

            legendHtml += `
                <div class="legend-item">
                    <div class="legend-color-box stat-red" style="background-color: #4a2d2d;"></div>
                    <span><b>Suspicious Stats:</b> ${redStats.join(', ')}. These metrics are outliers for this rank tier and may indicate a smurf, boosted, or shared account.</span>
                </div>
            `;
            items++;
        }
        
        legendHtml += `
            <div class="legend-item">
                <div class="legend-color-box mastery-0" style="background-color: #4a2d2d;"></div>
                <span><b>Mastery 0 (*):</b> No mastery on this champion. High performance on zero-mastery champions can indicate a smurf account, especially in competitive play.</span>
            </div>
        `;
        items++;

        // Add explanation of ranked vs all games
        legendHtml += `
            <div class="legend-item">
                <div class="legend-color-box" style="background-color: #333; border: 1px solid #ffc107;"></div>
                <span><b>Ranked vs All Games:</b> "Recent 30 Games" includes normals, ARAM, etc. "Recent Ranked Games Only" shows Solo/Duo and Flex performance - this is more reliable for smurf detection.</span>
            </div>
        `;
        items++;

        legendBox.innerHTML = legendHtml;
        legendBox.style.display = 'block';
    }
});
