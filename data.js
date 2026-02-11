let config = {
    TBA_API_KEY: "YOUR_TBA_API_KEY_HERE",
    STATBOTICS_API_URL: "https://api.statbotics.io/v3",
    TBA_API_URL: "https://www.thebluealliance.com/api/v3"
};

let addInfoPopupStatbotics = (element) => {
    element.style.position = 'relative';
    element.style.cursor = 'help';

    const infoBoxStatbotics = document.createElement('div');
    infoBoxStatbotics.textContent = 'Data retrieved from Statbotics';
    infoBoxStatbotics.style.visibility = 'hidden';
    infoBoxStatbotics.style.position = 'absolute';
    infoBoxStatbotics.style.bottom = '120%';
    infoBoxStatbotics.style.left = '50%';
    infoBoxStatbotics.style.transform = 'translateX(-50%)';
    infoBoxStatbotics.style.backgroundColor = '#1c1c1c';
    infoBoxStatbotics.style.color = '#ffffff';
    infoBoxStatbotics.style.padding = '5px 10px';
    infoBoxStatbotics.style.borderRadius = '4px';
    infoBoxStatbotics.style.fontSize = '12px';
    infoBoxStatbotics.style.whiteSpace = 'nowrap';
    infoBoxStatbotics.style.zIndex = '1000';
    infoBoxStatbotics.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';

    element.appendChild(infoBoxStatbotics);

    element.addEventListener('mouseenter', () => {
        infoBoxStatbotics.style.visibility = 'visible';
    });

    element.addEventListener('mouseleave', () => {
        infoBoxStatbotics.style.visibility = 'hidden';
    });
}

let addInfoPopupTBA = (element) => {
    element.style.position = 'relative';
    element.style.cursor = 'help';

    const infoBoxStatbotics = document.createElement('div');
    infoBoxStatbotics.textContent = 'Data retrieved from TBA API';
    infoBoxStatbotics.style.visibility = 'hidden';
    infoBoxStatbotics.style.position = 'absolute';
    infoBoxStatbotics.style.bottom = '120%';
    infoBoxStatbotics.style.left = '50%';
    infoBoxStatbotics.style.transform = 'translateX(-50%)';
    infoBoxStatbotics.style.backgroundColor = '#1c1c1c';
    infoBoxStatbotics.style.color = '#ffffff';
    infoBoxStatbotics.style.padding = '5px 10px';
    infoBoxStatbotics.style.borderRadius = '4px';
    infoBoxStatbotics.style.fontSize = '12px';
    infoBoxStatbotics.style.whiteSpace = 'nowrap';
    infoBoxStatbotics.style.zIndex = '1000';
    infoBoxStatbotics.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';

    element.appendChild(infoBoxStatbotics);

    element.addEventListener('mouseenter', () => {
        infoBoxStatbotics.style.visibility = 'visible';
    });

    element.addEventListener('mouseleave', () => {
        infoBoxStatbotics.style.visibility = 'hidden';
    });
}

function checkAndExecute(callback) {
    chrome.storage.local.get(['extensionActive'], function(result) {
        if (result.extensionActive) {
            callback();
        }
    });
}

if (window.location.href.includes("https://www.thebluealliance.com/team/")) {
    checkAndExecute(() => {
        let urlParts = window.location.href.split("/").filter(Boolean); 

        let teamIndex = urlParts.indexOf("team") + 1;
        let teamNumber = urlParts[teamIndex];
        let year = urlParts[teamIndex + 1] || new Date().getFullYear();

        let sendGetRequestForTeamInfo = async (teamNumber, year) => {
            let response = await fetch(`${config.STATBOTICS_API_URL}/team_year/${teamNumber}/${year}`);
            let data = await response.json();
            return data;
        };

        sendGetRequestForTeamInfo(teamNumber, year).then(data => {
            const teamData = data;

            //console.log(teamData);

            const teamTitleDiv = document.querySelector("#team-title")
            teamTitleDiv.style.display = "flex";
            teamTitleDiv.style.flexDirection = "row";

            const teamDiv = document.createElement("div");
            teamDiv.className = "extension-statbotics-team-div";
            teamDiv.style.display = "flex";
            teamDiv.style.flexDirection = "column";
            teamDiv.style.justifyContent = "center";  
            teamDiv.style.alignItems = "center";     
            teamDiv.style.marginLeft = "10px";
            teamDiv.style.gap = "7px";

            const upDiv = document.createElement("div");
            upDiv.className = "up-div";
            upDiv.style.display = "flex";
            upDiv.style.flexDirection = "row";
            upDiv.style.justifyContent = "center";  
            upDiv.style.alignItems = "center";     
            upDiv.style.gap = "10px";

            const downDiv = document.createElement("div");
            downDiv.className = "down-div";
            downDiv.style.display = "flex";
            downDiv.style.flexDirection = "row";
            downDiv.style.justifyContent = "center";  
            downDiv.style.alignItems = "center";     
            downDiv.style.gap = "10px";

            if (teamData.epa && teamData.record) {
                const globalRank = document.createElement("p");
                globalRank.className = "extension-statbotics-rank";
                globalRank.textContent = `Global EPA Rank: ${teamData.epa.ranks.total.rank}`;
                globalRank.style.backgroundColor = "#D76198";
                globalRank.style.padding = "5px 10px";
                globalRank.style.fontSize = "15px";
                globalRank.style.color = "#ffffff";
                globalRank.style.borderRadius = "5px";
                globalRank.style.border = "2px solid #000000";
                globalRank.style.margin = "0";

                const totalEpa = document.createElement("p");
                totalEpa.className = "extension-statbotics-total-epa";
                totalEpa.textContent = `Total EPA Mean: ${teamData.epa.total_points.mean}`;
                totalEpa.style.backgroundColor = "#D76198";
                totalEpa.style.padding = "5px 10px";
                totalEpa.style.fontSize = "15px";
                totalEpa.style.color = "#ffffff";
                totalEpa.style.borderRadius = "5px";
                totalEpa.style.border = "2px solid #000000";
                totalEpa.style.margin = "0";

                const epaPercentile = document.createElement("p");
                epaPercentile.className = "extension-statbotics-epa-percentile";
                epaPercentile.textContent = `EPA Percentile: ${teamData.epa.ranks.total.percentile}`;
                epaPercentile.style.backgroundColor = "#D76198";
                epaPercentile.style.padding = "5px 10px";
                epaPercentile.style.fontSize = "15px";
                epaPercentile.style.color = "#ffffff";
                epaPercentile.style.borderRadius = "5px";
                epaPercentile.style.border = "2px solid #000000";
                epaPercentile.style.margin = "0";

                const winNo = document.createElement("p");
                winNo.className = "extension-statbotics-win";
                winNo.textContent = `Number Of Wins: ${teamData.record.wins}`;
                winNo.style.backgroundColor = "#D76198";
                winNo.style.padding = "5px 10px";
                winNo.style.fontSize = "15px";
                winNo.style.color = "#ffffff";
                winNo.style.borderRadius = "5px";
                winNo.style.border = "2px solid #000000";
                winNo.style.margin = "0";

                const lossNo = document.createElement("p");
                lossNo.className = "extension-statbotics-loss";
                lossNo.textContent = `Number Of Losses: ${teamData.record.losses}`;
                lossNo.style.backgroundColor = "#D76198";
                lossNo.style.padding = "5px 10px";
                lossNo.style.fontSize = "15px";
                lossNo.style.color = "#ffffff";
                lossNo.style.borderRadius = "5px";
                lossNo.style.border = "2px solid #000000";
                lossNo.style.margin = "0";

                const winRate = document.createElement("p");
                winRate.className = "extension-statbotics-winrate";
                winRate.textContent = `Winrate: ${teamData.record.winrate}`;
                winRate.style.backgroundColor = "#D76198";
                winRate.style.padding = "5px 10px";
                winRate.style.fontSize = "15px";
                winRate.style.color = "#ffffff";
                winRate.style.borderRadius = "5px";
                winRate.style.border = "2px solid #000000";
                winRate.style.margin = "0";

                upDiv.appendChild(globalRank);
                upDiv.appendChild(totalEpa);
                upDiv.appendChild(epaPercentile);
                downDiv.appendChild(winNo);
                downDiv.appendChild(lossNo);
                downDiv.appendChild(winRate);

                teamDiv.appendChild(upDiv);
                teamDiv.appendChild(downDiv);

                addInfoPopupStatbotics(globalRank);
                addInfoPopupStatbotics(totalEpa);
                addInfoPopupStatbotics(epaPercentile);
                addInfoPopupStatbotics(winNo);
                addInfoPopupStatbotics(lossNo);
                addInfoPopupStatbotics(winRate);   
            }

            if (!teamData.epa || !teamData.record) {
                const warning = document.createElement("p");
                warning.className = "extension-statbotics-warning";
                warning.textContent = "No Info Available For This Season/Team";
                warning.style.backgroundColor = "#D76198";
                warning.style.padding = "5px 10px";
                warning.style.fontSize = "15px";
                warning.style.color = "#ffffff";
                warning.style.borderRadius = "5px";
                warning.style.border = "2px solid #000000";
                warning.style.margin = "0";

                teamDiv.appendChild(warning);
            }

            const statboticsLink = document.createElement("button");
            statboticsLink.className = "extension-statbotics-rank";
            statboticsLink.textContent = `Statbotics Page`;
            statboticsLink.onclick = () => {
                window.open(`https://www.statbotics.io/team/${teamNumber}`, '_blank');
            };
            statboticsLink.style.backgroundColor = "#940847ff";
            statboticsLink.style.padding = "5px 10px";
            statboticsLink.style.fontSize = "15px";
            statboticsLink.style.color = "#ffffff";
            statboticsLink.style.borderRadius = "5px";
            statboticsLink.style.border = "2px solid #000000";
            statboticsLink.style.margin = "0";
            statboticsLink.addEventListener("mouseenter", () => {
                statboticsLink.style.opacity = "0.8";
            });

            statboticsLink.addEventListener("mouseleave", () => {
                statboticsLink.style.opacity = "1.0"; 
            });

            statboticsLink.addEventListener("mousedown", () => {
                statboticsLink.style.opacity = "0.6";
            });

            statboticsLink.addEventListener("mouseup", () => {
                statboticsLink.style.opacity = "0.8"; 
            });

            teamDiv.appendChild(statboticsLink);

            teamTitleDiv.appendChild(teamDiv);
        });
    });
}

if (window.location.href.includes("https://www.thebluealliance.com/event/")) {
    checkAndExecute(() => {

        let sendGetRequestForEventInfo = async (eventID) => {
            let response = await fetch(`${config.STATBOTICS_API_URL}/event/${eventID}`);
            let data = await response.json();
            return data;
        };

        let sendGetRequestForTeamInfo = async (teamNumber, year) => {
            let response = await fetch(`${config.STATBOTICS_API_URL}/team_year/${teamNumber}/${year}`);
            let data = await response.json();
            return data;
        };

        let sendGetRequestForAwardsInfo = async (eventID) => {
            let eventIDSplit = eventID.split("#")[0];
            let response = await fetch(`${config.TBA_API_URL}/event/${eventIDSplit}/awards`, {
                headers: {
                    'X-TBA-Auth-Key': config.TBA_API_KEY
                }
            });
            let data = await response.json();
            return data;
        };

        let urlParts = window.location.href.split("/").filter(Boolean); 
        let eventIndex = urlParts.indexOf("event") + 1;
        let eventID = urlParts[eventIndex];

        sendGetRequestForEventInfo(eventID).then(data => {
            const eventData = data;

            //console.log(eventData);

            const eventTitleDiv = document.querySelector("#event-name")
            eventTitleDiv.style.display = "flex";
            eventTitleDiv.style.flexDirection = "row";

            const eventDiv = document.createElement("div");
            eventDiv.className = "extension-statbotics-event-div";
            eventDiv.style.display = "flex";
            eventDiv.style.flexDirection = "column";
            eventDiv.style.justifyContent = "center";  
            eventDiv.style.alignItems = "center";     
            eventDiv.style.marginLeft = "10px";
            eventDiv.style.gap = "7px";

            const upDiv = document.createElement("div");
            upDiv.className = "up-div";
            upDiv.style.display = "flex";
            upDiv.style.flexDirection = "row";
            upDiv.style.justifyContent = "center";  
            upDiv.style.alignItems = "center";     
            upDiv.style.gap = "10px";

            const downDiv = document.createElement("div");
            downDiv.className = "down-div";
            downDiv.style.display = "flex";
            downDiv.style.flexDirection = "row";
            downDiv.style.justifyContent = "center";  
            downDiv.style.alignItems = "center";     
            downDiv.style.gap = "10px";

            if (eventData.status_str) {
                const eventStatus = document.createElement("p");
                eventStatus.className = "extension-statbotics-event-status";
                eventStatus.textContent = `Event Status: ${eventData.status_str}`;
                eventStatus.style.backgroundColor = "#D76198";
                eventStatus.style.padding = "5px 10px";
                eventStatus.style.fontSize = "15px";
                eventStatus.style.color = "#ffffff";
                eventStatus.style.borderRadius = "5px";
                eventStatus.style.border = "2px solid #000000";
                eventStatus.style.margin = "0";

                upDiv.appendChild(eventStatus);
                addInfoPopupStatbotics(eventStatus);
            }

            if (!eventData.status_str) {
                const eventStatus = document.createElement("p");
                eventStatus.className = "extension-statbotics-event-status";
                eventStatus.textContent = "Upcoming Event";
                eventStatus.style.backgroundColor = "#D76198";
                eventStatus.style.padding = "5px 10px";
                eventStatus.style.fontSize = "15px";
                eventStatus.style.color = "#ffffff";
                eventStatus.style.borderRadius = "5px";
                eventStatus.style.border = "2px solid #000000";
                eventStatus.style.margin = "0";

                upDiv.appendChild(eventStatus);
                addInfoPopupStatbotics(maxEpa);
            }

            if (eventData.epa && eventData.epa.max) {
                const maxEpa = document.createElement("p");
                maxEpa.className = "extension-statbotics-max-epa";
                maxEpa.textContent = `Max EPA: ${eventData.epa.max}`;
                maxEpa.style.backgroundColor = "#D76198";
                maxEpa.style.padding = "5px 10px";
                maxEpa.style.fontSize = "15px";
                maxEpa.style.color = "#ffffff";
                maxEpa.style.borderRadius = "5px";
                maxEpa.style.border = "2px solid #000000";
                maxEpa.style.margin = "0";

                upDiv.appendChild(maxEpa);
                addInfoPopupStatbotics(maxEpa);
            }

            if (eventData.epa && eventData.epa.max) {
                const meanEPA = document.createElement("p");
                meanEPA.className = "extension-statbotics-max-epa";
                meanEPA.textContent = `Mean EPA: ${eventData.epa.mean}`;
                meanEPA.style.backgroundColor = "#D76198";
                meanEPA.style.padding = "5px 10px";
                meanEPA.style.fontSize = "15px";
                meanEPA.style.color = "#ffffff";
                meanEPA.style.borderRadius = "5px";
                meanEPA.style.border = "2px solid #000000";
                meanEPA.style.margin = "0";

                upDiv.appendChild(meanEPA);
                addInfoPopupStatbotics(meanEPA);
            }

            const statboticsLink = document.createElement("button");
            statboticsLink.className = "extension-statbotics-rank";
            statboticsLink.textContent = `Statbotics Page`;
            statboticsLink.onclick = () => {
                window.open(`https://www.statbotics.io/event/${eventID}`, '_blank');
            };
            statboticsLink.style.backgroundColor = "#940847ff";
            statboticsLink.style.padding = "5px 10px";
            statboticsLink.style.fontSize = "15px";
            statboticsLink.style.color = "#ffffff";
            statboticsLink.style.borderRadius = "5px";
            statboticsLink.style.border = "2px solid #000000";
            statboticsLink.style.margin = "0";
            statboticsLink.addEventListener("mouseenter", () => {
                statboticsLink.style.opacity = "0.8";
            });

            statboticsLink.addEventListener("mouseleave", () => {
                statboticsLink.style.opacity = "1.0"; 
            });

            statboticsLink.addEventListener("mousedown", () => {
                statboticsLink.style.opacity = "0.6";
            });

            statboticsLink.addEventListener("mouseup", () => {
                statboticsLink.style.opacity = "0.8"; 
            });

            downDiv.appendChild(statboticsLink);

            eventDiv.appendChild(upDiv);
            eventDiv.appendChild(downDiv);

            eventTitleDiv.appendChild(eventDiv);

            if (window.location.hash === "#rankings") {
                sendGetRequestForAwardsInfo(eventID).then(awardsData => {
                    //console.log(awardsData);

                    const RankingsTable = document.querySelector("#rankingsTable");

                    const headerRow = RankingsTable.querySelector("thead tr");
                    if (headerRow && !headerRow.querySelector(".awards-header-added")) {
                        const awardsHeader = document.createElement("th");
                        awardsHeader.textContent = "Awards";
                        awardsHeader.classList.add("tablesorter-header", "awards-header-added"); 
                        awardsHeader.style.width = "100px"; 
                        headerRow.appendChild(awardsHeader);
                    }
                    
                    const tableRows = RankingsTable.querySelectorAll("tbody > tr"); 
                    
                    for (let i = 0; i < tableRows.length; i++) {
                        const currentRow = tableRows[i]; 
                        const teamLink = currentRow.querySelector("td:nth-child(2) a");
                        
                        if (!teamLink) {
                            continue; 
                        }
                        
                        const teamNumber = teamLink.textContent.trim();
                        const teamKey = `frc${teamNumber}`;
                        
                        const teamAwards = awardsData.filter(award => 
                            award.recipient_list.some(recipient => recipient.team_key === teamKey)
                        );
                        
                        const awardsCell = document.createElement("td");
                        
                        if (teamAwards.length > 0) {
                            const awardNames = teamAwards.map(award => award.name);
                            
                            const awardsHtml = awardNames.join('<br>');
                            
                            awardsCell.innerHTML = awardsHtml; 
                            
                            addInfoPopupTBA(awardsCell); 
                        } else {
                            awardsCell.textContent = "-"; 
                        }
                        
                        awardsCell.style.padding = "5px 10px";
                        awardsCell.style.border = "1px solid #ddd";
                        awardsCell.style.textAlign = "center";
                        awardsCell.style.fontSize = "0.85em"; 
                        awardsCell.style.color = "#73176dff";

                        currentRow.appendChild(awardsCell); 
                    }
                });

                let createEpaColumnForRanking = async () => {
                    const RankingsTable = document.querySelector("#rankingsTable");

                    const headerRow = RankingsTable.querySelector("thead tr");
                    if (headerRow && !headerRow.querySelector(".epa-header-added")) {
                        const epaHeader = document.createElement("th");
                        epaHeader.textContent = "EPA Mean";
                        epaHeader.classList.add("tablesorter-header", "epa-header-added"); 
                        epaHeader.style.width = "70px"; 
                        headerRow.appendChild(epaHeader);
                    }

                    const tableRows = RankingsTable.querySelectorAll("tbody > tr"); 

                    let year = eventID.slice(0,4);

                    for (let i = 0; i < tableRows.length; i++) {
                        const currentRow = tableRows[i]; 
                        const teamLink = currentRow.querySelector("td:nth-child(2) a");
                        
                        if (!teamLink) {
                            continue; 
                        }
                        
                        const teamNumber = teamLink.textContent.trim();

                        const epaCell = document.createElement("td");
                        epaCell.style.padding = "5px 10px";
                        epaCell.style.border = "1px solid #ddd";
                        epaCell.style.textAlign = "center";
                        epaCell.style.fontSize = "0.85em"; 
                        epaCell.style.color = "#73176dff";
                        epaCell.textContent = "Loading...";

                        addInfoPopupStatbotics(epaCell);
                        currentRow.appendChild(epaCell);

                        sendGetRequestForTeamInfo(teamNumber, year).then(data => {
                            const teamData = data;
                            if (teamData && teamData.epa && teamData.epa.total_points && teamData.epa.total_points.mean !== undefined && teamData.epa.total_points.mean !== null) {
                                epaCell.textContent = teamData.epa.total_points.mean;
                            } else {
                                epaCell.textContent = "-";
                            }
                        }).catch(err => {
                            epaCell.textContent = "-";
                        });
                    }
                }

                createEpaColumnForRanking();
            }

            window.addEventListener('hashchange', () => {
                if (window.location.hash === "#rankings") {
                    window.location.reload();
                }
            });
        });
    });
}

if (window.location.href.includes("https://www.thebluealliance.com/match/")) {
    checkAndExecute(() => {
        let urlParts = window.location.href.split("/").filter(Boolean); 

        let matchIndex = urlParts.indexOf("match") + 1;
        let matchID = urlParts[matchIndex];

        let sendGetRequestForMatchInfo = async (matchID) => {
            let response = await fetch(`${config.STATBOTICS_API_URL}/match/${matchID}`);
            let data = await response.json();
            return data;
        }

        sendGetRequestForMatchInfo(matchID).then(data => {
            const matchData = data;

            //console.log(matchData);

            const matchTitleDiv = document.querySelector("#match-title")
            matchTitleDiv.style.display = "flex";
            matchTitleDiv.style.flexDirection = "row";

            const matchDiv = document.createElement("div");
            matchDiv.className = "extension-statbotics-match-div";
            matchDiv.style.display = "flex";
            matchDiv.style.flexDirection = "column";
            matchDiv.style.justifyContent = "center";  
            matchDiv.style.alignItems = "center";     
            matchDiv.style.marginLeft = "10px";
            matchDiv.style.gap = "7px";

            const upDiv = document.createElement("div");
            upDiv.className = "up-div";
            upDiv.style.display = "flex";
            upDiv.style.flexDirection = "row";
            upDiv.style.justifyContent = "center";  
            upDiv.style.alignItems = "center";     
            upDiv.style.gap = "10px";

            const downDiv = document.createElement("div");
            downDiv.className = "down-div";
            downDiv.style.display = "flex";
            downDiv.style.flexDirection = "row";
            downDiv.style.justifyContent = "center";  
            downDiv.style.alignItems = "center";     
            downDiv.style.gap = "10px";

            if (matchData.pred && matchData.pred.winner) {
                let predictedWinner = matchData.pred.winner;
                predictedWinner = predictedWinner.charAt(0).toUpperCase() + predictedWinner.slice(1);
                const matchPrediction = document.createElement("p");
                matchPrediction.className = "extension-statbotics-prediction";
                matchPrediction.textContent = `Predicted Winner: ${predictedWinner}`;
                matchPrediction.style.backgroundColor = "#D76198";
                matchPrediction.style.padding = "5px 10px";
                matchPrediction.style.fontSize = "15px";
                matchPrediction.style.color = "#ffffff";
                matchPrediction.style.borderRadius = "5px";
                matchPrediction.style.border = "2px solid #000000";
                matchPrediction.style.margin = "0";

                const matchWinProbability = document.createElement("p");
                matchWinProbability.className = "extension-statbotics-probability";
                if (matchData.pred.winner === "red") {
                    matchWinProbability.textContent = `Predicted Winner Probability: ${(matchData.pred.red_win_prob*100).toFixed(2)}%`;
                } else if (matchData.pred.winner === "blue") {
                    matchWinProbability.textContent = `Predicted Winner's Winning Percentage: ${((1-matchData.pred.red_win_prob)*100).toFixed(2)}%`;
                }
                matchWinProbability.style.backgroundColor = "#D76198";
                matchWinProbability.style.padding = "5px 10px";
                matchWinProbability.style.fontSize = "15px";
                matchWinProbability.style.color = "#ffffff";
                matchWinProbability.style.borderRadius = "5px";
                matchWinProbability.style.border = "2px solid #000000";
                matchWinProbability.style.margin = "0";

                upDiv.appendChild(matchPrediction);
                upDiv.appendChild(matchWinProbability);

                matchDiv.appendChild(upDiv);
                matchDiv.appendChild(downDiv);

                addInfoPopupStatbotics(matchPrediction);
                addInfoPopupStatbotics(matchWinProbability);

                if (matchData.result && matchData.result.winner) {
                    let realWinner = matchData.result.winner;
                    realWinner = realWinner.charAt(0).toUpperCase() + realWinner.slice(1);
                    const winner = document.createElement("p");
                    winner.className = "extension-statbotics-winner";
                    winner.textContent = `Winner: ${realWinner}`;
                    winner.style.backgroundColor = "#D76198";
                    winner.style.padding = "5px 10px";
                    winner.style.fontSize = "15px";
                    winner.style.color = "#ffffff";
                    winner.style.borderRadius = "5px";
                    winner.style.border = "2px solid #000000";
                    winner.style.margin = "0";

                    downDiv.appendChild(winner);
                    addInfoPopupStatbotics(winner);
                } 

                const statboticsLink = document.createElement("button");
                statboticsLink.className = "extension-statbotics-rank";
                statboticsLink.textContent = `Statbotics Page`;
                statboticsLink.onclick = () => {
                    window.open(`https://www.statbotics.io/match/${matchID}`, '_blank');
                };
                statboticsLink.style.backgroundColor = "#940847ff";
                statboticsLink.style.padding = "5px 10px";
                statboticsLink.style.fontSize = "15px";
                statboticsLink.style.color = "#ffffff";
                statboticsLink.style.borderRadius = "5px";
                statboticsLink.style.border = "2px solid #000000";
                statboticsLink.style.margin = "0";
                statboticsLink.addEventListener("mouseenter", () => {
                    statboticsLink.style.opacity = "0.8";
                });

                statboticsLink.addEventListener("mouseleave", () => {
                    statboticsLink.style.opacity = "1.0"; 
                });

                statboticsLink.addEventListener("mousedown", () => {
                    statboticsLink.style.opacity = "0.6";
                });

                statboticsLink.addEventListener("mouseup", () => {
                    statboticsLink.style.opacity = "0.8"; 
                });

                downDiv.appendChild(statboticsLink);
            }
            else {
                if (matchData.result && matchData.result.winner) {
                    let realWinner = matchData.result.winner;
                    realWinner = realWinner.charAt(0).toUpperCase() + realWinner.slice(1);
                    const winner = document.createElement("p");
                    winner.className = "extension-statbotics-winner";
                    winner.textContent = `Winner: ${realWinner}`;
                    winner.style.backgroundColor = "#D76198";
                    winner.style.padding = "5px 10px";
                    winner.style.fontSize = "15px";
                    winner.style.color = "#ffffff";
                    winner.style.borderRadius = "5px";
                    winner.style.border = "2px solid #000000";
                    winner.style.margin = "0";

                    matchDiv.appendChild(winner);
                    addInfoPopupStatbotics(winner);
                } 
            }

            if ((!matchData.pred || !matchData.pred.winner) && (!matchData.result || !matchData.result.winner)) { 
                const warning = document.createElement("p");
                warning.className = "extension-statbotics-warning";
                warning.textContent = "No Info Available For This Match";
                warning.style.backgroundColor = "#D76198";
                warning.style.padding = "5px 10px";
                warning.style.fontSize = "15px";
                warning.style.color = "#ffffff";
                warning.style.borderRadius = "5px";
                warning.style.border = "2px solid #000000";
                warning.style.margin = "0";

                matchDiv.appendChild(warning);
            }

            matchTitleDiv.appendChild(matchDiv);
        });
    });
}