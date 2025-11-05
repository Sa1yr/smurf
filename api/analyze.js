const fetch = require('node-fetch');

// --- HELPER FUNCTIONS ---

// Gets the correct continental server for each platform
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

// Fetches and caches the champion list from Data Dragon
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

// Converts a rank (e.g., "SILVER") to a number for comparison
function getRankNumber(tier) {
    const ranks = {
        "IRON": 0, "BRONZE": 1, "SILVER": 2, "GOLD": 3, "PLATINUM": 4, 
        "EMERALD": 5, "DIAMOND": 6, "MASTER": 7, "GRANDMASTER": 8, "CHALLENGER": 9
    };
    return ranks[tier] || 0;
}

// --- Heuristic (Rules of Thumb) analysis function ---
function getStatHighlights(stats) {
    const highlights = {
        totalWinRate: 'neutral',
        profileIcon: 'neutral',
        flash: 'neutral',
        multiKills: 'neutral',
        dpm: 'neutral',
        cspm: 'neutral',
        kp: 'neutral'
    };

    const rankNum = getRankNumber(stats.rankTier); 

    if (stats.totalGames >= 50 && stats.totalWinRate > 65 && rankNum < 6) { 
        highlights.totalWinRate = 'red';
    }
    if (stats.profileIcon <= 28) {
        highlights.profileIcon = 'red';
    }
    if (stats.flashKey === 'D & F') {
        highlights.flash = 'red';
    }
    if (stats.multiKills > 0) {
        highlights.multiKills = 'red';
    }
    if (rankNum < 3 && stats.avgDPM > 700) { 
        highlights.dpm = 'red';
    } else if (rankNum < 6 && stats.avgDPM > 900) { 
        highlights.dpm = 'red';
    }
    if (rankNum < 3 && stats.avgCSPM > 7.5) { 
        highlights.cspm = 'red';
    } else if (rankNum < 6 && stats.avgCSPM > 8.5) { 
        highlights.cspm = 'red';
    }
    if (stats.avgKP > 75) { 
        highlights.kp = 'red';
    } else if (stats.avgKP > 65) { 
        highlights.kp = 'green';
    }

    return highlights;
}


// --- MAIN API FUNCTION ---

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
        if (!accountResponse.ok) throw new Error(`Riot ID not found (Error ${accountResponse.status}). Check Game Name, Tag, and Region.`);
        const accountData = await accountResponse.json();
        const puuid = accountData.puuid;

        // --- STEP 2: Get Summoner Data (Level, Icon, ID) ---
        const summonerResponse = await fetch(`https://${platformHost}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}?api_key=${apiKey}`);
        if (!summonerResponse.ok) throw new Error(`Summoner data not found (Error ${summonerResponse.status}).`);
        const summonerData = await summonerResponse.json();
        const accountLevel = summonerData.summonerLevel;
        const summonerId = summonerData.id;
        const profileIconId = summonerData.profileIconId;

        // --- STEP 3: Get Rank & Total Season Stats (With Error Debugging) ---
        const rankResponse = await fetch(`https://${platformHost}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summonerId}?api_key=${apiKey}`);
        
        let currentRank = "Unranked";
        let rankTier = "UNRANKED";
        let totalRankStats = { display: "0W - 0L (0%)", wins: 0, losses: 0, winRate: 0, totalGames: 0 };
        
        if (!rankResponse.ok) {
            currentRank = `API Error: ${rankResponse.status}`;
            console.error(`Rank API call failed: ${rankResponse.status} ${rankResponse.statusText}`);
            totalRankStats.display = `API Error: ${rankResponse.status}`;
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

        // --- STEP 4: Get Champion Mastery (Full List) ---
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
        fullMasteryList.sort((a, b) => b.points - a.points); // Sort by points by default

        // --- STEP 5: Get Match List (20 games, ALL modes) ---
        const matchListResponse = await fetch(`https://${regionalHost}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=20&api_key=${apiKey}`);
        if (!matchListResponse.ok) throw new Error(`Could not fetch match list (Error ${matchListResponse.status})`);
        const matchIds = await matchListResponse.json();

        // --- STEP 6: Analyze Matches ---
        let totalKills = 0, totalDeaths = 0, totalAssists = 0, wins = 0, flashOnD = 0, flashOnF = 0;
        let totalDPM = 0, totalCSPM = 0, totalKP = 0, totalMultiKills = 0;
        const duoPartners = {};
        const FLASH_SPELL_ID = 4;
        let validGames = 0; 

        for (const matchId of matchIds) {
            const matchResponse = await fetch(`https://${regionalHost}.api.riotgames.com/lol/match/v5/matches/${matchId}?api_key=${apiKey}`);
            if (!matchResponse.ok) continue; 
            
            const matchData = await matchResponse.json();
            if (matchData.info.gameDuration < 300) continue; // Skip games less than 5 min
            
            const gameDurationMinutes = matchData.info.gameDuration / 60;
            const playerInfo = matchData.info.participants.find(p => p.puuid === puuid);
            if (!playerInfo) continue;

            validGames++; 
            const team = matchData.info.teams.find(t => t.teamId === playerInfo.teamId);
            
            // --- KP BUG FIX ---
            const playerKP = (playerInfo.kills + playerInfo.assists);
            let teamKills = (team && team.objectives.champion.kills) ? team.objectives.champion.kills : 0;

            let participation = 0;
            if (teamKills > 0) {
                participation = (playerKP / teamKills) * 100;
                if (participation > 100) { participation = 100; } // Hard cap at 100%
            } else if (playerKP > 0) {
                participation = 100; // Team kills were 0, but player had KP, so 100%
            }
            totalKP += participation;
            // --- END KP FIX ---

            totalKills += playerInfo.kills;
            totalDeaths += playerInfo.deaths;
            totalAssists += playerInfo.assists;
            if (playerInfo.win) wins++;

            if (playerInfo.summoner1Id === FLASH_SPELL_ID) flashOnD++;
            if (playerInfo.summoner2Id === FLASH_SPELL_ID) flashOnF++;

            totalDPM += playerInfo.totalDamageDealtToChampions / gameDurationMinutes;
            totalCSPM += playerInfo.totalMinionsKilled / gameDurationMinutes;
            totalMultiKills += (playerInfo.pentaKills + playerInfo.quadraKills);

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
        const totalGames = validGames; 
        if (totalGames === 0) {
            const highlights = getStatHighlights({ rankTier, ...totalRankStats, profileIcon: profileIconId });
            return response.status(200).json({
                searchedPlayer: { gameName: name, tagLine: tag },
                accountLevel, profileIcon: { isDefault: profileIconId <= 28 },
                currentRank, totalRank: totalRankStats,
                totalGames: 0, wins: 0, losses: 0, recentWinRate: 0,
                avgKills: 0, avgDeaths: 0, avgAssists: 0, avgKDA: 0,
                avgDPM: 0, avgCSPM: 0, avgKP: 0, multiKills: 0,
                flashKey: "N/A", duoList: [], mastery: fullMasteryList, highlights
            });
        }
        
        const losses = totalGames - wins;
        const avgKills = totalKills / totalGames;
        const avgDeaths = totalDeaths / totalGames;
        const avgAssists = totalAssists / totalGames;
        const recentWinRate = (wins / totalGames) * 100;
        const avgKDA = (totalKills + totalAssists) / (totalDeaths === 0 ? 1 : totalDeaths);
        
        const avgDPM = totalDPM / totalGames;
        const avgCSPM = totalCSPM / totalGames;
        const avgKP = totalKP / totalGames;

        let flashKey = "None";
        if (flashOnD > 0 && flashOnF > 0) flashKey = "D & F";
        else if (flashOnD > 0) flashKey = "D";
        else if (flashOnF > 0) flashKey = "F";

        const duoList = [];
        for (const partner in duoPartners) {
            if (duoPartners[partner] >= 3) { // 3+ games
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
            avgKP
        });

        // --- STEP 8: Send all data back to frontend ---
        response.status(200).json({
            searchedPlayer: { gameName: name, tagLine: tag },
            accountLevel,
            profileIcon: { isDefault: profileIconId <= 28 },
            currentRank, 
            totalRank: totalRankStats,
            totalGames,
            wins,
            losses,
            recentWinRate,
            avgKills,
            avgDeaths,
            avgAssists,
            avgKDA,
            avgDPM,
            avgCSPM,
            avgKP,
            multiKills: totalMultiKills,
            flashKey,
            duoList,
            mastery: fullMasteryList,
            highlights
        });

    } catch (error) {
        response.status(500).json({ error: error.message });
    }
}
