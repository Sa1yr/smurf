const fetch = require('node-fetch');

// Helper function to get the correct regional servers
function getRegionalHost(platform) {
    switch (platform.toLowerCase()) {
        case 'na1': case 'br1': case 'la1': case 'la2':
            return 'americas';
        case 'euw1': case 'eun1': case 'tr1': case 'ru':
            return 'europe';
        case 'kr': case 'jp1':
            return 'asia';
        case 'oc1':
            return 'sea';
        default:
            return 'americas';
    }
}

// Helper to get Data Dragon champion names
let championMap = null;
async function getChampionMap() {
    if (championMap) return championMap;
    
    try {
        const versionResponse = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
        const versions = await versionResponse.json();
        const latestVersion = versions[0];
        
        const champResponse = await fetch(`https://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/en_US/champion.json`);
        const champData = await champResponse.json();
        
        const map = {};
        for (const champName in champData.data) {
            const champ = champData.data[champName];
            map[champ.key] = { id: champ.key, name: champ.name }; // Store both ID and Name
        }
        championMap = map;
        return championMap;
    } catch (e) {
        console.error("Failed to fetch champion map:", e);
        return {}; 
    }
}


export default async function handler(request, response) {
    const { name, tag, region } = request.query;
    const apiKey = process.env.RIOT_API_KEY;

    if (!apiKey) return response.status(500).json({ error: "API key is not configured." });
    if (!name || !tag || !region) return response.status(400).json({ error: "Game Name, Tag, and Region are required." });

    const platformHost = region.toLowerCase();
    const regionalHost = getRegionalHost(platformHost);

    try {
        // --- STEP 1: Get PUUID ---
        const accountResponse = await fetch(`https://${regionalHost}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${name}/${tag}?api_key=${apiKey}`);
        if (!accountResponse.ok) throw new Error('Riot ID not found. Check Game Name, Tag, and Region.');
        const accountData = await accountResponse.json();
        const puuid = accountData.puuid;

        // --- STEP 2: Get Summoner Data (for Level and ID) ---
        const summonerResponse = await fetch(`https://${platformHost}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}?api_key=${apiKey}`);
        if (!summonerResponse.ok) throw new Error('Summoner data not found on that platform.');
        const summonerData = await summonerResponse.json();
        const accountLevel = summonerData.summonerLevel;
        const summonerId = summonerData.id; 

        // --- STEP 3: Get Current Rank (Label fixed) ---
        const rankResponse = await fetch(`https://${platformHost}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summonerId}?api_key=${apiKey}`);
        let currentRank = "Unranked";
        if (rankResponse.ok) {
            const rankData = await rankResponse.json();
            const soloDuo = rankData.find(q => q.queueType === "RANKED_SOLO_5x5");
            if (soloDuo) {
                currentRank = `${soloDuo.tier} ${soloDuo.rank} (${soloDuo.leaguePoints} LP)`;
            }
        }

        // --- STEP 4: Get Champion Mastery (NEW LOGIC) ---
        // 4a. Get the full list of all champions from Data Dragon
        const allChampsMap = await getChampionMap();
        
        // 4b. Get the player's personal mastery list
        const masteryResponse = await fetch(`https://${platformHost}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}?api_key=${apiKey}`);
        
        // 4c. Create a temporary map of the player's points
        const playerMasteryMap = new Map();
        if (masteryResponse.ok) {
            const masteryData = await masteryResponse.json();
            masteryData.forEach(champ => {
                playerMasteryMap.set(champ.championId.toString(), {
                    level: champ.championLevel,
                    points: champ.championPoints
                });
            });
        }

        // 4d. Create the full list, merging player data with the master list
        const fullMasteryList = [];
        for (const champId in allChampsMap) {
            const champName = allChampsMap[champId].name;
            const playerStats = playerMasteryMap.get(champId);

            if (playerStats) {
                // Player has mastery on this champ
                fullMasteryList.push({
                    name: champName,
                    level: playerStats.level,
                    points: playerStats.points
                });
            } else {
                // Player has 0 mastery on this champ
                fullMasteryList.push({
                    name: champName,
                    level: 0,
                    points: 0
                });
            }
        }
        // Sort by points by default (highest first)
        fullMasteryList.sort((a, b) => b.points - a.points);


        // --- STEP 5: Get Match List (20 games) ---
        const matchListResponse = await fetch(`https://${regionalHost}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=20&api_key=${apiKey}`);
        if (!matchListResponse.ok) throw new Error('Could not fetch match list.');
        const matchIds = await matchListResponse.json();

        // --- STEP 6: Analyze Matches ---
        let totalKills = 0, totalDeaths = 0, totalAssists = 0, wins = 0, flashOnD = 0, flashOnF = 0;
        const duoPartners = {};
        const FLASH_SPELL_ID = 4;

        for (const matchId of matchIds) {
            const matchResponse = await fetch(`https://${regionalHost}.api.riotgames.com/lol/match/v5/matches/${matchId}?api_key=${apiKey}`);
            if (!matchResponse.ok) continue; 
            
            const matchData = await matchResponse.json();
            const playerInfo = matchData.info.participants.find(p => p.puuid === puuid);
            if (!playerInfo) continue;

            totalKills += playerInfo.kills;
            totalDeaths += playerInfo.deaths;
            totalAssists += playerInfo.assists;
            if (playerInfo.win) wins++;

            if (playerInfo.summoner1Id === FLASH_SPELL_ID) flashOnD++;
            if (playerInfo.summoner2Id === FLASH_SPELL_ID) flashOnF++;

            matchData.info.participants.forEach(participant => {
                if (participant.puuid !== puuid && participant.teamId === playerInfo.teamId) {
                    const gameName = participant.riotIdGameName;
                    const tagLine = participant.riotIdTagline;
                    if (gameName && gameName !== "undefined") {
                        const partnerName = `${gameName}#${tagLine}`;
                        duoPartners[partnerName] = (duoPartners[partnerName] || 0) + 1;
                    }
                }
            });
        }

        // --- STEP 7: Calculate Final Stats ---
        const totalGames = matchIds.length;
        if (totalGames === 0) {
            // Send back data for an account with 0 games
            return response.status(200).json({
                searchedPlayer: { gameName: name, tagLine: tag },
                accountLevel,
                currentRank,
                totalGames: 0, wins: 0, losses: 0, winRate: 0,
                avgKills: 0, avgDeaths: 0, avgAssists: 0, avgKDA: 0,
                flashKey: "N/A",
                duoList: [],
                mastery: fullMasteryList
            });
        }
        
        const losses = totalGames - wins;
        const avgKills = totalKills / totalGames;
        const avgDeaths = totalDeaths / totalGames;
        const avgAssists = totalAssists / totalGames;
        const winRate = (wins / totalGames) * 100;
        const avgKDA = (totalKills + totalAssists) / (totalDeaths === 0 ? 1 : totalDeaths);

        let flashKey = "None";
        if (flashOnD > 0 && flashOnF > 0) flashKey = "D & F";
        else if (flashOnD > 0) flashKey = "D";
        else if (flashOnF > 0) flashKey = "F";

        const duoList = [];
        for (const partner in duoPartners) {
            if (duoPartners[partner] >= 3) { // <-- CHANGED TO 3
                duoList.push({ name: partner, games: duoPartners[partner] });
            }
        }
        duoList.sort((a, b) => b.games - a.games);

        // --- STEP 8: Send all data back to frontend ---
        response.status(200).json({
            searchedPlayer: { gameName: name, tagLine: tag },
            accountLevel,
            currentRank,
            totalGames,
            wins,
            losses,
            winRate,
            avgKills,
            avgDeaths,
            avgAssists,
            avgKDA,
            flashKey,
            duoList,
            mastery: fullMasteryList // Send the new complete list
        });

    } catch (error) {
        response.status(500).json({ error: error.message });
    }
}
