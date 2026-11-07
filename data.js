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
const FAVORITES_STORAGE_KEY = "favoriteTeams";
const SOURCE_ORDER = [SOURCE_STATBOTICS, SOURCE_PEEKOROBO];
const RATING_PHASES = [
    { key: "total", label: "Total" },
    { key: "auto", label: "Auto" },
    { key: "teleop", label: "Teleop" },
    { key: "endgame", label: "Endgame" }
];
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
let betaRankingsObserver = null;
let betaRankingsCheckTimer = null;
let betaRankingsEventID = null;
let betaRankingsSources = null;
let rankingsTableWaitObserver = null;
let updateCurrentTeamFavoriteButton = null;
let currentTeamFavoriteButton = null;
let currentTeamComparisonButton = null;
let closeCurrentTeamComparisonModal = null;
let tbaSearchIndexPromise = null;
let betaHydrationReady = window.location.hostname !== "beta.thebluealliance.com";
const rankingAwardsByEvent = new Map();
const rankingAwardsRequestsByEvent = new Map();
const rankingDataPromises = new Map();
const RANKING_RATE_LIMIT_RETRY_MS = 60 * 1000;
const RANKING_TRANSIENT_RETRY_MS = 30 * 1000;

function isTransientApiError(error) {
    return /Request timed out|Failed to fetch|NetworkError|HTTP 429|HTTP 5\d\d/i
        .test(error && error.message ? error.message : String(error || ""));
}

function shouldSuppressPerTeamFallback(error) {
    return /Request timed out|Failed to fetch|NetworkError|HTTP 429/i
        .test(error && error.message ? error.message : String(error || ""));
}

function getRankingData(key, load) {
    const cached = rankingDataPromises.get(key);
    if (cached && (cached.expiresAt === null || cached.expiresAt > Date.now())) {
        return cached.promise;
    }

    const entry = { promise: null, expiresAt: null };
    entry.promise = Promise.resolve().then(load).catch((error) => {
        if (error && /HTTP 429/.test(error.message || "")) {
            entry.expiresAt = Date.now() + RANKING_RATE_LIMIT_RETRY_MS;
        } else if (isTransientApiError(error)) {
            entry.expiresAt = Date.now() + RANKING_TRANSIENT_RETRY_MS;
        } else {
            rankingDataPromises.delete(key);
        }
        throw error;
    });
    rankingDataPromises.set(key, entry);
    return entry.promise;
}

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
    if (closeCurrentTeamComparisonModal) closeCurrentTeamComparisonModal();
    updateCurrentTeamFavoriteButton = null;
    currentTeamFavoriteButton = null;
    currentTeamComparisonButton = null;
    document.getElementById(ROOT_ID)?.remove();
    document.querySelectorAll(`[${MARKER_ATTR}]`).forEach((el) => el.remove());
}

function formatNumber(value, digits = 2) {
    if (value === undefined || value === null || value === "") return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Number.isInteger(n) ? String(n) : n.toFixed(digits);
}

function getNumericRating(value) {
    if (value && typeof value === "object") {
        return getNumericRating(value.mean ?? value.value ?? value.ace);
    }
    if (value === undefined || value === null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function getStatboticsRatings(data) {
    const epa = data && data.epa;
    if (!epa) return {};
    const breakdown = epa.breakdown || {};
    return {
        total: getNumericRating(epa.total_points),
        auto: getNumericRating(breakdown.auto_points ?? epa.auto_points),
        teleop: getNumericRating(breakdown.teleop_points ?? epa.teleop_points),
        endgame: getNumericRating(breakdown.endgame_points ?? epa.endgame_points)
    };
}

function getPeekoroboRatings(perf) {
    if (!perf) return {};
    const breakdown = perf.ace_breakdown || perf.breakdown || {};
    const getPhase = (phase, aliases) => {
        for (const alias of aliases) {
            const value = perf[alias] ?? breakdown[alias];
            const rating = getNumericRating(value);
            if (rating != null) return rating;
        }
        return getNumericRating(breakdown[phase]);
    };
    return {
        total: getNumericRating(perf.ace),
        auto: getPhase("auto", ["auto_ace", "ace_auto", "ace_auto_points", "auto_points_ace", "auto_raw", "auto_points", "auto"]),
        teleop: getPhase("teleop", ["teleop_ace", "ace_teleop", "ace_teleop_points", "teleop_points_ace", "teleop_raw", "teleop_points", "teleop"]),
        endgame: getPhase("endgame", ["endgame_ace", "ace_endgame", "ace_endgame_points", "endgame_points_ace", "endgame_raw", "endgame_points", "endgame"])
    };
}

function getPhaseRatingLabel(source, phase) {
    if (source.id === SOURCE_PEEKOROBO) {
        return `${phase.label} RAW`;
    }
    return `${phase.label} ${source.ratingName} Contribution`;
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
const RANKING_FETCH_TIMEOUT_MS = 26000;

async function fetchJson(url, options = {}) {
    const timeoutMs = options.timeoutMs || FETCH_TIMEOUT_MS;
    const result = await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(
            () => reject(new Error("Request timed out")),
            timeoutMs + 1000
        );
        chrome.runtime.sendMessage({
            type: "fetchJson",
            url,
            headers: options.headers || {},
            timeoutMs
        }, (response) => {
            clearTimeout(timeoutId);
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(response);
        });
    });
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
    layout.root.dataset.arcboticsPage = window.location.pathname;
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

function getRankingTeamNumber(row) {
    const teamLink = row.querySelector('a[href*="/team/"]');
    if (!teamLink) return null;
    const match = teamLink.getAttribute("href")?.match(/\/team\/(\d+)(?:\/|[?#]|$)/);
    return match ? match[1] : null;
}

function normalizeFavoriteTeams(favorites) {
    if (!Array.isArray(favorites)) return [];
    const teamsByNumber = new Map();
    favorites.forEach((favorite) => {
        const teamNumber = String(
            favorite && typeof favorite === "object"
                ? favorite.teamNumber
                : favorite
        ).trim();
        if (!/^\d+$/.test(teamNumber)) return;
        const name = favorite && typeof favorite === "object" && typeof favorite.name === "string"
            ? favorite.name.trim()
            : "";
        teamsByNumber.set(teamNumber, { teamNumber, name });
    });
    return Array.from(teamsByNumber.values());
}

function isExtensionContextActive() {
    try {
        return Boolean(chrome.runtime && chrome.runtime.id && chrome.storage);
    } catch (error) {
        if (/Extension context invalidated/i.test(error.message || "")) return false;
        throw error;
    }
}

function runFavoriteCallback(button, callback) {
    if (!button.isConnected || !isExtensionContextActive()) return;
    try {
        callback();
    } catch (error) {
        if (/Extension context invalidated/i.test(error.message || "")) return;
        console.error("Arcbotics: Unable to update team favorites", error);
    }
}

function getTeamDisplayName(teamNumber) {
    const heading = document.querySelector("#team-info h1")
        || document.querySelector("#team-title h1")
        || document.querySelector("#team-title")
        || Array.from(document.querySelectorAll("h1"))
            .find((element) => element.textContent.includes(`Team ${teamNumber}`));
    const headingText = heading ? heading.textContent.trim() : "";
    const namedTeam = headingText.match(new RegExp(`^Team\\s+${teamNumber}\\s*[-–—:]\\s*(.+)$`, "i"));
    return namedTeam ? namedTeam[1].trim() : "";
}

function createTeamFavoriteButton(teamNumber) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "arcbotics-team-favorite";
    button.setAttribute(MARKER_ATTR, "1");
    button.setAttribute("aria-label", `Add team ${teamNumber} to favorites`);
    button.setAttribute("aria-pressed", "false");
    button.title = "Add to favorites";
    button.textContent = "☆";
    button.style.border = "0";
    button.style.background = "transparent";
    button.style.color = "#d6a900";
    button.style.fontSize = "24px";
    button.style.lineHeight = "1";
    button.style.padding = "2px 6px";
    button.style.cursor = "pointer";

    const updateButton = (favorite) => {
        runFavoriteCallback(button, () => {
            button.textContent = favorite ? "★" : "☆";
            button.setAttribute("aria-pressed", String(favorite));
            button.setAttribute(
                "aria-label",
                `${favorite ? "Remove" : "Add"} team ${teamNumber} ${favorite ? "from" : "to"} favorites`
            );
            button.title = favorite ? "Remove from favorites" : "Add to favorites";
        });
    };
    updateCurrentTeamFavoriteButton = updateButton;

    chrome.storage.local.get({ [FAVORITES_STORAGE_KEY]: [] }, (result) => {
        runFavoriteCallback(button, () => {
            if (chrome.runtime.lastError) {
                button.title = "Unable to load favorites";
                return;
            }
            const favorites = normalizeFavoriteTeams(result[FAVORITES_STORAGE_KEY]);
            updateButton(favorites.some((favorite) => favorite.teamNumber === teamNumber));
        });
    });

    button.addEventListener("click", () => {
        runFavoriteCallback(button, () => {
            button.disabled = true;
            chrome.storage.local.get({ [FAVORITES_STORAGE_KEY]: [] }, (result) => {
                runFavoriteCallback(button, () => {
                    if (chrome.runtime.lastError) {
                        button.disabled = false;
                        button.title = "Unable to update favorites";
                        return;
                    }

                    const favorites = normalizeFavoriteTeams(result[FAVORITES_STORAGE_KEY]);
                    const existingIndex = favorites.findIndex((favorite) => (
                        favorite.teamNumber === teamNumber
                    ));
                    if (existingIndex >= 0) {
                        favorites.splice(existingIndex, 1);
                    } else {
                        favorites.push({ teamNumber, name: getTeamDisplayName(teamNumber) });
                    }

                    chrome.storage.local.set({ [FAVORITES_STORAGE_KEY]: favorites }, () => {
                        runFavoriteCallback(button, () => {
                            button.disabled = false;
                            if (chrome.runtime.lastError) {
                                button.title = "Unable to update favorites";
                                return;
                            }
                            updateButton(existingIndex < 0);
                        });
                    });
                });
            });
        });
    });

    return button;
}

function placeFavoriteButtonNearTeamEmblem(teamNumber, button) {
    const regularEmblem = document.querySelector("#team-title img.team-avatar");
    if (regularEmblem) {
        regularEmblem.insertAdjacentElement("afterend", button);
        return;
    }

    if (window.location.hostname === "beta.thebluealliance.com") {
        const heading = Array.from(document.querySelectorAll("h1"))
            .find((element) => element.textContent.includes(`Team ${teamNumber}`));
        const emblem = heading && heading.parentElement
            && heading.parentElement.querySelector('img[alt="Team Avatar"]');
        const emblemButton = emblem && emblem.closest("button");
        if (emblemButton) {
            emblemButton.insertAdjacentElement("afterend", button);
            return;
        }
    }

    const title = document.querySelector("#team-title")
        || document.querySelector("#team-info h1");
    if (title) title.insertAdjacentElement("afterend", button);
}

function createTeamComparisonButton(teamNumber, year, teamStatsPromises) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "arcbotics-team-compare";
    button.setAttribute(MARKER_ATTR, "1");
    button.textContent = "Compare";
    button.setAttribute("aria-label", `Compare team ${teamNumber} with another team`);
    button.title = "Compare this team with another team";
    button.style.border = "1px solid #B9437C";
    button.style.borderRadius = "5px";
    button.style.backgroundColor = "#B9437C";
    button.style.color = "#ffffff";
    button.style.fontSize = "13px";
    button.style.fontWeight = "600";
    button.style.padding = "6px 12px";
    button.style.cursor = "pointer";
    button.addEventListener("click", () => {
        openTeamComparisonModal(teamNumber, year, teamStatsPromises);
    });
    return button;
}

function placeTeamComparisonButton(teamNumber, button) {
    const heading = document.querySelector("#team-info h1")
        || document.querySelector("#team-title h1")
        || document.querySelector("#team-title")
        || Array.from(document.querySelectorAll("h1"))
            .find((element) => element.textContent.includes(`Team ${teamNumber}`));
    if (!heading) return;

    const statsRoot = document.getElementById(ROOT_ID);
    if (heading.id === "team-title" && statsRoot && statsRoot.parentElement === heading) {
        button.style.marginLeft = "auto";
        button.style.flexShrink = "0";
        statsRoot.insertAdjacentElement("beforebegin", button);
        return;
    }

    if (heading.id === "team-title") {
        heading.style.display = "inline-flex";
        heading.style.alignItems = "center";
        heading.style.marginRight = "8px";
        button.style.verticalAlign = "middle";
    } else if (heading.parentElement) {
        const titleRow = heading.parentElement;
        titleRow.style.width = "100%";
        titleRow.style.flexWrap = "wrap";
        const regularStatsRoot = document.getElementById(ROOT_ID);
        if (regularStatsRoot && regularStatsRoot.parentElement === titleRow) {
            regularStatsRoot.style.flexBasis = "100%";
            regularStatsRoot.style.width = "100%";
            regularStatsRoot.insertAdjacentElement("beforebegin", button);
        } else {
            titleRow.appendChild(button);
        }
        button.style.marginLeft = "auto";
        button.style.flexShrink = "0";
        return;
    }
    button.style.marginLeft = "auto";
    button.style.flexShrink = "0";
    heading.insertAdjacentElement("afterend", button);
}

function loadTbaSearchIndex() {
    if (!tbaSearchIndexPromise) {
        tbaSearchIndexPromise = fetchJson(
            `${config.TBA_API_URL}/search_index`,
            { headers: { "X-TBA-Auth-Key": config.TBA_API_KEY } }
        ).catch((error) => {
            tbaSearchIndexPromise = null;
            throw error;
        });
    }
    return tbaSearchIndexPromise;
}

function teamSearchResults(searchIndex, query, currentTeamNumber) {
    const normalizedQuery = query.trim().toLowerCase()
        .replace(/^(?:frc|team)\s*/, "");
    if (!normalizedQuery || !searchIndex || !Array.isArray(searchIndex.teams)) return [];

    return searchIndex.teams
        .map((team) => {
            const match = team && typeof team.key === "string"
                ? team.key.match(/^frc(\d+)$/i)
                : null;
            return match
                ? {
                    teamNumber: match[1],
                    name: typeof team.nickname === "string" ? team.nickname : ""
                }
                : null;
        })
        .filter((team) => team && team.teamNumber !== currentTeamNumber)
        .filter((team) => (
            team.teamNumber.toLowerCase().includes(normalizedQuery)
            || team.name.toLowerCase().includes(normalizedQuery)
        ))
        .sort((a, b) => {
            const aExact = a.teamNumber === normalizedQuery
                || a.name.toLowerCase() === normalizedQuery;
            const bExact = b.teamNumber === normalizedQuery
                || b.name.toLowerCase() === normalizedQuery;
            return Number(bExact) - Number(aExact)
                || a.teamNumber.localeCompare(b.teamNumber, undefined, { numeric: true });
        })
        .slice(0, 20);
}

function getEventNameMap(searchIndex) {
    const names = new Map();
    if (!searchIndex || !Array.isArray(searchIndex.events)) return names;
    searchIndex.events.forEach((event) => {
        if (event && typeof event.key === "string" && typeof event.name === "string") {
            names.set(event.key, event.name);
        }
    });
    return names;
}

async function loadStatboticsRecentEvents(teamNumber, year) {
    const query = new URLSearchParams({
        team: String(teamNumber),
        year: String(year),
        limit: "100",
        offset: "0"
    });
    const data = await fetchJson(`${config.STATBOTICS_API_URL}/team_events?${query}`);
    if (!Array.isArray(data)) return [];
    return data
        .filter((event) => event && (!event.team || String(event.team) === String(teamNumber)))
        .map((event) => ({
            key: event.event,
            label: event.event_name || event.event || "Event",
            time: getNumericRating(event.time) || 0,
            value: getNumericRating(event.epa && event.epa.total_points)
        }))
        .filter((event) => event.value != null)
        .sort((a, b) => b.time - a.time)
        .slice(0, 5);
}

function openTeamComparisonModal(teamNumber, year, teamStatsPromises) {
    if (closeCurrentTeamComparisonModal) closeCurrentTeamComparisonModal();

    const overlay = document.createElement("div");
    overlay.className = "arcbotics-compare-overlay";
    overlay.setAttribute(MARKER_ATTR, "1");
    overlay.setAttribute("role", "presentation");

    const style = document.createElement("style");
    style.textContent = `
        .arcbotics-compare-overlay {
            position: fixed; inset: 0; z-index: 2147483647;
            display: flex; align-items: center; justify-content: center;
            padding: 3vh 3vw; box-sizing: border-box;
            background: rgba(0, 0, 0, .60);
            font: 14px/1.45 Arial, sans-serif; color: #FBE9F2;
        }
        .arcbotics-compare-dialog {
            width: min(100%, 1050px); height: min(92vh, 760px);
            display: flex; flex-direction: column; overflow: hidden;
            border: 1px solid rgba(226, 146, 183, .55); border-radius: 12px;
            background: rgba(35, 29, 35, .94);
            box-shadow: 0 18px 70px rgba(0, 0, 0, .55);
            backdrop-filter: blur(7px);
        }
        .arcbotics-compare-header {
            display: flex; align-items: flex-start; justify-content: space-between;
            gap: 20px; padding: 20px 24px 12px;
            border-bottom: 1px solid rgba(255,255,255,.12);
        }
        .arcbotics-compare-title { margin: 0; font-size: 22px; color: #fff; }
        .arcbotics-compare-subtitle { margin: 4px 0 0; color: #d3c4ce; }
        .arcbotics-compare-close {
            flex: 0 0 auto; border: 0; border-radius: 6px;
            padding: 3px 10px; background: transparent; color: #fff;
            font-size: 27px; line-height: 1; cursor: pointer;
        }
        .arcbotics-compare-close:hover { background: rgba(255,255,255,.12); }
        .arcbotics-compare-search {
            display: flex; gap: 8px; padding: 16px 24px 8px;
        }
        .arcbotics-compare-search input {
            flex: 1; min-width: 0; border: 1px solid #776875; border-radius: 6px;
            padding: 10px 12px; background: rgba(16, 14, 16, .82);
            color: #fff; font: inherit;
        }
        .arcbotics-compare-search button,
        .arcbotics-compare-result {
            border: 1px solid #B9437C; border-radius: 6px;
            background: #B9437C; color: #fff; font: inherit;
            font-weight: 600; cursor: pointer;
        }
        .arcbotics-compare-search button { padding: 0 17px; }
        .arcbotics-compare-search button:hover,
        .arcbotics-compare-result:hover { background: #a9366c; }
        .arcbotics-compare-status {
            min-height: 20px; margin: 0; padding: 0 24px 8px;
            color: #d3c4ce; overflow-wrap: anywhere;
        }
        .arcbotics-compare-results {
            display: flex; flex-wrap: wrap; gap: 7px;
            padding: 0 24px 12px;
        }
        .arcbotics-compare-result { padding: 7px 10px; text-align: left; }
        .arcbotics-compare-content {
            flex: 1; min-height: 0; overflow: auto; padding: 0 24px 24px;
        }
        .arcbotics-compare-team-names {
            display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px; margin: 8px 0 14px;
        }
        .arcbotics-compare-team-name {
            min-width: 0; padding: 12px; border-radius: 7px;
            background: rgba(255,255,255,.07); color: #fff; font-weight: 700;
        }
        .arcbotics-compare-table-wrap {
            margin: 0 0 18px; overflow-x: auto;
            border: 1px solid rgba(255,255,255,.14); border-radius: 7px;
        }
        .arcbotics-compare-table {
            width: 100%; border-collapse: collapse;
            background: rgba(16, 14, 16, .44);
        }
        .arcbotics-compare-table th,
        .arcbotics-compare-table td {
            min-width: 120px; padding: 9px 12px;
            border-bottom: 1px solid rgba(255,255,255,.10); text-align: left;
        }
        .arcbotics-compare-table thead th {
            background: rgba(255,255,255,.08); color: #fff;
        }
        .arcbotics-compare-table tbody th { color: #e7d8e1; }
        .arcbotics-compare-source-statbotics { color: #f07bb4; }
        .arcbotics-compare-source-peekorobo { color: #ffdd00; }
        @media (max-width: 600px) {
            .arcbotics-compare-overlay { padding: 2vh 2vw; }
            .arcbotics-compare-dialog { height: 96vh; }
            .arcbotics-compare-header { padding: 16px 16px 10px; }
            .arcbotics-compare-search { padding: 12px 16px 8px; }
            .arcbotics-compare-status, .arcbotics-compare-results { padding-left: 16px; padding-right: 16px; }
            .arcbotics-compare-content { padding: 0 16px 16px; }
            .arcbotics-compare-title { font-size: 18px; }
        }
    `;
    overlay.appendChild(style);

    const dialog = document.createElement("section");
    dialog.className = "arcbotics-compare-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "arcbotics-compare-title");

    const header = document.createElement("div");
    header.className = "arcbotics-compare-header";
    const titleWrap = document.createElement("div");
    const title = document.createElement("h2");
    title.className = "arcbotics-compare-title";
    title.id = "arcbotics-compare-title";
    title.textContent = "Compare teams";
    const subtitle = document.createElement("p");
    subtitle.className = "arcbotics-compare-subtitle";
    const currentName = getTeamDisplayName(teamNumber);
    subtitle.textContent = `Team ${teamNumber}${currentName ? ` - ${currentName}` : ""}`;
    titleWrap.append(title, subtitle);

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "arcbotics-compare-close";
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", "Close comparison");
    header.append(titleWrap, closeButton);

    const searchForm = document.createElement("form");
    searchForm.className = "arcbotics-compare-search";
    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.placeholder = "Search team number or name";
    searchInput.setAttribute("aria-label", "Search teams to compare");
    searchInput.autocomplete = "off";
    const searchButton = document.createElement("button");
    searchButton.type = "submit";
    searchButton.textContent = "Search";
    searchForm.append(searchInput, searchButton);

    const status = document.createElement("p");
    status.className = "arcbotics-compare-status";
    status.setAttribute("role", "status");
    status.textContent = "Search by team number or nickname to choose a team.";
    const results = document.createElement("div");
    results.className = "arcbotics-compare-results";
    const content = document.createElement("div");
    content.className = "arcbotics-compare-content";
    dialog.append(header, searchForm, status, results, content);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeydown = (event) => {
        if (event.key === "Escape") closeModal();
    };
    const closeModal = () => {
        document.removeEventListener("keydown", handleKeydown);
        document.body.style.overflow = oldOverflow;
        overlay.remove();
        if (closeCurrentTeamComparisonModal === closeModal) {
            closeCurrentTeamComparisonModal = null;
        }
    };
    closeCurrentTeamComparisonModal = closeModal;
    closeButton.addEventListener("click", closeModal);
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) closeModal();
    });
    document.addEventListener("keydown", handleKeydown);
    searchInput.focus();

    let searchGeneration = 0;
    let comparisonGeneration = 0;
    searchForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const requestGeneration = ++searchGeneration;
        const query = searchInput.value.trim();
        results.replaceChildren();
        content.replaceChildren();
        if (!query) {
            status.textContent = "Enter a team number or name to search.";
            searchInput.focus();
            return;
        }
        status.textContent = "Searching TBA teams...";
        try {
            const searchIndex = await loadTbaSearchIndex();
            if (requestGeneration !== searchGeneration) return;
            const matches = teamSearchResults(searchIndex, query, teamNumber);
            status.textContent = matches.length
                ? `Select a team to compare with team ${teamNumber}.`
                : "No matching teams found.";
            matches.forEach((team) => {
                const resultButton = document.createElement("button");
                resultButton.type = "button";
                resultButton.className = "arcbotics-compare-result";
                resultButton.textContent = `Team ${team.teamNumber}${team.name ? ` - ${team.name}` : ""}`;
                resultButton.addEventListener("click", () => {
                    const generation = ++comparisonGeneration;
                    compareSelectedTeam(
                        team,
                        teamNumber,
                        year,
                        teamStatsPromises,
                        content,
                        status,
                        () => generation === comparisonGeneration
                    );
                });
                results.appendChild(resultButton);
            });
        } catch (_error) {
            if (requestGeneration !== searchGeneration) return;
            status.textContent = "Unable to search TBA teams. Please try again.";
        }
    });
}

async function loadComparisonTeamStats(teamNumber, year, source, existingPromise) {
    let stats;
    let error = null;
    try {
        stats = existingPromise ? await existingPromise : await loadTeamStats(teamNumber, year, source);
    } catch (requestError) {
        error = requestError;
    }

    if (error && isRetryableComparisonError(error)) {
        try {
            await new Promise((resolve) => setTimeout(resolve, 750));
            stats = await loadTeamStats(teamNumber, year, source);
            error = null;
        } catch (requestError) {
            error = requestError;
            stats = { available: false };
        }
    }

    if (!stats || !stats.available) {
        stats = { available: false };
        error = error || new Error(`No ${year} season data returned`);
    }

    return { stats: stats || { available: false }, error };
}

function isRetryableComparisonError(error) {
    return /(?:HTTP (?:429|5\d\d)|timed out|failed to fetch|network error)/i
        .test(error && error.message || "");
}

function renderComparisonTrends(cell, events, eventNames) {
    const trendList = Array.isArray(events) ? events.slice(0, 5) : [];
    if (!trendList.length) {
        cell.textContent = "No recent event trend available";
        return;
    }

    cell.replaceChildren();
    trendList.forEach((event, index) => {
        const key = event.key || event.event_key || event.event;
        const name = event.name
            || event.event_name
            || (key && eventNames.get(key))
            || event.label
            || key
            || "Event";
        const line = document.createElement("span");
        line.className = "arcbotics-compare-trend";
        line.textContent = `${name}: ${formatNumber(event.value)}`;
        cell.appendChild(line);
        if (index < trendList.length - 1) {
            cell.appendChild(document.createElement("br"));
        }
    });
}

function appendComparisonSourceTable(source, year, currentTeamNumber, selectedTeamNumber, current, selected, content) {
    const wrapper = document.createElement("div");
    wrapper.className = "arcbotics-compare-table-wrap";
    const table = document.createElement("table");
    table.className = "arcbotics-compare-table";
    const head = document.createElement("thead");
    const headingRow = document.createElement("tr");
    const currentLabel = `Team ${currentTeamNumber}${current.available ? "" : ` (no ${year} data)`}`;
    const selectedLabel = `Team ${selectedTeamNumber}${selected.available ? "" : ` (no ${year} data)`}`;
    [
        `${source.name} ${source.ratingName}`,
        currentLabel,
        selectedLabel
    ]
        .forEach((text) => {
            const th = document.createElement("th");
            th.textContent = text;
            headingRow.appendChild(th);
        });
    head.appendChild(headingRow);
    table.appendChild(head);

    const body = document.createElement("tbody");
    const values = [
        { label: source.ratingName === "ACE" ? "Total ACE" : "Total EPA", get: (stats) => stats.ratings && stats.ratings.total },
        { label: getPhaseRatingLabel(source, { label: "Auto" }), get: (stats) => stats.ratings && stats.ratings.auto },
        { label: getPhaseRatingLabel(source, { label: "Teleop" }), get: (stats) => stats.ratings && stats.ratings.teleop },
        { label: getPhaseRatingLabel(source, { label: "Endgame" }), get: (stats) => stats.ratings && stats.ratings.endgame },
        { label: "Global rank", get: (stats) => stats.globalRank },
        { label: "Global percentile", get: (stats) => formatPercentile(stats.percentile) }
    ];
    values.forEach(({ label, get }) => {
        const row = document.createElement("tr");
        const th = document.createElement("th");
        th.textContent = label;
        th.className = source.id === SOURCE_STATBOTICS
            ? "arcbotics-compare-source-statbotics"
            : "arcbotics-compare-source-peekorobo";
        row.appendChild(th);
        [current, selected].forEach((stats) => {
            const cell = document.createElement("td");
            const value = stats.available ? get(stats) : null;
            cell.textContent = value == null
                ? "—"
                : typeof value === "string" ? value : formatNumber(value);
            row.appendChild(cell);
        });
        body.appendChild(row);
    });

    const trendRow = document.createElement("tr");
    const trendHeading = document.createElement("th");
    trendHeading.textContent = "Recent event trend";
    trendHeading.className = source.id === SOURCE_STATBOTICS
        ? "arcbotics-compare-source-statbotics"
        : "arcbotics-compare-source-peekorobo";
    trendRow.appendChild(trendHeading);
    const trendCells = [current, selected].map((stats) => {
        const cell = document.createElement("td");
        cell.textContent = stats.available && source.id === SOURCE_STATBOTICS
            ? "Loading event trends..."
            : stats.available ? "Resolving event names..." : "Unavailable";
        trendRow.appendChild(cell);
        return cell;
    });
    body.appendChild(trendRow);
    table.appendChild(body);
    wrapper.appendChild(table);
    content.appendChild(wrapper);
    return trendCells;
}

async function compareSelectedTeam(
    team,
    currentTeamNumber,
    year,
    currentStatsPromises,
    content,
    status,
    isCurrentRequest = () => true
) {
    content.replaceChildren();
    const sources = getActiveSources();
    const errors = [];
    const pendingSources = new Set(sources.map((source) => source.name));
    const updateStatus = () => {
        const messages = [...errors];
        if (pendingSources.size) {
            messages.push(`Loading ${[...pendingSources].join(" and ")}; available results are shown.`);
        }
        status.textContent = messages.length
            ? messages.join(" ")
            : `Comparing team ${currentTeamNumber} with team ${team.teamNumber}.`;
    };
    const names = document.createElement("div");
    names.className = "arcbotics-compare-team-names";
    [getTeamDisplayName(currentTeamNumber), team.name].forEach((name, index) => {
        const label = document.createElement("div");
        label.className = "arcbotics-compare-team-name";
        const number = index === 0 ? currentTeamNumber : team.teamNumber;
        label.textContent = `Team ${number}${name ? ` - ${name}` : ""}`;
        names.appendChild(label);
    });
    content.appendChild(names);
    updateStatus();
    const results = await Promise.all(sources.map(async (source) => {
        const currentPromise = currentStatsPromises.get(source.id)
            || null;
        const [currentResult, selectedResult] = await Promise.all([
            loadComparisonTeamStats(currentTeamNumber, year, source, currentPromise),
            loadComparisonTeamStats(team.teamNumber, year, source, null)
        ]);
        if (!isCurrentRequest()) return null;
        if (!currentResult.stats.available) {
            errors.push(`${source.name}, team ${currentTeamNumber}: ${currentResult.error?.message || "data unavailable"}`);
        }
        if (!selectedResult.stats.available) {
            errors.push(`${source.name}, team ${team.teamNumber}: ${selectedResult.error?.message || "data unavailable"}`);
        }
        const trendCells = appendComparisonSourceTable(
            source,
            year,
            currentTeamNumber,
            team.teamNumber,
            currentResult.stats,
            selectedResult.stats,
            content
        );
        pendingSources.delete(source.name);
        updateStatus();
        return {
            source,
            current: currentResult.stats,
            selected: selectedResult.stats,
            currentError: currentResult.error,
            selectedError: selectedResult.error,
            trendCells
        };
    }));
    if (!isCurrentRequest()) return;

    const completedResults = results.filter(Boolean);

    const trendResults = await Promise.all(completedResults.map(async ({ source, current, selected }) => {
        if (!current.available || !selected.available) {
            return { source, current: [], selected: [], error: null };
        }
        if (source.id === SOURCE_STATBOTICS) {
            const loaded = await Promise.all([
                loadStatboticsRecentEvents(currentTeamNumber, year),
                loadStatboticsRecentEvents(team.teamNumber, year)
            ].map((promise) => promise.catch((error) => ({ error }))));
            return {
                source,
                current: Array.isArray(loaded[0]) ? loaded[0] : [],
                selected: Array.isArray(loaded[1]) ? loaded[1] : [],
                error: [loaded[0], loaded[1]]
                    .some((value) => value && value.error)
            };
        }
        return {
            source,
            current: current.recentEvents || [],
            selected: selected.recentEvents || [],
            error: null
        };
    }));

    let eventNames = new Map();
    const hasEventKeys = trendResults.some(({ current, selected }) => (
        [...current, ...selected].some((event) => (
            (event.key || event.event_key || event.event)
            && !(event.name || event.event_name)
        ))
    ));
    if (hasEventKeys) {
        try {
            eventNames = getEventNameMap(await loadTbaSearchIndex());
        } catch (error) {
            errors.push(`Event names unavailable: ${error.message}`);
        }
    }
    if (!isCurrentRequest()) return;

    trendResults.forEach(({ source, current, selected, error }) => {
        const result = completedResults.find((entry) => entry.source.id === source.id);
        if (!result) return;
        renderComparisonTrends(result.trendCells[0], current, eventNames);
        renderComparisonTrends(result.trendCells[1], selected, eventNames);
        if (error) errors.push(`${source.name} recent event trends could not be loaded.`);
    });
    updateStatus();
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
        const perf = data && Array.isArray(data.team_perfs) && data.team_perfs[0];
        if (!perf) return { available: false };
        return {
            available: true,
            globalRank: perf.rank_global,
            ratings: getPeekoroboRatings(perf),
            rating: getNumericRating(perf.ace),
            percentile: acePercentile(perf.rank_global, perf.count_global),
            wins: perf.wins,
            losses: perf.losses,
            winrate: peekoroboWinrate(perf.wins, perf.losses, perf.ties),
            recentEvents: Array.isArray(perf.event_perf)
                ? perf.event_perf
                    .map((event) => ({
                        key: event.event_key,
                        label: event.event_name || event.event_key || event.event || "Event",
                        time: getNumericRating(event.time) || getNumericRating(event.timestamp) || 0,
                        value: getNumericRating(event.ace ?? event.raw)
                    }))
                    .filter((event) => event.value != null)
                    .sort((a, b) => b.time - a.time)
                    .slice(0, 5)
                : []
        };
    }

    const data = await fetchJson(
        `${config.STATBOTICS_API_URL}/team_year/${teamNumber}/${year}`
    );
    if (!data || (!data.epa && !data.record)) return { available: false };
    const ratings = getStatboticsRatings(data);
    return {
        available: true,
        globalRank: data.epa && data.epa.ranks && data.epa.ranks.total && data.epa.ranks.total.rank,
        ratings,
        rating: ratings.total,
        percentile: data.epa && data.epa.ranks && data.epa.ranks.total && data.epa.ranks.total.percentile,
        wins: data.record && data.record.wins,
        losses: data.record && data.record.losses,
        winrate: data.record && data.record.winrate
    };
}

async function loadEventStats(eventID, source) {
    if (source.id === SOURCE_PEEKOROBO) {
        const data = await fetchJson(
            `${config.PEEKOROBO_API_URL}/event/${eventID}/event_perfs`
        );
        const perfs = data && Array.isArray(data.perfs) ? data.perfs : [];
        const aces = perfs
            .map((p) => getNumericRating(p && p.ace))
            .filter((n) => n != null && Number.isFinite(n));
        const byTeam = {};
        perfs.forEach((p) => {
            if (!p || p.team_number == null) return;
            byTeam[String(p.team_number)] = {
                eventRating: getNumericRating(p.ace),
                ratings: getPeekoroboRatings(p)
            };
        });
        return {
            status: aces.length ? null : "Upcoming Event",
            maxRating: aces.length ? Math.max(...aces) : null,
            meanRating: aces.length ? aces.reduce((sum, n) => sum + n, 0) / aces.length : null,
            byTeam,
            available: true
        };
    }

    const data = await fetchJson(`${config.STATBOTICS_API_URL}/event/${eventID}`);
    return {
        status: (data && data.status_str) || "Upcoming Event",
        maxRating: data && data.epa && data.epa.max,
        meanRating: data && data.epa && data.epa.mean,
        byTeam: {},
        available: true
    };
}

async function loadSeasonRatings(teamNumber, year, source) {
    if (source.id === SOURCE_PEEKOROBO) {
        const data = await fetchJson(
            `${config.PEEKOROBO_API_URL}/team_perfs/${teamNumber}?year=${year}`
        );
        const perf = data && Array.isArray(data.team_perfs) && data.team_perfs[0];
        return getPeekoroboRatings(perf);
    }

    const data = await fetchJson(
        `${config.STATBOTICS_API_URL}/team_year/${teamNumber}/${year}`
    );
    return getStatboticsRatings(data);
}

async function loadEventRatings(teamNumber, eventID, source, eventStats) {
    if (source.id === SOURCE_PEEKOROBO) {
        const cached = eventStats && eventStats.byTeam && eventStats.byTeam[String(teamNumber)];
        if (cached && cached.ratings) return cached.ratings;
        if (eventStats && eventStats.available) return {};
        if (eventStats && shouldSuppressPerTeamFallback(eventStats.error)) return {};
        const data = await fetchJson(
            `${config.PEEKOROBO_API_URL}/event/${eventID}/event_perfs/${teamNumber}`
        );
        const perf = data && (
            data.perf
            || (Array.isArray(data.perfs) && data.perfs[0])
            || data
        );
        return getPeekoroboRatings(perf);
    }

    const bulkRating = eventStats
        && eventStats.ratingsByTeam
        && eventStats.ratingsByTeam[String(teamNumber)];
    if (bulkRating) return bulkRating;
    if (eventStats && eventStats.available) return {};
    if (eventStats && shouldSuppressPerTeamFallback(eventStats.error)) return {};

    const data = await fetchJson(
        `${config.STATBOTICS_API_URL}/team_event/${teamNumber}/${eventID}`
    );
    return getStatboticsRatings(data);
}

async function loadStatboticsEventRatings(eventID) {
    const ratingsByTeam = {};
    const pageSize = 1000;
    let offset = 0;
    let pagesFetched = 0;

    while (pagesFetched < 20) {
        const query = new URLSearchParams({
            event: eventID,
            limit: String(pageSize),
            offset: String(offset)
        });
        const data = await fetchJson(
            `${config.STATBOTICS_API_URL}/team_events?${query.toString()}`,
            { timeoutMs: RANKING_FETCH_TIMEOUT_MS }
        );
        if (!Array.isArray(data)) throw new Error("Invalid Statbotics team_events response");

        data.forEach((teamEvent) => {
            if (!teamEvent || teamEvent.event && teamEvent.event !== eventID) return;
            const teamNumber = teamEvent.team ?? teamEvent.team_number;
            if (teamNumber == null) return;
            const ratings = getStatboticsRatings(teamEvent);
            if (RATING_PHASES.some((phase) => ratings[phase.key] != null)) {
                ratingsByTeam[String(teamNumber)] = ratings;
            }
        });

        pagesFetched += 1;
        if (data.length < pageSize) break;
        offset += data.length;
    }

    return { ratingsByTeam, available: true };
}

async function loadStatboticsSeasonRatings(year, teamNumbers) {
    const ratingsByTeam = {};
    const requestedTeams = new Set(teamNumbers.map(String));
    const pageSize = 1000;
    let offset = 0;
    let pagesFetched = 0;

    while (pagesFetched < 20 && requestedTeams.size > 0) {
        const query = new URLSearchParams({
            year: String(year),
            limit: String(pageSize),
            offset: String(offset)
        });
        const data = await fetchJson(
            `${config.STATBOTICS_API_URL}/team_years?${query.toString()}`,
            { timeoutMs: RANKING_FETCH_TIMEOUT_MS }
        );
        if (!Array.isArray(data)) throw new Error("Invalid Statbotics team_years response");

        data.forEach((teamYear) => {
            if (!teamYear || teamYear.year != null && Number(teamYear.year) !== Number(year)) return;
            const teamNumber = teamYear.team ?? teamYear.team_number;
            if (teamNumber == null || !requestedTeams.has(String(teamNumber))) return;
            const ratings = getStatboticsRatings(teamYear);
            if (RATING_PHASES.some((phase) => ratings[phase.key] != null)) {
                ratingsByTeam[String(teamNumber)] = ratings;
                requestedTeams.delete(String(teamNumber));
            }
        });

        pagesFetched += 1;
        if (data.length < pageSize) break;
        offset += data.length;
    }

    return { ratingsByTeam, available: true };
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
    const rating = formatNumber(stats.rating);
    if (rating != null) {
        row.appendChild(createPill(
            `Total ${source.ratingName}: ${rating}`,
            source,
            "extension-statbotics-total-epa"
        ));
    }
    RATING_PHASES.slice(1).forEach((phase) => {
        const phaseRating = formatNumber(stats.ratings && stats.ratings[phase.key]);
        if (phaseRating == null) return;
        row.appendChild(createPill(
            `${getPhaseRatingLabel(source, phase)}: ${phaseRating}`,
            source,
            "extension-statbotics-phase-rating"
        ));
    });
    const percentile = formatPercentile(stats.percentile);
    if (percentile != null) {
        row.appendChild(createPill(
            `${source.ratingName} Percentile: ${percentile}`,
            source,
            "extension-statbotics-epa-percentile"
        ));
    }
    if (stats.globalRank != null) {
        row.appendChild(createPill(
            `Global ${source.ratingName} Rank: ${stats.globalRank}`,
            source,
            "extension-statbotics-rank"
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
    const teamStatsPromises = new Map();
    if (/^\d+$/.test(teamNumber)) {
        currentTeamFavoriteButton = createTeamFavoriteButton(teamNumber);
        currentTeamComparisonButton = createTeamComparisonButton(
            teamNumber,
            year,
            teamStatsPromises
        );
        placeFavoriteButtonNearTeamEmblem(teamNumber, currentTeamFavoriteButton);
        placeTeamComparisonButton(teamNumber, currentTeamComparisonButton);
    }

    sources.forEach((source) => {
        const row = rows[source.id];
        const statsPromise = loadTeamStats(teamNumber, year, source);
        teamStatsPromises.set(source.id, statsPromise);
        statsPromise.then((stats) => {
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

function getRankingTextColor(source) {
    if (window.location.hostname !== "beta.thebluealliance.com") return source.tableColor;
    return source.id === SOURCE_PEEKOROBO ? "#ffdd00" : "#f08ac0";
}

function applyRankingCellStyle(cell, source) {
    cell.setAttribute(MARKER_ATTR, "1");
    cell.style.padding = "5px 10px";
    cell.style.border = "1px solid #ddd";
    cell.style.textAlign = "center";
    cell.style.fontSize = "0.85em";
    cell.style.color = getRankingTextColor(source);
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

function addRatingHeader(headerRow, source, kind, phase) {
    const header = document.createElement("th");
    const dataLabel = kind === "season" ? "Season" : "Event (season fallback)";
    const phaseLabel = phase.key === "total" ? "Total" : phase.label;
    const ratingName = source.id === SOURCE_PEEKOROBO && phase.key !== "total"
        ? "RAW"
        : source.ratingName;
    header.textContent = isBothMode()
        ? `${source.name} ${dataLabel} ${phaseLabel} ${ratingName}`
        : `${dataLabel} ${phaseLabel} ${ratingName}`;
    header.classList.add("tablesorter-header", "epa-header-added");
    header.setAttribute(MARKER_ATTR, "1");
    header.dataset.epaType = `${kind}-${source.id}-${phase.key}`;
    header.dataset.ratingPhase = phase.key;
    header.style.width = "105px";
    header.style.cursor = "pointer";
    if (window.location.hostname === "beta.thebluealliance.com") {
        header.style.color = getRankingTextColor(source);
    }
    header.title = `Click to sort by ${phase.label} ${source.ratingName}`;
    headerRow.appendChild(header);
}

function addRatingPhaseToggle(table, sources, onSelect) {
    const existingToggle = Array.from(
        table.parentElement.querySelectorAll(":scope > .arcbotics-rating-phase-toggle")
    ).find((element) => element.nextElementSibling === table);
    if (existingToggle) return;

    const toggle = document.createElement("div");
    toggle.className = "arcbotics-rating-phase-toggle";
    toggle.setAttribute(MARKER_ATTR, "1");
    toggle.style.display = "flex";
    toggle.style.flexWrap = "wrap";
    toggle.style.justifyContent = "center";
    toggle.style.gap = "6px";
    toggle.style.margin = "8px 0";

    const styleToggle = (selectedPhase) => {
        toggle.querySelectorAll("button").forEach((button) => {
            const active = button.dataset.ratingPhase === selectedPhase;
            button.style.backgroundColor = active ? sources[0].color : "#6b6b6b";
            button.style.color = active ? sources[0].textColor : "#ffffff";
            button.style.opacity = active ? "1" : "0.8";
        });
    };

    RATING_PHASES.forEach((phase) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = phase.label;
        button.dataset.ratingPhase = phase.key;
        button.style.padding = "5px 10px";
        button.style.border = "1px solid #000000";
        button.style.borderRadius = "5px";
        button.style.cursor = "pointer";
        button.onclick = () => {
            table.dataset.ratingPhase = phase.key;
            styleToggle(phase.key);
            onSelect(phase.key);
        };
        toggle.appendChild(button);
    });

    table.parentElement.insertBefore(toggle, table);
    const selectedPhase = table.dataset.ratingPhase || "total";
    table.dataset.ratingPhase = selectedPhase;
    styleToggle(selectedPhase);
}

function findBetaRankingsPanel(requireActive = true) {
    const rankingsTab = Array.from(document.querySelectorAll('[role="tab"]'))
        .find((tab) => tab.textContent.replace(/\s+/g, " ").trim() === "Rankings");
    if (!rankingsTab || (requireActive && rankingsTab.getAttribute("aria-selected") !== "true")) {
        return null;
    }

    const panelID = rankingsTab.getAttribute("aria-controls");
    const controlledPanel = panelID && document.getElementById(panelID);
    if (controlledPanel && controlledPanel.getAttribute("role") === "tabpanel") {
        return controlledPanel;
    }

    return rankingsTab.id
        ? Array.from(document.querySelectorAll('[role="tabpanel"]'))
            .find((panel) => panel.getAttribute("aria-labelledby") === rankingsTab.id) || null
        : null;
}

function findRankingsTable() {
    if (window.location.hostname !== "beta.thebluealliance.com") {
        return document.querySelector("#rankingsTable");
    }

    const rankingsPanel = findBetaRankingsPanel();
    if (!rankingsPanel) return null;
    return Array.from(rankingsPanel.querySelectorAll("table"))
        .find((table) => table.querySelector("thead tr")
            && table.querySelector('tbody a[href*="/team/"]')) || null;
}

function waitForRankingsTable(eventID, sources) {
    const table = findRankingsTable();
    if (table) {
        if (rankingsTableWaitObserver) {
            rankingsTableWaitObserver.disconnect();
            rankingsTableWaitObserver = null;
        }
        enhanceRankingsTable(eventID, sources);
        return;
    }

    if (rankingsTableWaitObserver) return;
    const observer = new MutationObserver(() => {
        if (!findRankingsTable()) return;
        observer.disconnect();
        if (rankingsTableWaitObserver === observer) rankingsTableWaitObserver = null;
        enhanceRankingsTable(eventID, sources);
    });
    rankingsTableWaitObserver = observer;
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => {
        if (rankingsTableWaitObserver !== observer) return;
        observer.disconnect();
        rankingsTableWaitObserver = null;
    }, 10000);
}

function insertRankingCellBeforeRatings(row, cell) {
    const firstRatingCell = row.querySelector("td[data-epa-type]");
    if (firstRatingCell) {
        row.insertBefore(cell, firstRatingCell);
    } else {
        row.appendChild(cell);
    }
}

function applyAwardsToRankingsTable(
    table,
    eventID,
    awardsData,
    unavailable = false,
    rankingsPanel = null
) {
    if (!table.isConnected) return;
    if (window.location.hostname === "beta.thebluealliance.com"
        && (!rankingsPanel || !rankingsPanel.isConnected || !rankingsPanel.contains(table))) return;

    const headerRow = table.querySelector("thead tr");
    if (!headerRow) return;
    let awardsHeader = headerRow.querySelector(".awards-header-added");
    if (!awardsHeader) {
        awardsHeader = document.createElement("th");
        awardsHeader.textContent = "Awards";
        awardsHeader.classList.add("tablesorter-header", "awards-header-added");
        awardsHeader.setAttribute(MARKER_ATTR, "1");
        awardsHeader.style.width = "100px";
        if (window.location.hostname === "beta.thebluealliance.com") {
            const awardsSource = getActiveSources()[0] || SOURCES[SOURCE_PEEKOROBO];
            awardsHeader.style.color = getRankingTextColor(awardsSource);
        }
        const firstRatingHeader = headerRow.querySelector(".epa-header-added");
        if (firstRatingHeader) {
            headerRow.insertBefore(awardsHeader, firstRatingHeader);
        } else {
            headerRow.appendChild(awardsHeader);
        }
    }

    table.querySelectorAll("tbody > tr").forEach((row) => {
        const teamLink = row.querySelector('a[href*="/team/"]');
        if (!teamLink || row.querySelector(".arcbotics-awards-cell")) return;

        const teamNumber = getRankingTeamNumber(row);
        if (!teamNumber) return;
        const teamKey = `frc${teamNumber}`;
        const teamAwards = (Array.isArray(awardsData) ? awardsData : []).filter((award) =>
            Array.isArray(award.recipient_list)
                && award.recipient_list.some((recipient) => recipient.team_key === teamKey)
        );
        const cell = document.createElement("td");
        cell.classList.add("arcbotics-awards-cell");
        applyRankingCellStyle(cell, getActiveSources()[0] || SOURCES[SOURCE_PEEKOROBO]);

        if (unavailable) {
            cell.textContent = "Unavailable";
            addInfoPopup(cell, "Event awards could not be loaded from the TBA API");
        } else if (teamAwards.length > 0) {
            teamAwards.forEach((award, index) => {
                if (index > 0) cell.appendChild(document.createElement("br"));
                cell.appendChild(document.createTextNode(award.name || "Award"));
            });
            addInfoPopup(cell, "Data retrieved from TBA API");
        } else {
            cell.textContent = "-";
        }
        insertRankingCellBeforeRatings(row, cell);
    });

    table.dataset.arcboticsAwardsEnhanced = "1";
    table.dataset.arcboticsAwardsEvent = eventID;
}

function loadRankingAwards(eventID) {
    if (rankingAwardsByEvent.has(eventID)) {
        return Promise.resolve(rankingAwardsByEvent.get(eventID));
    }
    if (!rankingAwardsRequestsByEvent.has(eventID)) {
        const request = sendGetRequestForAwardsInfo(eventID).then((data) => {
            const awards = Array.isArray(data) ? data : [];
            rankingAwardsByEvent.set(eventID, { awards, unavailable: false });
            return { awards, unavailable: false };
        }).catch((error) => {
            rankingAwardsRequestsByEvent.delete(eventID);
            throw error;
        });
        rankingAwardsRequestsByEvent.set(eventID, request);
    }
    return rankingAwardsRequestsByEvent.get(eventID);
}

function rankingTableNeedsEnhancement(table, sources) {
    const headerRow = table.querySelector("thead tr");
    if (!headerRow) return false;
    if (!table.parentElement || !Array.from(table.parentElement.querySelectorAll(
        ":scope > .arcbotics-rating-phase-toggle"
    )).some((toggle) => toggle.nextElementSibling === table)) {
        return true;
    }

    const missingHeader = RATING_PHASES.some((phase) => sources.some((source) => (
        ["season", "event"].some((kind) => !headerRow.querySelector(
            `th[data-epa-type="${kind}-${source.id}-${phase.key}"]`
        ))
    )));
    if (missingHeader) return true;

    if (Array.from(table.querySelectorAll("tbody > tr")).some((row) => (
        row.querySelector('a[href*="/team/"]')
        && sources.some((source) => RATING_PHASES.some((phase) => (
            ["season", "event"].some((kind) => !row.querySelector(
                `td[data-epa-type="${kind}-${source.id}-${phase.key}"]`
            ))
        )))
    ))) return true;

    if (table.dataset.arcboticsAwardsEnhanced === "1") {
        return !headerRow.querySelector(".awards-header-added")
            || Array.from(table.querySelectorAll("tbody > tr")).some((row) => (
                row.querySelector('a[href*="/team/"]')
                && !row.querySelector(".arcbotics-awards-cell")
            ));
    }
    return false;
}

function enhanceRankingsTable(eventID, sources) {
    const RankingsTable = findRankingsTable();
    if (!RankingsTable) return;

    const headerRow = RankingsTable.querySelector("thead tr");
    if (!headerRow) return;

    const rankingsPanel = window.location.hostname === "beta.thebluealliance.com"
        ? findBetaRankingsPanel()
        : null;
    const awardData = rankingAwardsByEvent.get(eventID);
    if (awardData) {
        applyAwardsToRankingsTable(
            RankingsTable,
            eventID,
            awardData.awards,
            awardData.unavailable,
            rankingsPanel
        );
    } else if (RankingsTable.dataset.arcboticsAwardsEvent !== eventID) {
        RankingsTable.dataset.arcboticsAwardsEvent = eventID;
        loadRankingAwards(eventID).then((result) => {
            applyAwardsToRankingsTable(
                RankingsTable,
                eventID,
                result.awards,
                result.unavailable,
                rankingsPanel
            );
        }).catch((error) => {
            console.warn("Arcbotics: Unable to load event awards", error);
            rankingAwardsByEvent.set(eventID, { awards: [], unavailable: true });
            applyAwardsToRankingsTable(
                RankingsTable,
                eventID,
                [],
                true,
                rankingsPanel
            );
        });
    }

    const sortRowsByRating = (epaType) => {
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
                if (!cell || cell.dataset.sortValue === "") {
                    return Number.NEGATIVE_INFINITY;
                }
                const value = Number(cell.dataset.sortValue);
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
    const setVisiblePhase = (phaseKey) => {
        RankingsTable.querySelectorAll("[data-rating-phase]").forEach((element) => {
            element.style.display = element.dataset.ratingPhase === phaseKey ? "" : "none";
        });
    };
    const onSelectPhase = (phaseKey) => {
        setVisiblePhase(phaseKey);
        const sortKey = RankingsTable.dataset.sortKey;
        if (sortKey) {
            const parts = sortKey.split("-");
            parts[parts.length - 1] = phaseKey;
            sortRowsByRating(parts.join("-"));
        }
    };

    RATING_PHASES.forEach((phase) => {
        sources.forEach((source) => {
            ["season", "event"].forEach((kind) => {
                if (!headerRow.querySelector(
                    `th[data-epa-type="${kind}-${source.id}-${phase.key}"]`
                )) {
                    addRatingHeader(headerRow, source, kind, phase);
                }
            });
        });
    });
    headerRow.querySelectorAll(".epa-header-added").forEach((header) => {
        header.onclick = () => sortRowsByRating(header.dataset.epaType);
    });

    const tableRows = Array.from(RankingsTable.querySelectorAll("tbody > tr"));
    const teamNumbers = tableRows
        .map(getRankingTeamNumber)
        .filter(Boolean);

    const rowsNeedingRatings = tableRows.filter((row) => {
        if (!row.querySelector('a[href*="/team/"]')) return false;
        return sources.some((source) => RATING_PHASES.some((phase) => (
            ["season", "event"].some((kind) => !row.querySelector(
                `td[data-epa-type="${kind}-${source.id}-${phase.key}"]`
            ))
        )));
    });
    if (!rowsNeedingRatings.length) {
        addRatingPhaseToggle(RankingsTable, sources, onSelectPhase);
        setVisiblePhase(RankingsTable.dataset.ratingPhase || "total");
        RankingsTable.dataset.arcboticsEnhanced = "1";
        return;
    }

    const year = eventID.slice(0, 4);
    const teamSetKey = Array.from(new Set(teamNumbers.map(String))).sort().join(",");
    const peekoEventStatsP = sources.some((source) => source.id === SOURCE_PEEKOROBO)
        ? getRankingData(`peekorobo:event:${eventID}`, () => (
            loadEventStats(eventID, SOURCES[SOURCE_PEEKOROBO])
        )).catch((error) => {
            console.warn("Arcbotics: Unable to load Peekorobo event ratings", error);
            return { byTeam: {}, available: false, error: error.message };
        })
        : Promise.resolve({ byTeam: {}, available: false });
    const statboticsEventRatingsP = teamNumbers.length > 0
        && sources.some((source) => source.id === SOURCE_STATBOTICS)
        ? getRankingData(`statbotics:team_events:event:${eventID}`, () => (
            loadStatboticsEventRatings(eventID)
        )).catch((error) => {
            console.warn("Arcbotics: Unable to load Statbotics event ratings", error);
            return { ratingsByTeam: {}, available: false, error: error.message };
        })
        : Promise.resolve({ ratingsByTeam: {}, available: false });
    const statboticsSeasonRatingsP = teamNumbers.length > 0
        && sources.some((source) => source.id === SOURCE_STATBOTICS)
        ? getRankingData(`statbotics:team_years:year:${year}:${teamSetKey}`, () => (
            loadStatboticsSeasonRatings(year, teamNumbers)
        )).catch((error) => {
            console.warn("Arcbotics: Unable to load Statbotics season ratings", error);
            return { ratingsByTeam: {}, available: false, error: error.message };
        })
        : Promise.resolve({ ratingsByTeam: {}, available: false });

    const rowsToLoad = [];
    for (const currentRow of rowsNeedingRatings) {
        const teamNumber = getRankingTeamNumber(currentRow);
        if (!teamNumber) continue;

        const rowSources = [];
        for (const source of sources) {
            const cells = {};
            let hasMissingCells = false;
            RATING_PHASES.forEach((phase) => {
                ["season", "event"].forEach((kind) => {
                    const type = `${kind}-${source.id}-${phase.key}`;
                    let cell = currentRow.querySelector(`td[data-epa-type="${type}"]`);
                    if (!cell) {
                        cell = document.createElement("td");
                        cell.dataset.epaType = type;
                        cell.dataset.ratingPhase = phase.key;
                        cell.dataset.sortValue = "";
                        applyRankingCellStyle(cell, source);
                        setCellLabel(cell, "Loading...");
                        addInfoPopup(cell, source.tooltip);
                        currentRow.appendChild(cell);
                        hasMissingCells = true;
                    }
                    cells[`${kind}-${phase.key}`] = cell;
                });
            });

            const requestedSources = (currentRow.dataset.arcboticsRequestedSources || "")
                .split(",")
                .filter(Boolean);
            if (hasMissingCells || !requestedSources.includes(source.id)) {
                rowSources.push({ source, cells });
                requestedSources.push(source.id);
            }
            currentRow.dataset.arcboticsRequestedSources = Array.from(
                new Set(requestedSources)
            ).join(",");
        }
        if (rowSources.length) rowsToLoad.push({ row: currentRow, teamNumber, rowSources });
    }

    const loadRowRatings = ({ row, teamNumber, rowSources }) => {
        if (!RankingsTable.isConnected || !row.isConnected) return;
        const requestedSources = new Set(
            (row.dataset.arcboticsRequestedSources || "").split(",").filter(Boolean)
        );
        rowSources.forEach(({ source }) => requestedSources.add(source.id));
        row.dataset.arcboticsRequestedSources = Array.from(requestedSources).join(",");

        rowSources.forEach(({ source, cells }) => {
            const seasonRatingsP = source.id === SOURCE_STATBOTICS
                ? statboticsSeasonRatingsP.then((result) => {
                    const bulkRatings = result.ratingsByTeam[String(teamNumber)];
                    if (bulkRatings) return bulkRatings;
                    if (result.available) return {};
                    if (shouldSuppressPerTeamFallback(result.error)) return {};
                    return getRankingData(
                        `statbotics:team_year:${teamNumber}:${year}`,
                        () => loadSeasonRatings(teamNumber, year, source)
                    );
                })
                : peekoEventStatsP.then((eventStats) => {
                    if (/HTTP 429/.test(eventStats.error || "")) return {};
                    return getRankingData(
                        `peekorobo:team_perfs:${teamNumber}:${year}`,
                        () => loadSeasonRatings(teamNumber, year, source)
                    );
                });
            const eventRatingsP = source.id === SOURCE_PEEKOROBO
                ? peekoEventStatsP.then((eventStats) => (
                    loadEventRatings(teamNumber, eventID, source, eventStats)
                ))
                : statboticsEventRatingsP.then((eventStats) => (
                    loadEventRatings(teamNumber, eventID, source, eventStats)
                ));

            if (source.id === SOURCE_STATBOTICS) {
                let seasonRatings = null;
                let eventRatings = null;
                const isCurrentRow = () => (
                    RankingsTable.isConnected
                    && row.isConnected
                    && getRankingTeamNumber(row) === teamNumber
                );
                const renderSeasonCells = () => {
                    if (!seasonRatings || !isCurrentRow()) return;
                    RATING_PHASES.forEach((phase) => {
                        const value = getNumericRating(seasonRatings[phase.key]);
                        const cell = cells[`season-${phase.key}`];
                        cell.dataset.sortValue = value == null ? "" : String(value);
                        setCellLabel(
                            cell,
                            value == null ? "-" : `Season: ${formatNumber(value)}`
                        );
                    });
                    if (eventRatings) renderEventCells();
                };
                const renderEventCells = () => {
                    if (!eventRatings || !isCurrentRow()) return;
                    RATING_PHASES.forEach((phase) => {
                        const eventValue = getNumericRating(eventRatings[phase.key]);
                        const seasonValue = seasonRatings
                            ? getNumericRating(seasonRatings[phase.key])
                            : null;
                        const displayedValue = eventValue ?? seasonValue;
                        const cell = cells[`event-${phase.key}`];
                        cell.dataset.sortValue = displayedValue == null
                            ? ""
                            : String(displayedValue);
                        setCellLabel(
                            cell,
                            displayedValue == null
                                ? "-"
                                : `${eventValue == null ? "Seasonal" : "Event"}: ${formatNumber(displayedValue)}`
                        );
                    });
                };

                seasonRatingsP.then((ratings) => {
                    seasonRatings = ratings;
                    renderSeasonCells();
                }).catch((error) => {
                    console.warn(
                        `Arcbotics: Unable to load Statbotics season ratings for team ${teamNumber}`,
                        error
                    );
                    seasonRatings = {};
                    renderSeasonCells();
                });
                eventRatingsP.then((ratings) => {
                    eventRatings = ratings;
                    renderEventCells();
                }).catch((error) => {
                    console.warn(
                        `Arcbotics: Unable to load Statbotics event ratings for team ${teamNumber}`,
                        error
                    );
                    eventRatings = {};
                    renderEventCells();
                });
                return;
            }

            Promise.all([
                seasonRatingsP.catch((error) => {
                    console.warn(`Arcbotics: Unable to load ${source.name} season ratings for team ${teamNumber}`, error);
                    return {};
                }),
                eventRatingsP.catch((error) => {
                    console.warn(`Arcbotics: Unable to load ${source.name} event ratings for team ${teamNumber}`, error);
                    return {};
                })
            ]).then(([seasonRatings, eventRatings]) => {
                if (!RankingsTable.isConnected || !row.isConnected) return;
                const currentTeamNumber = getRankingTeamNumber(row);
                if (currentTeamNumber !== teamNumber) return;
                RATING_PHASES.forEach((phase) => {
                    const seasonCell = cells[`season-${phase.key}`];
                    const seasonValue = getNumericRating(seasonRatings[phase.key]);
                    seasonCell.dataset.sortValue = seasonValue == null ? "" : String(seasonValue);
                    setCellLabel(
                        seasonCell,
                        seasonValue == null ? "-" : `Season: ${formatNumber(seasonValue)}`
                    );

                    const eventCell = cells[`event-${phase.key}`];
                    const eventValue = getNumericRating(eventRatings[phase.key]);
                    const displayedValue = eventValue ?? seasonValue;
                    eventCell.dataset.sortValue = displayedValue == null ? "" : String(displayedValue);
                    setCellLabel(
                        eventCell,
                        displayedValue == null
                            ? "-"
                            : `${eventValue == null ? "Seasonal" : "Event"}: ${formatNumber(displayedValue)}`
                    );
                });
            });
        });
    };

    if (rowsToLoad.length && "IntersectionObserver" in window) {
        const rowDataByElement = new Map(rowsToLoad.map((rowData) => [rowData.row, rowData]));
        const rowObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                observer.unobserve(entry.target);
                const rowData = rowDataByElement.get(entry.target);
                if (rowData) loadRowRatings(rowData);
            });
        }, { rootMargin: "50px 0px" });
        rowsToLoad.forEach(({ row }) => rowObserver.observe(row));
        RankingsTable.dataset.arcboticsLazyObserver = "1";
    } else {
        rowsToLoad.forEach(loadRowRatings);
    }

    addRatingPhaseToggle(RankingsTable, sources, onSelectPhase);
    setVisiblePhase(RankingsTable.dataset.ratingPhase || "total");
    RankingsTable.dataset.arcboticsEnhanced = "1";
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
    betaRankingsEventID = eventID;
    betaRankingsSources = sources;

    const bindTab = () => {
        const rankingsTab = Array.from(document.querySelectorAll('[role="tab"]'))
            .find((tab) => tab.textContent.replace(/\s+/g, " ").trim() === "Rankings");
        if (!rankingsTab || rankingsTab.dataset.arcboticsRankingsBound === "1") return;

        rankingsTab.dataset.arcboticsRankingsBound = "1";
        rankingsTab.addEventListener("click", () => {
            waitForRankingsTable(betaRankingsEventID, betaRankingsSources);
        });
    };

    const checkRankings = () => {
        if (betaRankingsCheckTimer !== null) return;
        betaRankingsCheckTimer = setTimeout(() => {
            betaRankingsCheckTimer = null;
            if (!betaRankingsEventID || !betaRankingsSources) return;
            bindTab();
            const table = findRankingsTable();
            if (table && rankingTableNeedsEnhancement(table, betaRankingsSources)) {
                enhanceRankingsTable(betaRankingsEventID, betaRankingsSources);
            }
        }, 50);
    };

    bindTab();
    if (!betaRankingsObserver && document.documentElement) {
        betaRankingsObserver = new MutationObserver(checkRankings);
        betaRankingsObserver.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["aria-selected", "aria-controls"]
        });
    }

    const table = findRankingsTable();
    if (table && rankingTableNeedsEnhancement(table, sources)) {
        enhanceRankingsTable(eventID, sources);
    }
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
        waitForRankingsTable(eventID, sources);
    }

    if (!hashChangeBound) {
        hashChangeBound = true;
        window.addEventListener("hashchange", () => {
            if (!window.location.pathname.startsWith("/event/")
                || window.location.hash !== "#rankings") return;
            const parts = parsePageParts();
            const eventIndex = parts.indexOf("event") + 1;
            const eventID = cleanSegment(parts[eventIndex]);
            waitForRankingsTable(eventID, getActiveSources());
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
    const existingRoot = document.getElementById(ROOT_ID);
    if (existingRoot?.dataset.arcboticsPage === window.location.pathname) return;
    if (existingRoot) clearInjected();
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
        if (!betaHydrationReady || !currentSettings.extensionActive) return;
        if (!TBA_HOSTS.has(window.location.hostname)) return;
        if (!window.location.pathname.startsWith("/team/")
            && !window.location.pathname.startsWith("/event/")
            && !window.location.pathname.startsWith("/match/")) return;

        const existingRoot = document.getElementById(ROOT_ID);
        if (existingRoot
            && existingRoot.dataset.arcboticsPage !== window.location.pathname) {
            clearInjected();
        } else if (existingRoot) {
            if (window.location.hostname === "beta.thebluealliance.com"
                && window.location.pathname.startsWith("/team/")) {
                const teamNumber = cleanSegment(
                    parsePageParts()[parsePageParts().indexOf("team") + 1]
                );
                if (!currentTeamFavoriteButton?.isConnected) {
                    if (currentTeamFavoriteButton) {
                        placeFavoriteButtonNearTeamEmblem(
                            teamNumber,
                            currentTeamFavoriteButton
                        );
                    }
                }
                if (!currentTeamComparisonButton?.isConnected && currentTeamComparisonButton) {
                    placeTeamComparisonButton(teamNumber, currentTeamComparisonButton);
                }
            }
            return;
        }
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
        if (changes[FAVORITES_STORAGE_KEY] && updateCurrentTeamFavoriteButton) {
            const favorites = normalizeFavoriteTeams(changes[FAVORITES_STORAGE_KEY].newValue);
            const teamNumber = cleanSegment(parsePageParts()[parsePageParts().indexOf("team") + 1]);
            updateCurrentTeamFavoriteButton(favorites.some((favorite) => (
                favorite.teamNumber === teamNumber
            )));
        }
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
