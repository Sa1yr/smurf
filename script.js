/*
=======================================================================
!!! CRITICAL SECURITY WARNING !!!
=======================================================================
DO NOT put your REAL API key here if this website is public.
Your key will be stolen in seconds.
This `API_KEY` variable is just a placeholder for testing.
=======================================================================
*/
// Replace with your 24-hour development key for testing
const API_KEY = "RGAPI-YOUR_API_KEY_HERE";

// Data Dragon version (for icons)
const DATA_DRAGON_VERSION = "13.21.1"; // You should fetch this dynamically in a real app

// --- Mappings for API ---
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
    const gameNameInput = document.getElementById('gameName'); // UPDATED
    const tagLineInput = document.getElementById('tagLine'); // UPDATED
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

    // --- Main Search Function ---
    async function searchPlayer() {
        const gameName = gameNameInput.value.trim(); // UPDATED
        const tagLine = tagLineInput.value.trim(); // UPDATED
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

        try {
            // --- Step 1: Get PUUID from Riot ID (GameName + TagLine) ---
            const accountRegion = REGION_TO_ACCOUNT_REGION[region] || 'americas';
            const account = await getAccountData(gameName, tagLine, accountRegion);
            const puuid = account.puuid;

            // --- Step 2: Get Summoner Data (Level, Icon, Encrypted ID) using PUUID ---
            const summoner = await getSummonerData(puuid, region);
            const encryptedSummonerId = summoner.id;

            // Display basic info
            profileIcon.src = `https://ddragon.leagueoflegends.com/cdn/${DATA_DRAGON_VERSION}/img/profileicon/${summoner.profileIconId}.png`;
            summonerNameDisplay.textContent = `${account.gameName}#${account.tagLine}`; // Display full Riot ID
            summonerLevel.textContent = `Level ${summoner.summonerLevel}`;

            // --- Step 3: Kick off Rank and Match History calls in parallel ---
            const [rankData, matchIds] = await Promise.all([
                getRankData(encryptedSummonerId, region),
                getMatchHistory(puuid, accountRegion) // Use accountRegion for matches
            ]);

            // --- Step 4: Process and Display Rank Data ---
            displayRankData(rankData);

            // --- Step 5: Process and Display Match History ---
            displayMatchHistory(matchIds, accountRegion, puuid);

            // Show results
            loadingDiv.style.display = 'none';
            resultsDiv.style.display = 'grid';

        } catch (err) {
            showError(err.message);
        }
    }

    // --- API Fetching Functions ---

    // NEW: Step 1 - Get PUUID from Riot ID
    async function getAccountData(gameName, tagLine, accountRegion) {
        const url = `https://${accountRegion}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${gameName}/${tagLine}?api_key=${API_KEY}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Riot ID not found (Error ${response.status}). Check Game Name, Tag Line, and Region.`);
        }
        return response.json(); // Returns { puuid, gameName, tagLine }
    }

    // NEW: Step 2 - Get Summoner Data from PUUID
    async function getSummonerData(puuid, region) {
        const url = `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}?api_key=${API_KEY}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Summoner data not found (Error ${response.status})`);
        }
        return response.json(); // Returns { id, profileIconId, summonerLevel, etc. }
    }

    // Step 3a - Get Rank Data (Same as before)
    async function getRankData(encryptedSummonerId, region) {
        const url = `https://${region}.api.riotgames.com/lol/league/v4/entries/by-summoner/${encryptedSummonerId}?api_key=${API_KEY}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Could not fetch rank data (Error ${response.status})`);
        }
        return response.json();
    }

    // Step 3b - Get Match History (Same as before, just uses 'accountRegion')
    async function getMatchHistory(puuid, accountRegion) {
        const url = `https://${accountRegion}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?type=ranked&start=0&count=5&api_key=${API_KEY}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Could not fetch match history (Error ${response.status})`);
        }
        return response.json();
    }

    // --- UI Display Functions ---

    function displayRankData(rankData) {
        const soloQueueEntry = rankData.find(entry => entry.queueType === "RANKED_SOLO_5x5");

        if (soloQueueEntry) {
            const tier = soloQueueEntry.tier.toUpperCase();
            const rank = soloQueueEntry.rank;
            const wins = soloQueueEntry.wins;
            const losses = soloQueueEntry.losses;

            rankIcon.src = `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-shared-components/global/default/images/ranked-emblem-${tier.toLowerCase()}.png`;
            rankTier.textContent = `${tier} ${rank}`;
            rankLP.textContent = `${soloQueueEntry.leaguePoints} LP`;
            rankWinLoss.textContent = `${wins}W / ${losses}L`;
        } else {
            rankIcon.src = `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-shared-components/global/default/images/ranked-emblem-unranked.png`;
            rankTier.textContent = "UNRANKED";
            rankLP.textContent = "--- LP";
            rankWinLoss.textContent = "0W / 0L";
        }
    }

    async function displayMatchHistory(matchIds, accountRegion, puuid) {
        if (matchIds.length === 0) {
            matchHistoryDiv.innerHTML = '<p class="text-gray">No recent ranked games found.</p>';
            return;
        }
        matchHistoryDiv.innerHTML = '';

        for (const matchId of matchIds) {
            try {
                const matchUrl = `https://${accountRegion}.api.riotgames.com/lol/match/v5/matches/${matchId}?api_key=${API_KEY}`;
                const matchResponse = await fetch(matchUrl);
                const matchData = await matchResponse.json();
                const playerInfo = matchData.info.participants.find(p => p.puuid === puuid);
                
                if (playerInfo) {
                    const card = createMatchCard(playerInfo, matchData.info);
                    matchHistoryDiv.appendChild(card);
                }
            } catch (err) {
                console.error(`Failed to load match ${matchId}:`, err);
            }
        }
    }

    function createMatchCard(player, info) {
        const card = document.createElement('div');
        const win = player.win;
        card.className = `match-card ${win ? 'victory' : 'defeat'}`;
        const gameType = info.queueId === 420 ? "Ranked Solo/Duo" : "Ranked Flex";
        const duration = (info.gameDuration / 60).toFixed(0);

        card.innerHTML = `
            <img src="https://ddragon.leagueoflegends.com/cdn/${DATA_DRAGON_VERSION}/img/champion/${player.championName}.png" alt="${player.championName}">
            <div class="match-info">
                <p class="win-status">${win ? 'VICTORY' : 'DEFEAT'}</p>
                <p class="game-details">${gameType} (${duration} mins)</p>
            </div>
            <div class="kda-info">
                <p class="kda">${player.kills} / ${player.deaths} / ${player.assists}</p>
                <p class="kda-ratio">KDA: ${((player.kills + player.assists) / (player.deaths || 1)).toFixed(2)}</p>
            </div>
        `;
        return card;
    }

    function showError(message) {
        loadingDiv.style.display = 'none';
        resultsDiv.style.display = 'none';
        errorDiv.style.display = 'block';
        errorDiv.textContent = `Error: ${message}`;
    }

}); // End of DOMContentLoaded


