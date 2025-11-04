// Wait for the page to load
document.addEventListener('DOMContentLoaded', () => {
    
    const gameNameInput = document.getElementById('gameNameInput');
    const tagLineInput = document.getElementById('tagLineInput');
    const regionSelect = document.getElementById('regionSelect'); // <-- NEW
    const searchButton = document.getElementById('searchButton');
    const resultsDiv = document.getElementById('results');

    searchButton.addEventListener('click', analyzePlayer);
    gameNameInput.addEventListener('keypress', (e) => e.key === 'Enter' && analyzePlayer());
    tagLineInput.addEventListener('keypress', (e) => e.key === 'Enter' && analyzePlayer());


    async function analyzePlayer() {
        const gameName = gameNameInput.value.trim();
        const tagLine = tagLineInput.value.trim();
        const region = regionSelect.value; // <-- NEW

        if (!gameName || !tagLine) {
            resultsDiv.innerHTML = '<p class="error">Please enter both a Game Name and a Tagline.</p>';
            return;
        }

        // 1. Show a loading message
        resultsDiv.innerHTML = '<p class="loading">Analyzing last 100 matches... (This may take up to a minute)</p>';

        try {
            // 2. Call your secure backend function (at /api/analyze)
            // We now pass the region as a query parameter
            const response = await fetch(`/api/analyze?name=${gameName}&tag=${tagLine}&region=${region}`);
            const data = await response.json();

            // 3. Handle errors from the backend
            if (!response.ok) {
                throw new Error(data.error || 'An unknown error occurred.');
            }

            // 4. --- ALL NEW DISPLAY LOGIC ---

            // Build the op.gg link for the searched player
            const playerUrl = `https://op.gg/summoner/userName=${encodeURIComponent(data.searchedPlayer.gameName)}&userTag=${encodeURIComponent(data.searchedPlayer.tagLine)}`;
            const playerLink = `<a href="${playerUrl}" target="_blank">${data.searchedPlayer.gameName}#${data.searchedPlayer.tagLine}</a>`;

            // Determine Flash text and CSS class
            let flashClass = "";
            if (data.flashKey === "D & F") {
                flashClass = "flash-inconsistent"; // Red
            } else if (data.flashKey === "D" || data.flashKey === "F") {
                flashClass = "flash-consistent"; // Green
            }
            const flashDisplay = `<span class="${flashClass}">${data.flashKey}</span>`;

            // Build the Duo Partner list
            let duoHtml = '<strong>Duo Partners (>= 2 games):</strong>';
            if (data.duoList.length === 0) {
                duoHtml += "<p style='margin:0; padding-left:10px;'>None found.</p>";
            } else {
                duoHtml += '<ul>';
                for (const duo of data.duoList) {
                    const [duoName, duoTag] = duo.name.split('#');
                    const duoUrl = `https://op.gg/summoner/userName=${encodeURIComponent(duoName)}&userTag=${encodeURIComponent(duoTag)}`;
                    duoHtml += `<li><a href="${duoUrl}" target="_blank">${duo.name}</a> (${duo.games} games)</li>`;
                }
                duoHtml += '</ul>';
            }

            // 5. Display the final results
            resultsDiv.innerHTML = `
                <div class="result-item"><strong>Player:</strong> ${playerLink}</div>
                <div class="result-item"><strong>Account Level:</strong> ${data.accountLevel}</div>
                <hr>
                <div class="result-item"><strong>Analyzed:</strong> ${data.totalGames} matches</div>
                <div class="result-item"><strong>Win Rate:</strong> ${data.winRate.toFixed(1)}% (${data.wins}W - ${data.losses}L)</div>
                <div class="result-item"><strong>Average KDA:</strong> ${data.avgKDA.toFixed(2)} (${data.avgKills.toFixed(1)} / ${data.avgDeaths.toFixed(1)} / ${data.avgAssists.toFixed(1)})</div>
                <div class="result-item"><strong>Flash on:</strong> ${flashDisplay}</div>
                <hr>
                <div class="result-item">${duoHtml}</div>
            `;

        } catch (error) {
            resultsDiv.innerHTML = `<p class="error"><strong>Error:</strong> ${error.message}</p>`;
            console.error(error);
        }
    }
});
