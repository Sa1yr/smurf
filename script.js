// Wait for the page to load
document.addEventListener('DOMContentLoaded', () => {
    
    const gameNameInput = document.getElementById('gameNameInput');
    const tagLineInput = document.getElementById('tagLineInput');
    const searchButton = document.getElementById('searchButton');
    const resultsDiv = document.getElementById('results');

    searchButton.addEventListener('click', analyzePlayer);
    gameNameInput.addEventListener('keypress', (e) => e.key === 'Enter' && analyzePlayer());
    tagLineInput.addEventListener('keypress', (e) => e.key === 'Enter' && analyzePlayer());


    async function analyzePlayer() {
        const gameName = gameNameInput.value.trim();
        const tagLine = tagLineInput.value.trim();

        if (!gameName || !tagLine) {
            resultsDiv.innerHTML = '<p class="error">Please enter both a Game Name and a Tagline.</p>';
            return;
        }

        // 1. Show a loading message
        resultsDiv.innerHTML = '<p class="loading">Analyzing recent matches... (This may take a moment with a Dev Key)</p>';

        try {
            // 2. Call your secure backend function (at /api/analyze)
            // We pass the name and tag as query parameters
            const response = await fetch(`/api/analyze?name=${gameName}&tag=${tagLine}`);
            const data = await response.json();

            // 3. Handle errors from the backend
            if (!response.ok) {
                throw new Error(data.error || 'An unknown error occurred.');
            }

            // 4. Display the results
            // We use .toFixed(1) to round numbers to one decimal place
            resultsDiv.innerHTML = `
                <div class="result-item"><strong>Account Level:</strong> ${data.accountLevel}</div>
                <hr>
                <div class="result-item"><strong>Analyzed:</strong> ${data.totalGames} matches</div>
                <div class="result-item"><strong>Win Rate:</strong> ${data.winRate.toFixed(1)}% (${data.wins}W - ${data.losses}L)</div>
                <div class="result-item"><strong>Average KDA:</strong> ${data.avgKDA.toFixed(2)} (${data.avgKills.toFixed(1)} / ${data.avgDeaths.toFixed(1)} / ${data.avgAssists.toFixed(1)})</div>
                <hr>
                <div class="result-item"><strong>Flash on D:</strong> ${data.flashOnD} games</div>
                <div class="result-item"><strong>Flash on F:</strong> ${data.flashOnF} games</div>
                <hr>
                <div class="result-item"><strong>Top Duo Partner:</strong> ${data.topDuoPartner}</div>
                <div class="result-item"><strong>Games Together:</strong> ${data.topDuoGames}</div>
            `;

        } catch (error) {
            resultsDiv.innerHTML = `<p class="error"><strong>Error:</strong> ${error.message}</p>`;
            console.error(error);
        }
    }
});
