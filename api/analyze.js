const fetch = require('node-fetch');

// --- HELPER FUNCTIONS ---

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
            map[champ.key] = { id: champ.key, name: champ.name };
        }
        championMap = map;
        return championMap;
    } catch (e) {
        console.error("Failed to fetch champion map:", e);
        return {}; 
    }
}

function getRankNumber(tier) {
    const ranks = {
        "IRON": 0, "BRONZE": 1, "SILVER": 2, "GOLD": 3, "PLATINUM": 4, 
        "EMERALD": 5, "DIAMOND": 6, "MASTER": 7, "GRANDMASTER": 8, "CHALLENGER": 9
    };
    return ranks[tier] || 0;
}

// Improved smurf detection heuristics
function getStatHighlights(stats) {
    const highlights = {
        totalWinRate: 'neutral',
        profileIcon: 'neutral',
        flash: 'neutral',
        multiKills: 'neutral',
        dpm: 'neutral',
        cspm: 'neutral',
        kp: 'neutral',
        visionScore: 'neutral',
        rankedGamesPlayed: 'neutral',
        championPool: 'neutral',
        rankedWinRate: 'neutral'
    };

    const rankNum = getRankNumber(stats.rankTier);
    
    // Total season win rate check
    if (stats.totalGames >= 30 && stats.totalWinRate > 70 && rankNum < 7) { 
        highlights.totalWinRate = 'red';
    } else if (stats.totalGames >= 50 && stats.totalWinRate > 60 && rankNum < 5) {
        highlights.totalWinRate = 'red';
    }

    // Recent ranked win rate check
    if (stats.rankedGamesCount >= 10 && stats.rankedWinRate > 70 && rankNum < 7) {
        highlights.rankedWinRate = 'red';
    } else if (stats.rankedGamesCount >= 20 && stats.rankedWinRate > 65 && rankNum < 5) {
        highlights.rankedWinRate = 'red';
    }
    
    // Default icon is STRONG smurf indicator
    if (stats.profileIcon <= 28) {
        highlights.profileIcon = 'red';
    }
    
    // Flash on both D & F = account sharing/multiple users
    if (stats.flashKey === 'D & F') {
        highlights.flash = 'red';
    }
    
    // Multi-kills in low elo
    if (stats.multiKills > 0 && rankNum < 6) {
        highlights.multiKills = 'red';
    }
    
    // DPM thresholds by rank
    if (rankNum < 3 && stats.avgDPM > 650) { 
        highlights.dpm = 'red';
    } else if (rankNum >= 3 && rankNum < 6 && stats.avgDPM > 850) { 
        highlights.dpm = 'red';
    }
    
    // CS thresholds by rank
    if (rankNum < 3 && stats.avgCSPM > 7) { 
        highlights.cspm = 'red';
    } else if (rankNum >= 3 && rankNum < 6 && stats.avgCSPM > 8) { 
        highlights.cspm = 'red';
    }
    
    // Kill participation
    if (stats.avgKP > 75) { 
        highlights.kp = 'red';
    } else if (stats.avgKP > 65) { 
        highlights.kp = 'green';
    }

    // Vision score check (high vision in low elo = experienced player)
    if (rankNum < 4 && stats.avgVisionScore > 50) {
        highlights.visionScore = 'red';
    } else if (rankNum < 6 && stats.avgVisionScore > 60) {
        highlights.visionScore = 'red';
    }

    // Low ranked games played with high rank = smurf
    if (stats.totalGames < 50 && rankNum >= 5) {
        highlights.rankedGamesPlayed = 'red';
    } else if (stats.totalGames < 100 && rankNum >= 7) {
        highlights.rankedGamesPlayed = 'red';
    }

    // Small champion pool = smurf (one-tricks)
    if (stats.uniqueChampionsPlayed <= 5 && stats.rankedGamesCount >= 20) {
        highlights.championPool = 'red';
    }

    return highlights;
}

// --- MAIN API FUNCTION ---

export default async function handler(request, response) {
    // Set CORS headers to allow requests from your production domain
    // Replace '*' with 'https://your-domain.com' in production
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle OPTIONS preflight request
    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }

    const { name, tag, region } = request.query;
    const apiKey = process.env.RIOT_API_KEY; // This is the secure way

    if (!apiKey) return response.status(500).json({ error: "API key is not configured." });
    if (!name || !tag || !region) return response.status(400).json({ error: "Game Name, Tag, and Region are required." });

    const platformHost = region.toLowerCase();
    const regionalHost = getRegionalHost(platformHost);

    try {
        // --- STEP 1: Get PUUID ---
        const accountResponse = await fetch(`https://${regionalHost}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${name}/${tag}?api_key=${apiKey}`);
        if (!accountResponse.ok) throw new Error(`Riot ID not found (Error ${accountResponse.status}). Check Game Name, Tag, and Region.`);
        const accountData = await accountResponse.json();
        const puuid = accountData.puuid;

        // --- STEP 2: Get Summoner Data ---
        const summonerResponse = await fetch(`https://${platformHost}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}?api_key=${apiKey}`);
        if (!summonerResponse.ok) throw new Error(`Summoner data not found (Error ${summonerResponse.status}).`);
        const summonerData = await summonerResponse.json();
        const accountLevel = summonerData.summonerLevel;
        const summonerId = summonerData.id;
        const profileIconId = summonerData.profileIconId; // <-- We need this for the frontend

        // --- STEP 3: Get Rank Data ---
        const rankResponse = await fetch(`https://${platformHost}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summonerId}?api_key=${apiKey}`);
        
        let currentRank = "Unranked";
        let rankTier = "UNRANKED";
        let totalRankStats = { display: "0W - 0L (0%)", wins: 0, losses: 0, winRate: 0, totalGames: 0 };
        
        if (!rankResponse.ok) {
            console.error(`Rank API Error: ${rankResponse.status} - ${rankResponse.statusText}`);
            // Don't throw an error, just means they are unranked or API failed
        } else {
            const rankData = await rankResponse.json();
            const soloDuo = rankData.find(q => q.queueType === "RANKED_SOLO_5x5");
            const flex = rankData.find(q => q.queueType === "RANKED_FLEX_SR");

            let bestRank = null;
            let rankLabel = "";
            let bestRankNum = -1;

            if (soloDuo) {
                bestRank = soloDuo;
                rankLabel = "(Solo/Duo)";
                bestRankNum = getRankNumber(soloDuo.tier);
            }
            
            if (flex) {
                const flexRankNum = getRankNumber(flex.tier);
                if (flexRankNum > bestRankNum) {
                    bestRank = flex;
                    rankLabel = "(Flex)";
                }
            }

            if (bestRank) {
                currentRank = `${bestRank.tier} ${bestRank.rank} (${bestRank.leaguePoints} LP) ${rankLabel}`;
                rankTier = bestRank.tier;
                const totalGames = bestRank.wins + bestRank.losses;
                const winRate = totalGames > 0 ? (bestRank.wins / totalGames) * 100 : 0;
                totalRankStats = {
                    display: `${bestRank.wins}W - ${bestRank.losses}L (${winRate.toFixed(1)}%)`,
                    wins: bestRank.wins,
                    losses: bestRank.losses,
                    winRate: winRate,
                    totalGames: totalGames
                };
            }
        }

        // --- STEP 4: Get Champion Mastery (Optional for main page, but good for smurf) ---
        const allChampsMap = await getChampionMap();
        const masteryResponse = await fetch(`https://${platformHost}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}?api_key=${apiKey}`);
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
        const fullMasteryList = [];
        for (const champId in allChampsMap) {
            const champName = allChampsMap[champId].name;
            const playerStats = playerMasteryMap.get(champId);
            fullMasteryList.push({
                name: champName,
                level: playerStats ? playerStats.level : 0,
                points: playerStats ? playerStats.points : 0
            });
        }
        fullMasteryList.sort((a, b) => b.points - a.points);

        // --- STEP 5: Get Match List (UPDATED: 'type=ranked' & count=5) ---
        // This is the fix you asked for: only get ranked games. 
        // We get 5 for the main page display.
        const matchListResponse = await fetch(`https://${regionalHost}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?type=ranked&start=0&count=5&api_key=${apiKey}`);
        if (!matchListResponse.ok) throw new Error(`Could not fetch match list (Error ${matchListResponse.status})`);
        const matchIds = await matchListResponse.json();

        // --- STEP 6: Analyze Matches ---
        let totalKills = 0, totalDeaths = 0, totalAssists = 0, wins = 0, flashOnD = 0, flashOnF = 0;
        let totalDPM = 0, totalCSPM = 0, totalKP = 0, totalMultiKills = 0, totalVisionScore = 0;
        const duoPartners = {};
        const uniqueChampions = new Set();
        const FLASH_SPELL_ID = 4;
        let validGames = 0;
        const matchHistoryForFrontend = []; // <-- NEW: We will send this to the frontend

        for (const matchId of matchIds) {
            const matchResponse = await fetch(`https://${regionalHost}.api.riotgames.com/lol/match/v5/matches/${matchId}?api_key=${apiKey}`);
            if (!matchResponse.ok) continue;
            
            const matchData = await matchResponse.json();
            if (matchData.info.gameDuration < 300) continue; // Skip < 5min
            
            const gameDurationMinutes = matchData.info.gameDuration / 60;
            const playerInfo = matchData.info.participants.find(p => p.puuid === puuid);
            if (!playerInfo) continue;
            
            validGames++;
            uniqueChampions.add(playerInfo.championName);

            const team = matchData.info.teams.find(t => t.teamId === playerInfo.teamId);
            const playerKP = (playerInfo.kills + playerInfo.assists);
            let teamKills = (team && team.objectives.champion.kills) ? team.objectives.champion.kills : 0;

            let participation = 0;
            if (teamKills > 0) {
                participation = (playerKP / teamKills) * 100;
                if (participation > 100) participation = 100;
            } else if (playerKP > 0) {
                participation = 100;
            }
            
            // Add to match history list for frontend
            matchHistoryForFrontend.push({
                win: playerInfo.win,
                kills: playerInfo.kills,
                deaths: playerInfo.deaths,
                assists: playerInfo.assists,
                championName: playerInfo.championName,
                gameDuration: matchData.info.gameDuration,
                queueType: matchData.info.queueId === 420 ? "Ranked Solo/Duo" : "Ranked Flex"
            });

            // Stats for smurf detection
            totalKP += participation;
            totalKills += playerInfo.kills;
            totalDeaths += playerInfo.deaths;
            totalAssists += playerInfo.assists;
            if (playerInfo.win) wins++;
            totalDPM += playerInfo.totalDamageDealtToChampions / gameDurationMinutes;
            totalCSPM += playerInfo.totalMinionsKilled / gameDurationMinutes;
            totalMultiKills += (playerInfo.pentaKills + playerInfo.quadraKills);
            totalVisionScore += playerInfo.visionScore || 0;

            if (playerInfo.summoner1Id === FLASH_SPELL_ID) flashOnD++;
            if (playerInfo.summoner2Id === FLASH_SPELL_ID) flashOnF++;

            // Duo detection
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

        // --- STEP 7: Calculate Stats ---
        const totalGames = validGames;
        if (totalGames === 0) {
            // No recent ranked games found
            return response.status(200).json({
                searchedPlayer: { gameName: name, tagLine: tag },
                accountLevel, 
                profileIconId,
                currentRank, 
                totalRank: totalRankStats,
                matchHistory: [],
                // ... other stats can be zeroed out
                highlights: getStatHighlights({ rankTier, ...totalRankStats, profileIcon: profileIconId, rankedGamesCount: 0, rankedWinRate: 0 })
            });
        }

        const losses = totalGames - wins;
        const recentWinRate = (wins / totalGames) * 100;
        const avgKDA = (totalKills + totalAssists) / (totalDeaths === 0 ? 1 : totalDeaths);
        const avgDPM = totalDPM / totalGames;
        const avgCSPM = totalCSPM / totalGames;
        const avgKP = totalKP / totalGames;
        const avgVisionScore = totalVisionScore / totalGames;

        let flashKey = "None";
        if (flashOnD > 0 && flashOnF > 0) flashKey = "D & F";
        else if (flashOnD > 0) flashKey = "D";
        else if (flashOnF > 0) flashKey = "F";

        const duoList = [];
        for (const partner in duoPartners) {
            if (duoPartners[partner] >= 2) {
                duoList.push({ name: partner, games: duoPartners[partner] });
            }
        }
        duoList.sort((a, b) => b.games - a.games);
        
        const highlights = getStatHighlights({
            rankTier,
            ...totalRankStats,
            profileIcon: profileIconId,
            flashKey,
            multiKills: totalMultiKills,
            avgDPM,
            avgCSPM,
            avgKP,
            avgVisionScore,
            uniqueChampionsPlayed: uniqueChampions.size,
            rankedGamesCount: totalGames,
            rankedWinRate: recentWinRate
        });

        // --- STEP 8: Return Data ---
        response.status(200).json({
            searchedPlayer: { gameName: name, tagLine: tag },
            accountLevel,
            profileIconId, // <-- ADDED for frontend
            currentRank, 
            totalRank: totalRankStats,
            
            // These are all RANKED-ONLY stats now
            rankedGames: totalGames,
            rankedWins: wins,
            rankedLosses: losses,
            rankedWinRate: recentWinRate,
            rankedAvgKDA: avgKDA,
            rankedAvgDPM: avgDPM,
            rankedAvgCSPM: avgCSPM,
            rankedAvgKP: avgKP,
            rankedAvgVisionScore: avgVisionScore,
            
            multiKills: totalMultiKills,
            flashKey,
            duoList,
            mastery: fullMasteryList,
            rankedUniqueChampions: uniqueChampions.size,
            highlights,
            matchHistory: matchHistoryForFrontend // <-- ADDED for frontend
        });

    } catch (error) {
        console.error("Error in /api/analyze:", error);
        response.status(500).json({ error: error.message });
    }
}

