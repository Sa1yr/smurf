// Data Dragon version (for icons)
const DATA_DRAGON_VERSION = "13.21.1"; // You can update this as new patches come out

// --- Mappings for API ---
// This map is now used on the backend, but we keep it here for reference
const REGION_TO_ACCOUNT_REGION = {
    'na1': 'americas',
    'br1': 'americas',
    'la1': 'americas',
    'la2': 'americas',
    'euw1': 'europe',
    'eun1': 'europe',
    'tr1': 'europe',
    'ru': 'europe',
    'kr': 'asia',
    'jp1': 'asia',
};

// Wait for the DOM to be fully loaded before running the script
document.addEventListener('DOMContentLoaded', () => {

    // --- Get UI Elements ---
    const searchButton = document.getElementById('searchButton');
    const gameNameInput = document.getElementById('gameName');
    const tagLineInput = document.getElementById('tagLine');
    const regionSelect = document.getElementById('region');

    const loadingDiv = document.getElementById('loading');
    const errorDiv = document.getElementById('error');
    const resultsDiv = document.getElementById('results');

    // Display elements
    const profileIcon = document.getElementById('profileIcon');
    const summonerNameDisplay = document.getElementById('summonerNameDisplay');
    const summonerLevel = document.getElementById('summonerLevel');
    
    // Rank display elements
    const rankIcon = document.getElementById('rankIcon');
    const rankTier = document.getElementById('rankTier');
    const rankLP = document.getElementById('rankLP');
    const rankWinLoss = document.getElementById('rankWinLoss');

    const matchHistoryDiv = document.getElementById('match-history');

    // Attach event listener
    searchButton.addEventListener('click', searchPlayer);

    // --- Main Search Function (NOW CALLS YOUR BACKEND) ---
    async function searchPlayer() {
        const gameName = gameNameInput.value.trim();
        const tagLine = tagLineInput.value.trim();
        const region = regionSelect.value;
        
        if (!gameName || !tagLine) {
            showError("Please enter both a Game Name and a Tag Line.");
            return;
        }

        // --- Reset UI ---
        loadingDiv.style.display = 'block';
        resultsDiv.style.display = 'none';
        errorDiv.style.display = 'none';
        matchHistoryDiv.innerHTML = '<p class="text-gray">Loading matches...</p>';
        rankTier.textContent = "UNRANKED";
        rankIcon.src = `https://placehold.co/128x128/1f2937/9ca3af?text=Rank`;
        rankLP.textContent = "--- LP";
        rankWinLoss.textContent = "---W / ---L";
        summonerNameDisplay.textContent = "---";
        summonerLevel.textContent = "Level ---";
        profileIcon.src = "https://placehold.co/100x100/1f2937/9ca3af?text=Icon";

        try {
            // --- Step 1: Call your own backend API ---
            // This is the Vercel serverless function from your /api/ folder
            const response = await fetch(`/api/analyze?name=${gameName}&tag=${tagLine}&region=${region}`);
            
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || `Server error (Error ${response.status})`);
            }
            
            const data = await response.json();
            
            // --- Step 2: Populate UI with data from your backend ---
            
            // Display basic info
            const profileIconId = data.profileIconId; // We need to add this to the backend
            profileIcon.src = `https://ddragon.leagueoflegends.com/cdn/${DATA_DRAGON_VERSION}/img/profileicon/${profileIconId}.png`;
            summonerNameDisplay.textContent = `${data.searchedPlayer.gameName}#${data.searchedPlayer.tagLine}`;
            summonerLevel.textContent = `Level ${data.accountLevel}`;

            // Display Rank Data
            displayRankData(data.totalRank, data.currentRank);

            // Display Match History
            displayMatchHistory(data.matchHistory); // We will add this to the backend

            // Show results
            loadingDiv.style.display = 'none';
            resultsDiv.style.display = 'grid';

        } catch (err) {
            showError(err.message);
        }
    }

    // --- UI Display Functions ---

    function displayRankData(totalRank, currentRank) {
        // We need to parse the rank from the backend string
        // e.g., "GOLD IV (25 LP) (Solo/Duo)"
        let tier = "UNRANKED";
        let rank = "";
        let lp = "--- LP";
        
        if (totalRank.totalGames > 0) {
            const rankMatch = currentRank.match(/(\w+) (\w+) \((\d+) LP\)/);
            if (rankMatch) {
                tier = rankMatch[1].toUpperCase();
                rank = rankMatch[2];
                lp = `${rankMatch[3]} LP`;
            }
            
            rankTier.textContent = `${tier} ${rank}`;
            rankLP.textContent = lp;
            rankWinLoss.textContent = totalRank.display; // e.g., "10W - 5L (66.7%)"
        } else {
            rankTier.textContent = "UNRANKED";
            rankLP.textContent = "--- LP";
            rankWinLoss.textContent = "0W / 0L";
        }
        
        rankIcon.src = `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-shared-components/global/default/images/ranked-emblem-${tier.toLowerCase()}.png`;
    }

    function displayMatchHistory(matchHistory) {
        if (!matchHistory || matchHistory.length === 0) {
            matchHistoryDiv.innerHTML = '<p class="text-gray">No recent ranked games found.</p>';
            return;
        }
        
        matchHistoryDiv.innerHTML = ''; // Clear loading text

        for (const match of matchHistory) {
            const card = createMatchCard(match);
            matchHistoryDiv.appendChild(card);
        }
    }

    function createMatchCard(match) {
        const card = document.createElement('div');
        const win = match.win;
        card.className = `match-card ${win ? 'victory' : 'defeat'}`;
        
        const duration = (match.gameDuration / 60).toFixed(0);
        const kda = ((match.kills + match.assists) / (match.deaths || 1)).toFixed(2);

        card.innerHTML = `
            <img src="https://ddragon.leagueoflegends.com/cdn/${DATA_DRAGON_VERSION}/img/champion/${match.championName}.png" alt="${match.championName}">
            <div class="match-info">
                <p class="win-status">${win ? 'VICTORY' : 'DEFEAT'}</p>
                <p class="game-details">${match.queueType} (${duration} mins)</p>
            </div>
            <div class="kda-info">
                <p class="kda">${match.kills} / ${match.deaths} / ${match.assists}</p>
                <p class="kda-ratio">KDA: ${kda}</p>
            </div>
        `;
        return card;
    }

    function showError(message) {
        loadingDiv.style.display = 'none';
        resultsDiv.style.display = 'none';
        errorDiv.style.display = 'block';
        // Sanitize the message to prevent HTML injection if the error message is reflected
        const errorText = document.createTextNode(`Error: ${message}`);
        errorDiv.innerHTML = ''; // Clear previous errors
        errorDiv.appendChild(errorText);
    }

}); // End of DOMContentLoaded

