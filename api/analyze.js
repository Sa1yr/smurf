// This is your Vercel Serverless Function
// We use 'node-fetch' because 'fetch' isn't built into this version of Node.js
const fetch = require('node-fetch');

export default async function handler(request, response) {
    // 1. Get Game Name and Tag from the query (e.g., /api/analyze?name=RiotSchmick&tag=NA1)
    const { name, tag } = request.query;
    
    // 2. Get your SECRET API key from Vercel's "Environment Variables"
    const apiKey = process.env.RIOT_API_KEY;

    if (!apiKey) {
        return response.status(500).json({ error: "API key is not configured." });
    }
    if (!name || !tag) {
        return response.status(400).json({ error: "Game Name and Tag are required." });
    }

    try {
        // --- STEP 1: Get the Player's PUUID (Permanent ID) ---
        // We use the "americas" regional server for account info
        const accountResponse = await fetch(`https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${name}/${tag}?api_key=${apiKey}`);
        if (!accountResponse.ok) throw new Error('Riot ID not found. Check Game Name and Tag.');
        const accountData = await accountResponse.json();
        const puuid = accountData.puuid;

        // --- STEP 2: Get the Player's Account Level ---
        // We use the "platform" server (e.g., na1) for summoner info
        // (Note: This assumes the player is on 'na1'. A real app would let you select a region)
        const summonerResponse = await fetch(`https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}?api_key=${apiKey}`);
        if (!summonerResponse.ok) throw new Error('Summoner data not found.');
        const summonerData = await summonerResponse.json();
        const accountLevel = summonerData.summonerLevel;

        // --- STEP 3: Get the Player's last 20 Match IDs ---
        const matchListResponse = await fetch(`https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=20&api_key=${apiKey}`);
        if (!matchListResponse.ok) throw new Error('Could not fetch match list.');
        const matchIds = await matchListResponse.json();

        // --- STEP 4: Analyze each match (This is the slow part!) ---
        let totalKills = 0;
        let totalDeaths = 0;
        let totalAssists = 0;
        let wins = 0;
        const duoPartners = {}; // A map to count games with others

        for (const matchId of matchIds) {
            const matchResponse = await fetch(`https://americas.api.riotgames.com/lol/match/v5/matches/${matchId}?api_key=${apiKey}`);
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

            // Find duo partner (check other 4 players on their team)
            matchData.info.participants.forEach(participant => {
                if (participant.puuid !== puuid && participant.teamId === playerInfo.teamId) {
                    
                    // --- THIS IS THE FIX ---
                    // We now check if the gameName exists and is not 'undefined'
                    const gameName = participant.riotIdGameName;
                    const tagLine = participant.riotIdTagLine;

                    if (gameName && gameName !== "undefined") {
                        const partnerName = `${gameName}#${tagLine}`;
                        duoPartners[partnerName] = (duoPartners[partnerName] || 0) + 1;
                    }
                    // If the gameName is 'undefined', we simply don't count them.
                    // ---------------------
                }
            });
        }

        // --- STEP 5: Calculate the final stats ---
        const totalGames = matchIds.length;
        const losses = totalGames - wins;
        // Check for totalGames > 0 to prevent dividing by zero if match list is empty
        const avgKills = totalGames > 0 ? totalKills / totalGames : 0;
        const avgDeaths = totalGames > 0 ? totalDeaths / totalGames : 0;
        const avgAssists = totalGames > 0 ? totalAssists / totalGames : 0;
        const winRate = totalGames > 0 ? (wins / totalGames) * 100 : 0;
        // KDA = (Kills + Assists) / Deaths. Handle 0 deaths.
        const avgKDA = (totalKills + totalAssists) / (totalDeaths === 0 ? 1 : totalDeaths);

        // Find top duo partner
        let topDuoPartner = "None";
        let topDuoGames = 0;
        for (const partner in duoPartners) {
            // We'll set a minimum of 2 games to be considered a "duo"
            if (duoPartners[partner] > topDuoGames && duoPartners[partner] >= 2) { 
                topDuoPartner = partner;
                topDuoGames = duoPartners[partner];
            }
        }

        // --- STEP 6: Send the good data back to the frontend! ---
        response.status(200).json({
            accountLevel,
            totalGames,
            wins,
            losses,
            winRate: winRate,
            avgKills,
            avgDeaths,
            avgAssists,
            avgKDA,
            topDuoPartner: topDuoPartner,
            topDuoGames: topDuoGames
        });

    } catch (error) {
        // Send a clean error message to the frontend
        response.status(500).json({ error: error.message });
    }
}
