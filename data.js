const config = {
    TBA_API_KEY: "Lkhnl56wDJBdPirtd4tjhQLibg8ZKkaMjuNUY9eaKqOnJhJQgtIklsIBPUCPbApP",
    STATBOTICS_API_URL: "https://api.statbotics.io/v3",
    PEEKOROBO_API_URL: "https://peekorobo-db-bec52087b7e6.herokuapp.com",
    PEEKOROBO_SITE_URL: "https://www.peekorobo.com",
    TBA_API_URL: "https://www.thebluealliance.com/api/v3"
};

const SOURCE_STATBOTICS = "statbotics";
const SOURCE_PEEKOROBO = "peekorobo";
const SOURCE_BOTH = "both";
const ROOT_ID = "arcbotics-injected-root";
const MARKER_ATTR = "data-arcbotics";
const SOURCE_ORDER = [SOURCE_STATBOTICS, SOURCE_PEEKOROBO];
const TBA_HOSTS = new Set(["www.thebluealliance.com", "beta.thebluealliance.com"]);

const SOURCES = {
    [SOURCE_STATBOTICS]: {
        id: SOURCE_STATBOTICS,
        name: "Statbotics",
        ratingName: "EPA",
        tooltip: "Data retrieved from Statbotics",
        color: "#D76198",
        textColor: "#ffffff",
        linkColor: "#940847",
        linkTextColor: "#ffffff",
        tableColor: "#73176d",
        teamUrl: (teamNumber) => `https://www.statbotics.io/team/${teamNumber}`,
        eventUrl: (eventID) => `https://www.statbotics.io/event/${eventID}`,
        matchUrl: (matchID) => `https://www.statbotics.io/match/${matchID}`,
        linkLabel: "Statbotics Page"
    },
    [SOURCE_PEEKOROBO]: {
        id: SOURCE_PEEKOROBO,
        name: "Peekorobo",
        ratingName: "ACE",
        tooltip: "Data retrieved from Peekorobo",
        color: "#1a1a1a",
        textColor: "#ffdd00",
        linkColor: "#ffdd00",
        linkTextColor: "#1a1a1a",
        tableColor: "#7a5a00",
        teamUrl: (teamNumber, year) => `${config.PEEKOROBO_SITE_URL}/team/${teamNumber}/${year}`,
        eventUrl: (eventID) => `${config.PEEKOROBO_SITE_URL}/event/${eventID}`,
        matchUrl: (matchID) => {
            const eventKey = String(matchID).split("_")[0];
            return `${config.PEEKOROBO_SITE_URL}/match/${eventKey}/${matchID}`;
        },
        linkLabel: "Peekorobo Page"
    }
};

let currentSettings = {
    extensionActive: true,
    dataSource: SOURCE_PEEKOROBO
};
let renderGeneration = 0;
let hashChangeBound = false;
let domObserverBound = false;
let domRerunTimer = null;
let betaHydrationReady = window.location.hostname !== "beta.thebluealliance.com";

function getActiveSources() {
    if (currentSettings.dataSource === SOURCE_BOTH) {
        return SOURCE_ORDER.map((id) => SOURCES[id]);
    }
    return [SOURCES[currentSettings.dataSource] || SOURCES[SOURCE_PEEKOROBO]];
}

function isBothMode() {
    return currentSettings.dataSource === SOURCE_BOTH;
}

function applyPillStyle(element, source, options = {}) {
    const background = options.background || source.color;
    const color = options.color || source.textColor;
    element.style.backgroundColor = background;
    element.style.padding = "5px 10px";
    element.style.fontSize = "15px";
    element.style.color = color;
    element.style.borderRadius = "5px";
    element.style.border = "2px solid #000000";
    element.style.margin = "0";
}

function addInfoPopup(element, text) {
    element.style.position = "relative";
    element.style.cursor = "help";

    const infoBox = document.createElement("div");
    infoBox.textContent = text;
    infoBox.style.visibility = "hidden";
    infoBox.style.position = "absolute";
    infoBox.style.bottom = "120%";
    infoBox.style.left = "50%";
    infoBox.style.transform = "translateX(-50%)";
    infoBox.style.backgroundColor = "#1c1c1c";
    infoBox.style.color = "#ffffff";
    infoBox.style.padding = "5px 10px";
    infoBox.style.borderRadius = "4px";
    infoBox.style.fontSize = "12px";
    infoBox.style.whiteSpace = "nowrap";
    infoBox.style.zIndex = "1000";
    infoBox.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
    infoBox.setAttribute(MARKER_ATTR, "1");

    element.appendChild(infoBox);

    element.addEventListener("mouseenter", () => {
        infoBox.style.visibility = "visible";
    });
    element.addEventListener("mouseleave", () => {
        infoBox.style.visibility = "hidden";
    });
}

function createPill(text, source, className) {
    const pill = document.createElement("p");
    pill.className = className;
    pill.textContent = text;
    applyPillStyle(pill, source);
    addInfoPopup(pill, source.tooltip);
    return pill;
}

function styleHoverButton(button) {
    button.addEventListener("mouseenter", () => {
        button.style.opacity = "0.8";
    });
    button.addEventListener("mouseleave", () => {
        button.style.opacity = "1.0";
    });
    button.addEventListener("mousedown", () => {
        button.style.opacity = "0.6";
    });
    button.addEventListener("mouseup", () => {
        button.style.opacity = "0.8";
    });
}

function createLinkButton(source, url) {
    const button = document.createElement("button");
    button.className = "extension-source-link";
    button.textContent = source.linkLabel;
    button.onclick = () => window.open(url, "_blank");
    applyPillStyle(button, source, {
        background: source.linkColor,
        color: source.linkTextColor
    });
    styleHoverButton(button);
    return button;
}

function createFlexRow(className) {
    const row = document.createElement("div");
    if (className) row.className = className;
    row.style.display = "flex";
    row.style.flexDirection = "row";
    row.style.flexWrap = "wrap";
    row.style.justifyContent = "center";
    row.style.alignItems = "center";
    row.style.gap = "10px";
    return row;
}

function createSourceToggle() {
    const wrap = document.createElement("div");
    wrap.className = "extension-source-toggle";
    wrap.style.display = "flex";
    wrap.style.flexDirection = "row";
    wrap.style.gap = "6px";
    wrap.style.alignItems = "center";

    const options = [
        { id: SOURCE_STATBOTICS, name: "Statbotics", background: "#940847", color: "#ffffff" },
        { id: SOURCE_PEEKOROBO, name: "Peekorobo", background: "#ffdd00", color: "#1a1a1a" },
        { id: SOURCE_BOTH, name: "Both", background: "#3366CC", color: "#ffffff" }
    ];

    options.forEach((option) => {
        const button = document.createElement("button");
        button.textContent = option.name;
        button.type = "button";
        const active = currentSettings.dataSource === option.id;
        applyPillStyle(button, SOURCES[SOURCE_PEEKOROBO], {
            background: active ? option.background : "#6b6b6b",
            color: active ? option.color : "#ffffff"
        });
        button.style.fontSize = "13px";
        button.style.cursor = "pointer";
        button.style.opacity = active ? "1" : "0.7";
        button.disabled = active;
        button.onclick = () => {
            chrome.storage.local.set({ dataSource: option.id });
        };
        styleHoverButton(button);
        wrap.appendChild(button);
    });

    return wrap;
}

function createLayout() {
    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.setAttribute(MARKER_ATTR, "1");
    root.style.display = "flex";
    root.style.flexDirection = "column";
    root.style.justifyContent = "center";
    root.style.alignItems = "center";
    root.style.marginLeft = "10px";
    root.style.gap = "7px";

    const downDiv = createFlexRow("down-div");
    root.appendChild(downDiv);
    return {
        root,
        downDiv,
        addRow() {
            const row = createFlexRow();
            root.insertBefore(row, downDiv);
            return row;
        }
    };
}

function attachRoot(parent) {
    parent.style.display = "flex";
    parent.style.flexDirection = "row";
    parent.style.flexWrap = "wrap";
    parent.style.alignItems = "center";
    const layout = createLayout();
    parent.appendChild(layout.root);
    return layout;
}

function clearInjected() {
    document.getElementById(ROOT_ID)?.remove();
    document.querySelectorAll(`[${MARKER_ATTR}]`).forEach((el) => el.remove());
}

function formatNumber(value, digits = 2) {
    if (value === undefined || value === null || value === "") return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Number.isInteger(n) ? String(n) : n.toFixed(digits);
}

function formatWinrate(value) {
    if (value === undefined || value === null || value === "") return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return n.toFixed(3);
}

function formatPercentile(value) {
    if (value === undefined || value === null || value === "") return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    if (n > 1) return n.toFixed(3);
    return n.toFixed(4);
}

function acePercentile(rank, count) {
    if (!rank || !count) return null;
    return (count - rank + 1) / count;
}

function peekoroboWinrate(wins, losses, ties) {
    const w = Number(wins) || 0;
    const l = Number(losses) || 0;
    const t = Number(ties) || 0;
    const total = w + l + t;
    if (!total) return null;
    return w / total;
}

const FETCH_TIMEOUT_MS = 8000;

async function fetchJson(url, options = {}) {
    const request = chrome.runtime.sendMessage({
        type: "fetchJson",
        url,
        headers: options.headers || {}
    });
    const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Request timed out")), FETCH_TIMEOUT_MS + 1000);
    });
    const result = await Promise.race([request, timeout]);
    if (chrome.runtime.lastError) {
        throw new Error(chrome.runtime.lastError.message);
    }
    if (!result || !result.ok) {
        throw new Error((result && result.error) || "Request failed");
    }
    return result.data;
}

function appendSourceLabel(row, source) {
    if (!isBothMode()) return;
    row.appendChild(createPill(source.name, source, "extension-source-label"));
}

function appendUnavailable(row, source) {
    appendSourceLabel(row, source);
    row.appendChild(createPill(
        `${source.name} API Unavailable`,
        source,
        "extension-statbotics-warning"
    ));
}

function appendLoading(row, source) {
    appendSourceLabel(row, source);
    row.appendChild(createPill(
        `Loading ${source.name}...`,
        source,
        "extension-statbotics-warning"
    ));
}

function startSourceLayout(parent, sources, makeLink) {
    const layout = attachRoot(parent);
    const rows = {};
    sources.forEach((source) => {
        const row = layout.addRow();
        rows[source.id] = row;
        appendLoading(row, source);
        layout.downDiv.appendChild(makeLink(source));
    });
    layout.downDiv.appendChild(createSourceToggle());
    return rows;
}

function parsePageParts() {
    return window.location.href.split("/").filter(Boolean);
}

function cleanSegment(value) {
    return (value || "").split("#")[0].split("?")[0];
}

function findTitleContainer(legacySelector, betaHeadingSelector = "h1", attachToHeading = false) {
    const legacyContainer = document.querySelector(legacySelector);
    if (legacyContainer) return legacyContainer;
    if (window.location.hostname !== "beta.thebluealliance.com") return null;
    const heading = document.querySelector(betaHeadingSelector);
    if (!heading) return null;
    if (attachToHeading) {
        const existingHost = heading.nextElementSibling;
        if (existingHost?.getAttribute(MARKER_ATTR) === "1") return existingHost;
        const host = document.createElement("div");
        host.setAttribute(MARKER_ATTR, "1");
        heading.insertAdjacentElement("afterend", host);
        return host;
    }
    return heading.parentElement || null;
}

async function loadTeamStats(teamNumber, year, source) {
    if (source.id === SOURCE_PEEKOROBO) {
        const data = await fetchJson(
            `${config.PEEKOROBO_API_URL}/team_perfs/${teamNumber}?year=${year}`
        );
        const perf = data.team_perfs && data.team_perfs[0];
        if (!perf) return { available: false };
        return {
            available: true,
            globalRank: perf.rank_global,
            rating: perf.ace,
            percentile: acePercentile(perf.rank_global, perf.count_global),
            wins: perf.wins,
            losses: perf.losses,
            winrate: peekoroboWinrate(perf.wins, perf.losses, perf.ties)
        };
    }

    const data = await fetchJson(
        `${config.STATBOTICS_API_URL}/team_year/${teamNumber}/${year}`
    );
    if (!data.epa || !data.record) return { available: false };
    return {
        available: true,
        globalRank: data.epa.ranks && data.epa.ranks.total && data.epa.ranks.total.rank,
        rating: data.epa.total_points && data.epa.total_points.mean,
        percentile: data.epa.ranks && data.epa.ranks.total && data.epa.ranks.total.percentile,
        wins: data.record.wins,
        losses: data.record.losses,
        winrate: data.record.winrate
    };
}

async function loadEventStats(eventID, source) {
    if (source.id === SOURCE_PEEKOROBO) {
        const data = await fetchJson(
            `${config.PEEKOROBO_API_URL}/event/${eventID}/event_perfs`
        );
        const perfs = data.perfs || [];
        const aces = perfs
            .map((p) => Number(p.ace))
            .filter((n) => Number.isFinite(n));
        const byTeam = {};
        perfs.forEach((p) => {
            byTeam[String(p.team_number)] = { eventRating: p.ace };
        });
        return {
            status: aces.length ? null : "Upcoming Event",
            maxRating: aces.length ? Math.max(...aces) : null,
            meanRating: aces.length ? aces.reduce((sum, n) => sum + n, 0) / aces.length : null,
            byTeam
        };
    }

    const data = await fetchJson(`${config.STATBOTICS_API_URL}/event/${eventID}`);
    return {
        status: data.status_str || "Upcoming Event",
        maxRating: data.epa && data.epa.max,
        meanRating: data.epa && data.epa.mean,
        byTeam: {}
    };
}

async function loadSeasonRating(teamNumber, year, source) {
    if (source.id === SOURCE_PEEKOROBO) {
        const data = await fetchJson(
            `${config.PEEKOROBO_API_URL}/team_perfs/${teamNumber}?year=${year}`
        );
        const perf = data.team_perfs && data.team_perfs[0];
        return perf && perf.ace != null ? perf.ace : null;
    }

    const data = await fetchJson(
        `${config.STATBOTICS_API_URL}/team_year/${teamNumber}/${year}`
    );
    if (data && data.epa && data.epa.total_points && data.epa.total_points.mean != null) {
        return data.epa.total_points.mean;
    }
    return null;
}

async function loadEventRating(teamNumber, eventID, source, eventStats) {
    if (source.id === SOURCE_PEEKOROBO) {
        const cached = eventStats && eventStats.byTeam && eventStats.byTeam[String(teamNumber)];
        if (cached && cached.eventRating != null) return cached.eventRating;
        const data = await fetchJson(
            `${config.PEEKOROBO_API_URL}/event/${eventID}/event_perfs/${teamNumber}`
        );
        return data && data.ace != null ? data.ace : null;
    }

    const data = await fetchJson(
        `${config.STATBOTICS_API_URL}/team_event/${teamNumber}/${eventID}`
    );
    if (data && data.epa && data.epa.total_points && data.epa.total_points.mean != null) {
        return data.epa.total_points.mean;
    }
    return null;
}

async function loadMatchStats(matchID, source) {
    if (source.id === SOURCE_PEEKOROBO) {
        const eventKey = String(matchID).split("_")[0];
        const data = await fetchJson(
            `${config.PEEKOROBO_API_URL}/event/${eventKey}/matches?match_key=${encodeURIComponent(matchID)}`
        );
        const match = data.matches && data.matches[0];
        if (!match) return { available: false };

        const redProb = Number(match.red_win_prob);
        const blueProb = Number(match.blue_win_prob);
        let predictedWinner = null;
        let winProb = null;
        if (Number.isFinite(redProb) || Number.isFinite(blueProb)) {
            if ((redProb || 0) >= (blueProb || 0)) {
                predictedWinner = "Red";
                winProb = redProb;
            } else {
                predictedWinner = "Blue";
                winProb = blueProb;
            }
        }

        const winner = match.winning_alliance;
        const actualWinner = winner && winner !== "" && winner !== "unknown"
            ? winner.charAt(0).toUpperCase() + winner.slice(1)
            : null;

        return {
            available: Boolean(predictedWinner || actualWinner),
            predictedWinner,
            winProb,
            actualWinner
        };
    }

    const data = await fetchJson(`${config.STATBOTICS_API_URL}/match/${matchID}`);
    let predictedWinner = null;
    let winProb = null;
    if (data.pred && data.pred.winner) {
        predictedWinner = data.pred.winner.charAt(0).toUpperCase() + data.pred.winner.slice(1);
        if (data.pred.winner === "red") {
            winProb = data.pred.red_win_prob;
        } else if (data.pred.winner === "blue") {
            winProb = 1 - data.pred.red_win_prob;
        }
    }
    const actualWinner = data.result && data.result.winner
        ? data.result.winner.charAt(0).toUpperCase() + data.result.winner.slice(1)
        : null;
    return {
        available: Boolean(predictedWinner || actualWinner),
        predictedWinner,
        winProb,
        actualWinner
    };
}

function appendTeamPills(row, source, stats) {
    appendSourceLabel(row, source);
    if (!stats || !stats.available) {
        row.appendChild(createPill(
            "No Info Available For This Season/Team",
            source,
            "extension-statbotics-warning"
        ));
        return;
    }
    if (stats.globalRank != null) {
        row.appendChild(createPill(
            `Global ${source.ratingName} Rank: ${stats.globalRank}`,
            source,
            "extension-statbotics-rank"
        ));
    }
    const rating = formatNumber(stats.rating);
    if (rating != null) {
        row.appendChild(createPill(
            `Total ${source.ratingName}: ${rating}`,
            source,
            "extension-statbotics-total-epa"
        ));
    }
    const percentile = formatPercentile(stats.percentile);
    if (percentile != null) {
        row.appendChild(createPill(
            `${source.ratingName} Percentile: ${percentile}`,
            source,
            "extension-statbotics-epa-percentile"
        ));
    }
    if (stats.wins != null) {
        row.appendChild(createPill(
            `Number Of Wins: ${stats.wins}`,
            source,
            "extension-statbotics-win"
        ));
    }
    if (stats.losses != null) {
        row.appendChild(createPill(
            `Number Of Losses: ${stats.losses}`,
            source,
            "extension-statbotics-loss"
        ));
    }
    const winrate = formatWinrate(stats.winrate);
    if (winrate != null) {
        row.appendChild(createPill(
            `Winrate: ${winrate}`,
            source,
            "extension-statbotics-winrate"
        ));
    }
}

function renderTeamPage(generation) {
    const sources = getActiveSources();
    const urlParts = parsePageParts();
    const teamIndex = urlParts.indexOf("team") + 1;
    const teamNumber = cleanSegment(urlParts[teamIndex]);
    const year = cleanSegment(urlParts[teamIndex + 1]) || new Date().getFullYear();
    const teamTitleDiv = findTitleContainer("#team-title", "#team-info h1");
    if (!teamTitleDiv) return;

    const rows = startSourceLayout(teamTitleDiv, sources, (source) => (
        createLinkButton(source, source.teamUrl(teamNumber, year))
    ));

    sources.forEach((source) => {
        const row = rows[source.id];
        loadTeamStats(teamNumber, year, source).then((stats) => {
            if (generation !== renderGeneration) return;
            row.replaceChildren();
            appendTeamPills(row, source, stats);
        }).catch(() => {
            if (generation !== renderGeneration) return;
            row.replaceChildren();
            appendUnavailable(row, source);
        });
    });
}

function applyRankingCellStyle(cell, source) {
    cell.setAttribute(MARKER_ATTR, "1");
    cell.style.padding = "5px 10px";
    cell.style.border = "1px solid #ddd";
    cell.style.textAlign = "center";
    cell.style.fontSize = "0.85em";
    cell.style.color = source.tableColor;
}

function setCellLabel(cell, text) {
    let label = cell.querySelector("[data-arcbotics-label]");
    if (!label) {
        label = document.createElement("span");
        label.setAttribute("data-arcbotics-label", "1");
        cell.insertBefore(label, cell.firstChild);
    }
    label.textContent = text;
}

function addRatingHeader(headerRow, source, kind) {
    const header = document.createElement("th");
    header.textContent = isBothMode()
        ? `${source.name} ${kind === "season" ? "Season" : "Event"} ${source.ratingName}`
        : `${kind === "season" ? "Season" : "Event"} ${source.ratingName}`;
    header.classList.add("tablesorter-header", "epa-header-added");
    header.setAttribute(MARKER_ATTR, "1");
    header.dataset.epaType = `${kind}-${source.id}`;
    header.style.width = "70px";
    header.style.cursor = "pointer";
    header.title = "Click to sort highest to lowest";
    headerRow.appendChild(header);
}

function findRankingsTable() {
    const legacyTable = document.querySelector("#rankingsTable");
    if (legacyTable) return legacyTable;
    if (window.location.hostname !== "beta.thebluealliance.com") return null;

    const visiblePanels = Array.from(document.querySelectorAll('[role="tabpanel"]'))
        .filter((panel) => !panel.hidden && !panel.hasAttribute("data-hidden"));
    return visiblePanels
        .flatMap((panel) => Array.from(panel.querySelectorAll("table")))
        .find((table) => table.querySelector("thead")
            && table.querySelector('tbody a[href*="/team/"]')) || null;
}

function waitForRankingsTable(eventID, sources) {
    const table = findRankingsTable();
    if (table) {
        enhanceRankingsTable(eventID, sources);
        return;
    }

    const observer = new MutationObserver(() => {
        if (!findRankingsTable()) return;
        observer.disconnect();
        enhanceRankingsTable(eventID, sources);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 10000);
}

function enhanceRankingsTable(eventID, sources) {
    sendGetRequestForAwardsInfo(eventID).then((awardsData) => {
        const RankingsTable = findRankingsTable();
        if (!RankingsTable) return;

        const headerRow = RankingsTable.querySelector("thead tr");
        if (headerRow && !headerRow.querySelector(".awards-header-added")) {
            const awardsHeader = document.createElement("th");
            awardsHeader.textContent = "Awards";
            awardsHeader.classList.add("tablesorter-header", "awards-header-added");
            awardsHeader.setAttribute(MARKER_ATTR, "1");
            awardsHeader.style.width = "100px";
            headerRow.appendChild(awardsHeader);
        }

        const tableRows = RankingsTable.querySelectorAll("tbody > tr");
        const awardSource = sources[0] || SOURCES[SOURCE_PEEKOROBO];
        for (let i = 0; i < tableRows.length; i++) {
            const currentRow = tableRows[i];
            const teamLink = currentRow.querySelector('a[href*="/team/"]');
            if (!teamLink) continue;

            const teamNumber = teamLink.textContent.trim();
            const teamKey = `frc${teamNumber}`;
            const teamAwards = awardsData.filter((award) =>
                award.recipient_list.some((recipient) => recipient.team_key === teamKey)
            );

            const awardsCell = document.createElement("td");
            applyRankingCellStyle(awardsCell, awardSource);
            if (teamAwards.length > 0) {
                awardsCell.innerHTML = teamAwards
                    .map((award) => award.name)
                    .join('<br> <hr style="border: none; border-top: 1px solid #73176dff; margin: 5px 0;"> ');
                addInfoPopup(awardsCell, "Data retrieved from TBA API");
            } else {
                awardsCell.textContent = "-";
            }
            currentRow.appendChild(awardsCell);
        }
    }).catch(() => {});

    const RankingsTable = findRankingsTable();
    if (!RankingsTable) return;

    const headerRow = RankingsTable.querySelector("thead tr");
    if (headerRow && !headerRow.querySelector(".epa-header-added")) {
        sources.forEach((source) => {
            addRatingHeader(headerRow, source, "season");
            addRatingHeader(headerRow, source, "event");
        });
    }

    const sortRowsByEpa = (epaType) => {
        const tbody = RankingsTable.querySelector("tbody");
        if (!tbody) return;

        const rows = Array.from(tbody.querySelectorAll("tr"));
        const currentKey = RankingsTable.dataset.sortKey;
        const currentDirection = RankingsTable.dataset.sortDirection || "desc";
        const nextDirection = currentKey === epaType && currentDirection === "desc" ? "asc" : "desc";
        RankingsTable.dataset.sortKey = epaType;
        RankingsTable.dataset.sortDirection = nextDirection;

        rows.sort((rowA, rowB) => {
            const cellA = rowA.querySelector(`td[data-epa-type="${epaType}"]`);
            const cellB = rowB.querySelector(`td[data-epa-type="${epaType}"]`);
            const parseCellValue = (cell) => {
                if (!cell || cell.textContent.trim() === "-" || cell.textContent.includes("Loading...")) {
                    return Number.NEGATIVE_INFINITY;
                }
                const value = Number.parseFloat(cell.textContent.replace(/[^0-9.-]/g, ""));
                return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
            };
            const valueA = parseCellValue(cellA);
            const valueB = parseCellValue(cellB);
            if (valueA === Number.NEGATIVE_INFINITY && valueB === Number.NEGATIVE_INFINITY) return 0;
            if (valueA === Number.NEGATIVE_INFINITY) return 1;
            if (valueB === Number.NEGATIVE_INFINITY) return -1;
            return nextDirection === "desc" ? valueB - valueA : valueA - valueB;
        });
        rows.forEach((row) => tbody.appendChild(row));
    };

    if (headerRow) {
        headerRow.querySelectorAll(".epa-header-added").forEach((header) => {
            header.onclick = () => sortRowsByEpa(header.dataset.epaType);
        });
    }

    const peekoEventStatsP = sources.some((source) => source.id === SOURCE_PEEKOROBO)
        ? loadEventStats(eventID, SOURCES[SOURCE_PEEKOROBO]).catch(() => ({ byTeam: {} }))
        : Promise.resolve({ byTeam: {} });

    const tableRows = RankingsTable.querySelectorAll("tbody > tr");
    const year = eventID.slice(0, 4);

    for (let i = 0; i < tableRows.length; i++) {
        const currentRow = tableRows[i];
        const teamLink = currentRow.querySelector('a[href*="/team/"]');
        if (!teamLink) continue;

        const teamNumber = teamLink.textContent.trim();

        sources.forEach((source) => {
            const seasonEpaCell = document.createElement("td");
            seasonEpaCell.dataset.epaType = `season-${source.id}`;
            applyRankingCellStyle(seasonEpaCell, source);
            setCellLabel(seasonEpaCell, "Loading...");

            const eventEpaCell = document.createElement("td");
            eventEpaCell.dataset.epaType = `event-${source.id}`;
            applyRankingCellStyle(eventEpaCell, source);
            setCellLabel(eventEpaCell, "Loading...");

            addInfoPopup(seasonEpaCell, source.tooltip);
            currentRow.appendChild(seasonEpaCell);
            addInfoPopup(eventEpaCell, source.tooltip);
            currentRow.appendChild(eventEpaCell);

            loadSeasonRating(teamNumber, year, source).then((value) => {
                setCellLabel(seasonEpaCell, formatNumber(value) || "-");
            }).catch(() => {
                setCellLabel(seasonEpaCell, "-");
            });

            const eventStatsP = source.id === SOURCE_PEEKOROBO
                ? peekoEventStatsP
                : Promise.resolve({ byTeam: {} });
            eventStatsP.then((eventStats) => (
                loadEventRating(teamNumber, eventID, source, eventStats)
            )).then((value) => {
                setCellLabel(eventEpaCell, formatNumber(value) || "-");
            }).catch(() => {
                setCellLabel(eventEpaCell, "-");
            });
        });
    }
}

function sendGetRequestForAwardsInfo(eventID) {
    const eventIDSplit = eventID.split("#")[0];
    return fetchJson(`${config.TBA_API_URL}/event/${eventIDSplit}/awards`, {
        headers: { "X-TBA-Auth-Key": config.TBA_API_KEY }
    });
}

function appendEventPills(row, source, eventStats, error) {
    appendSourceLabel(row, source);
    if (error || !eventStats) {
        row.appendChild(createPill(
            `${source.name} API Unavailable`,
            source,
            "extension-statbotics-warning"
        ));
        return;
    }

    if (eventStats.status) {
        row.appendChild(createPill(
            eventStats.status === "Upcoming Event"
                ? "Upcoming Event"
                : `Event Status: ${eventStats.status}`,
            source,
            "extension-statbotics-event-status"
        ));
    }

    const maxRating = formatNumber(eventStats.maxRating);
    if (maxRating != null) {
        row.appendChild(createPill(
            `Max ${source.ratingName}: ${maxRating}`,
            source,
            "extension-statbotics-max-epa"
        ));
    }

    const meanRating = formatNumber(eventStats.meanRating);
    if (meanRating != null) {
        row.appendChild(createPill(
            `Mean ${source.ratingName}: ${meanRating}`,
            source,
            "extension-statbotics-max-epa"
        ));
    }
}

function bindBetaRankingsTab(eventID, sources) {
    const rankingsTab = Array.from(document.querySelectorAll('[role="tab"]'))
        .find((tab) => tab.textContent.trim() === "Rankings");
    if (!rankingsTab || rankingsTab.dataset.arcboticsRankingsBound === "1") return;

    rankingsTab.dataset.arcboticsRankingsBound = "1";
    rankingsTab.addEventListener("click", () => {
        waitForRankingsTable(eventID, sources);
    });
}

function renderEventPage(generation) {
    const sources = getActiveSources();
    const urlParts = parsePageParts();
    const eventIndex = urlParts.indexOf("event") + 1;
    const eventID = cleanSegment(urlParts[eventIndex]);
    const eventTitleDiv = findTitleContainer("#event-name");
    if (!eventTitleDiv) return;

    const rows = startSourceLayout(eventTitleDiv, sources, (source) => (
        createLinkButton(source, source.eventUrl(eventID))
    ));

    if (window.location.hostname === "beta.thebluealliance.com") {
        bindBetaRankingsTab(eventID, sources);
    } else if (window.location.hash === "#rankings") {
        enhanceRankingsTable(eventID, sources);
    }

    if (!hashChangeBound) {
        hashChangeBound = true;
        window.addEventListener("hashchange", () => {
            if (window.location.hash === "#rankings") {
                window.location.reload();
            }
        });
    }

    sources.forEach((source) => {
        const row = rows[source.id];
        loadEventStats(eventID, source).then((eventStats) => {
            if (generation !== renderGeneration) return;
            row.replaceChildren();
            appendEventPills(row, source, eventStats, false);
        }).catch(() => {
            if (generation !== renderGeneration) return;
            row.replaceChildren();
            appendEventPills(row, source, null, true);
        });
    });
}

function appendMatchPills(row, source, stats, error) {
    appendSourceLabel(row, source);
    if (error) {
        row.appendChild(createPill(
            `${source.name} API Unavailable`,
            source,
            "extension-statbotics-warning"
        ));
        return;
    }
    if (!stats || !stats.available) {
        row.appendChild(createPill(
            "No Info Available For This Match",
            source,
            "extension-statbotics-warning"
        ));
        return;
    }
    if (stats.predictedWinner) {
        row.appendChild(createPill(
            `Predicted Winner: ${stats.predictedWinner}`,
            source,
            "extension-statbotics-prediction"
        ));
        if (stats.winProb != null) {
            row.appendChild(createPill(
                `Predicted Winner Probability: ${(Number(stats.winProb) * 100).toFixed(2)}%`,
                source,
                "extension-statbotics-probability"
            ));
        }
    }
    if (stats.actualWinner) {
        row.appendChild(createPill(
            `Winner: ${stats.actualWinner}`,
            source,
            "extension-statbotics-winner"
        ));
    }
}

function renderMatchPage(generation) {
    const sources = getActiveSources();
    const urlParts = parsePageParts();
    const matchIndex = urlParts.indexOf("match") + 1;
    const matchID = cleanSegment(urlParts[matchIndex]);
    const matchTitleDiv = findTitleContainer("#match-title", "h1", true);
    if (!matchTitleDiv) return;

    const rows = startSourceLayout(matchTitleDiv, sources, (source) => (
        createLinkButton(source, source.matchUrl(matchID))
    ));

    sources.forEach((source) => {
        const row = rows[source.id];
        loadMatchStats(matchID, source).then((stats) => {
            if (generation !== renderGeneration) return;
            row.replaceChildren();
            appendMatchPills(row, source, stats, false);
        }).catch(() => {
            if (generation !== renderGeneration) return;
            row.replaceChildren();
            appendMatchPills(row, source, null, true);
        });
    });
}

function runForPage() {
    renderGeneration += 1;
    if (!currentSettings.extensionActive) return;
    if (!betaHydrationReady) return;
    if (document.getElementById(ROOT_ID)) return;
    const path = window.location.pathname;
    if (!TBA_HOSTS.has(window.location.hostname)) return;
    if (path.startsWith("/team/")) {
        renderTeamPage(renderGeneration);
    } else if (path.startsWith("/event/")) {
        renderEventPage(renderGeneration);
    } else if (path.startsWith("/match/")) {
        renderMatchPage(renderGeneration);
    }
}

function bindDomObserver() {
    if (domObserverBound) return;
    const target = document.documentElement;
    if (!target) return;

    domObserverBound = true;
    const observer = new MutationObserver(() => {
        if (!betaHydrationReady || !currentSettings.extensionActive || document.getElementById(ROOT_ID)) return;
        if (!TBA_HOSTS.has(window.location.hostname)) return;
        if (!window.location.pathname.startsWith("/team/")
            && !window.location.pathname.startsWith("/event/")
            && !window.location.pathname.startsWith("/match/")) return;
        if (domRerunTimer !== null) return;

        domRerunTimer = setTimeout(() => {
            domRerunTimer = null;
            runForPage();
        }, 0);
    });
    observer.observe(target, { childList: true, subtree: true });
}

function init() {
    bindDomObserver();
    chrome.storage.local.get(
        { extensionActive: true, dataSource: SOURCE_PEEKOROBO },
        (settings) => {
            currentSettings = settings;
            if (window.location.hostname === "beta.thebluealliance.com") {
                setTimeout(() => {
                    betaHydrationReady = true;
                    runForPage();
                }, 1000);
                return;
            }
            runForPage();
        }
    );

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        let shouldRerun = false;
        if (changes.extensionActive) {
            currentSettings.extensionActive = changes.extensionActive.newValue;
            shouldRerun = true;
        }
        if (changes.dataSource) {
            currentSettings.dataSource = changes.dataSource.newValue;
            shouldRerun = true;
        }
        if (!shouldRerun) return;
        clearInjected();
        runForPage();
    });
}

init();
