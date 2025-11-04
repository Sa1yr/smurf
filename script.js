document.addEventListener('DOMContentLoaded', () => {
    
    const gameNameInput = document.getElementById('gameNameInput');
    const tagLineInput = document.getElementById('tagLineInput');
    const regionSelect = document.getElementById('regionSelect');
    const searchButton = document.getElementById('searchButton');
    const statsBox = document.getElementById('statsBox');
    const masteryBox = document.getElementById('masteryBox');
    
    // Store data globally to allow re-searching
    window.currentAnalysis = {
        analyzePlayer: analyzePlayer
    };

    searchButton.addEventListener('click', () => analyzePlayer());

    // Helper function to get the region for op.gg
    function getOpGgRegion(platformId) {
        const regionMap = {
            'na1': 'na',
            'euw1': 'euw',
            'eun1': 'eune',
            'kr': 'kr',
            'br1': 'br',
            'jp1': 'jp',
            'la1': 'lan',
            'la2': 'las',
            'oc1': 'oce',
            'tr1': 'tr',
            'ru': 'ru'
        };
        return regionMap[platformId.toLowerCase()] || 'na';
    }

    // Helper function to build an op.gg link
    function buildOpGgLink(gameName, tagLine, region) {
        const opGgRegion = getOpGgRegion(region);
        // Correct format: {name}-{tag}
        const formattedName = `${gameName}-${tagLine}`;
        return `https://op.gg/summoners/${opGgRegion}/${encodeURIComponent(formattedName)}`;
    }

    // Main search function
    async function analyzePlayer(customName, customTag, customRegion) {
        // Use custom parameters if provided (from clicking a duo), otherwise use form fields
        const gameName = customName || gameNameInput.value.trim();
        const tagLine = customTag || tagLineInput.value.trim();
        const region = customRegion || regionSelect.value;
        
        // If we are re-running a search, update the form fields
        if (customName) {
            gameNameInput.value = customName;
            tagLineInput.value = customTag;
            regionSelect.value = customRegion;
        }

        if (!gameName || !tagLine) {
            statsBox.innerHTML = '<p class="error">Please enter both a Game Name and a Tagline.</p>';
            masteryBox.innerHTML = ''; // Clear mastery box
            return;
        }

        // 1. Show a loading message
        statsBox.innerHTML = '<p class="loading">Analyzing recent matches...</p>';
        masteryBox.innerHTML = '<p class="loading">Fetching champion mastery...</p>';

        try {
            // 2. Call your secure backend function
            const response = await fetch(`/api/analyze?name=${gameName}&tag=${tagLine}&region=${region}`);
            const data = await response.json();

            // 3. Handle errors from the backend
            if (!response.ok) {
                throw new Error(data.error || 'An unknown error occurred.');
            }

            // 4. Render the Stats Box
            renderStatsBox(data, region);
            
            // 5. Render the Mastery Box
            renderMasteryBox(data.mastery);

        } catch (error) {
            statsBox.innerHTML = `<p class="error"><strong>Error:</strong> ${error.message}</p>`;
            masteryBox.innerHTML = '';
            console.error(error);
        }
    }

    // New function to render the main stats
    function renderStatsBox(data, region) {
        const playerLink = buildOpGgLink(data.searchedPlayer.gameName, data.searchedPlayer.tagLine, region);
        
        // Determine Flash text and CSS class
        let flashClass = "";
        if (data.flashKey === "D & F") {
            flashClass = "flash-inconsistent"; // Red
        } else if (data.flashKey === "D" || data.flashKey === "F") {
            flashClass = "flash-consistent"; // Green
        }
        const flashDisplay = `<span class="${flashClass}">${data.flashKey}</span>`;

        // Build the Duo Partner list
        let duoHtml = '<strong>Duo Partners (>= 3 games):</strong>';
        if (data.duoList.length === 0) {
            duoHtml += "<p style='margin:0; padding-left:10px;'>None found.</p>";
        } else {
            duoHtml += '<ul>';
            for (const duo of data.duoList) {
                const [duoName, duoTag] = duo.name.split('#');
                // Create a link that calls analyzePlayer with the duo's info
                const reSearchLink = `window.currentAnalysis.analyzePlayer('${duoName}', '${duoTag}', '${region}')`;
                
                duoHtml += `
                    <li>
                        <a href="#" onclick="${reSearchLink}" class="duo-link">${duo.name}</a>
                        (${duo.games} games)
                    </li>
                `;
            }
            duoHtml += '</ul>';
        }

        // Display final stats
        statsBox.innerHTML = `
            <div class="result-item">
                <strong>Player:</strong>
                <span>${data.searchedPlayer.gameName}#${data.searchedPlayer.tagLine}</span>
                <a href="${playerLink}" target="_blank" class="opgg-link">[op.gg]</a>
            </div>
            <div class="result-item"><strong>Account Level:</strong> ${data.accountLevel}</div>
            <div class="result-item"><strong>Highest Rank:</strong> ${data.highestRank}</div>
            <hr>
            <div class="result-item"><strong>Analyzed:</strong> ${data.totalGames} matches</div>
            <div class="result-item"><strong>Win Rate:</strong> ${data.winRate.toFixed(1)}% (${data.wins}W - ${data.losses}L)</div>
            <div class="result-item"><strong>Average KDA:</strong> ${data.avgKDA.toFixed(2)} (${data.avgKills.toFixed(1)} / ${data.avgDeaths.toFixed(1)} / ${data.avgAssists.toFixed(1)})</div>
            <div class="result-item"><strong>Flash on:</strong> ${flashDisplay}</div>
            <hr>
            <div class="result-item">${duoHtml}</div>
        `;
    }

    // New function to render the mastery box
    function renderMasteryBox(masteryData) {
        if (!masteryData || masteryData.length === 0) {
            masteryBox.innerHTML = '<h3>Champion Mastery</h3><p>No mastery data found.</p>';
            return;
        }

        let masteryHtml = `
            <h3>Champion Mastery</h3>
            <input type="text" id="masterySearch" placeholder="Search champions...">
            <div id="masteryList">
        `;

        for (const champ of masteryData) {
            let masteryClass = 'mastery-0';
            if (champ.level === 1) {
                masteryClass = 'mastery-1';
            } else if (champ.level > 1) {
                masteryClass = 'mastery-high';
            }

            masteryHtml += `
                <div class="mastery-item ${masteryClass}" data-champ-name="${champ.name.toLowerCase()}">
                    <span>${champ.name}</span>
                    <span>Level ${champ.level} (${champ.points.toLocaleString()} pts)</span>
                </div>
            `;
        }
        
        masteryHtml += `</div>`;
        masteryBox.innerHTML = masteryHtml;

        // Add event listener for the new search bar
        document.getElementById('masterySearch').addEventListener('keyup', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const items = document.querySelectorAll('#masteryList .mastery-item');
            
            items.forEach(item => {
                const champName = item.getAttribute('data-champ-name');
                if (champName.includes(searchTerm)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }
});
