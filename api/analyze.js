// This is your Vercel Serverless Function
const fetch = require('node-fetch');

// --- NEW: Region Mapping Function ---
// Converts a platform region (e.g., "na1") to a continental region (e.g., "americas")
// This is required by the Riot API (Account API vs. Match API)
function getRegionalHost(platform) {
    switch (platform.toLowerCase()) {
        case 'na1':
        case 'br1':
        case 'la1':
        case 'la2':
            return 'americas';
        case 'euw1':
        case 'eun1':
        case 'tr1':
        case 'ru':
            return 'europe';
        case 'kr':
        case 'jp1':
            return 'asia';
        case 'oc1':
            return 'sea';
        default:
            return 'americas'; // Default to americas
    }
}

export default async function handler(request, response) {
    // 1. Get Game Name, Tag, AND Region from the query
    const { name, tag, region } = request.query;
    
    // 2. Get your SECRET API key from Vercel's "Environment Variables"
    const apiKey = process.env.RIOT_API_KEY;

    if (!apiKey) {
        return response.status(500).json({ error: "API key is not configured." });
    }
    if (!name || !tag || !region) {
        return response.status(400).json({ error: "Game Name, Tag, and Region are required." });
    }

    // --- NEW: Set up API hosts based on region ---
    const platformHost = region.toLowerCase();
    const regionalHost = getRegionalHost(platformHost);

    try {
        // --- STEP 1: Get the Player's PUUID (Permanent ID) ---
        // Uses the REGIONAL host
        const accountResponse = await fetch(`https://${regionalHost}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${name}/${tag}?api_key=${apiKey}`);
        if (!accountResponse.ok) throw new Error('Riot ID not found. Check Game Name, Tag, and Region.');
        const accountData = await accountResponse.json();
        const puuid = accountData.puuid;

        // --- STEP 2: Get the Player's Account Level ---
        // Uses the PLATFORM host
        const summonerResponse = await fetch(`https://${platformHost}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}?api_key=${apiKey}`);
        if (!summonerResponse.ok) throw new Error('Summoner data not found on that platform.');
        const summonerData = await summonerResponse.json();
        const accountLevel = summonerData.summonerLevel;

        // --- STEP 3: Get the Player's last 100 Match IDs ---
        // Uses the REGIONAL host. Count is now 100.
        const matchListResponse = await fetch(`https://${regionalHost}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=100&api_key=${apiKey}`);
        if (!matchListResponse.ok) throw new Error('Could not fetch match list.');
        const matchIds = await matchListResponse.json();

        // --- STEP 4: Analyze each match (This is the slow part!) ---
        let totalKills = 0;
        let totalDeaths = 0;
        let totalAssists = 0;
        let wins = 0;
        let flashOnD = 0;
        let flashOnF = 0;
        const duoPartners = {}; 
        const FLASH_SPELL_ID = 4; // This is the permanent ID for Summoner Flash

        for (const matchId of matchIds) {
            // Uses the REGIONAL host
            const matchResponse = await fetch(`https://${regionalHost}.api.riotgames.com/lol/match/v5/matches/${matchId}?api_key=${apiKey}`);
            if (!matchResponse.ok) continue; // Skip this match if it fails
            
            const matchData = await matchResponse.json();
            
            // Find our player in the match
            const playerInfo = matchData.info.participants.find(p => p.puuid === puuid);
            if (!playerInfo) continue;

            // Add stats
            totalKills += playerInfo.kills;
            totalDeaths += playerInfo.deaths;
            totalAssists += playerInfo.assists;
            if (playerInfo.win) {
                wins++;
            }

            // Check Flash position
            if (playerInfo.summoner1Id === FLASH_SPELL_ID) {
                flashOnD++;
            }
            if (playerInfo.summoner2Id === FLASH_SPELL_ID) {
                flashOnF++;
            }

            // Find duo partner (check other 4 players on their team)
            matchData.info.participants.forEach(participant => {
                if (participant.puuid !== puuid && participant.teamId === playerInfo.teamId) {
                    
                    const gameName = participant.riotIdGameName;
                    const tagLine = participant.riotIdTagline; // <-- Lowercase 'l' is correct

                    if (gameName && gameName !== "undefined") {
                        const partnerName = `${gameName}#${tagLine}`;
                        duoPartners[partnerName] = (duoPartners[partnerName] || 0) + 1;
                    }
                }
            });
        }

        // --- STEP 5: Calculate the final stats ---
        const totalGames = matchIds.length;
        if (totalGames === 0) {
            return response.status(200).json({
                searchedPlayer: { gameName: name, tagLine: tag },
                accountLevel,
                totalGames: 0,
                wins: 0,
                losses: 0,
                winRate: 0,
                avgKills: 0,
                avgDeaths: 0,
                avgAssists: 0,
                avgKDA: 0,
                flashKey: "N/A",
                duoList: []
            });
        }
        
        const losses = totalGames - wins;
        const avgKills = totalKills / totalGames;
        const avgDeaths = totalDeaths / totalGames;
        const avgAssists = totalAssists / totalGames;
        const winRate = (wins / totalGames) * 100;
        const avgKDA = (totalKills + totalAssists) / (totalDeaths === 0 ? 1 : totalDeaths);

        // --- NEW: Determine Flash string ---
        let flashKey = "None";
        if (flashOnD > 0 && flashOnF > 0) {
            flashKey = "D & F";
        } else if (flashOnD > 0) {
            flashKey = "D";
        } else if (flashOnF > 0) {
            flashKey = "F";
        }

        // --- NEW: Build Duo Partner List ---
        const duoList = [];
        for (const partner in duoPartners) {
            if (duoPartners[partner] >= 2) { 
                duoList.push({ name: partner, games: duoPartners[partner] });
            }
        }
        // Sort the list by most games played together
        duoList.sort((a, b) => b.games - a.games);


        // --- STEP 6: Send the good data back to the frontend! ---
        response.status(200).json({
            searchedPlayer: { gameName: name, tagLine: tag },
            accountLevel,
            totalGames,
            wins,
            losses,
            winRate: winRate,
            avgKills,
            avgDeaths,
            avgAssists,
            avgKDA,
            flashKey: flashKey,
            duoList: duoList
        });

    } catch (error) {
        // Send a clean error message to the frontend
        response.status(500).json({ error: error.message });
    }
}
