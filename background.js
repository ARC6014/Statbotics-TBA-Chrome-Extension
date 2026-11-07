const FETCH_TIMEOUT_MS = 8000;
const MAX_ACTIVE_FETCHES = 8;
const MAX_FETCHES_PER_HOST = 4;
const MAX_CACHE_ENTRIES = 300;
const MAX_CACHE_BYTES = 8 * 1024 * 1024;
const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const responseCache = new Map();
const inFlightRequests = new Map();
const fetchQueue = [];
let activeFetches = 0;
let cachedBytes = 0;
const activeFetchesByHost = new Map();

function normalizedRequestKey(url, headers) {
    const parsedUrl = new URL(url);
    parsedUrl.searchParams.sort();
    const normalizedHeaders = Object.entries(headers || {})
        .map(([name, value]) => [name.toLowerCase(), String(value)])
        .sort(([nameA], [nameB]) => nameA.localeCompare(nameB));
    return `${parsedUrl.toString()}\n${JSON.stringify(normalizedHeaders)}`;
}

function getRequestYear(parsedUrl) {
    const eventKey = parsedUrl.searchParams.get("event")
        || parsedUrl.searchParams.get("match_key")
        || parsedUrl.pathname.split("/").find((segment) => /^20\d{2}/.test(segment));
    const year = eventKey && String(eventKey).match(/^(\d{4})/);
    if (year) return Number(year[1]);

    const pathSegments = parsedUrl.pathname.split("/");
    for (let index = 0; index < pathSegments.length - 1; index++) {
        if (pathSegments[index] === "team_year" || pathSegments[index] === "team_perfs") {
            const season = Number(pathSegments[index + 2] || parsedUrl.searchParams.get("year"));
            if (Number.isInteger(season)) return season;
        }
    }

    const queryYear = Number(parsedUrl.searchParams.get("year"));
    return Number.isInteger(queryYear) && queryYear > 0 ? queryYear : null;
}

function isCompletedEvent(data) {
    const records = Array.isArray(data) ? data : [data];
    return records.length > 0 && records.every((record) => {
        const status = record && (record.status || record.status_str);
        return typeof status === "string" && /^(complete|completed)$/i.test(status.trim());
    });
}

function getProviderCacheTtl(parsedUrl, data) {
    const pathname = parsedUrl.pathname;
    const currentYear = new Date().getUTCFullYear();
    const year = getRequestYear(parsedUrl);
    const historical = year != null && year < currentYear;

    if (/\/(?:match|matches)(?:\/|$)/.test(pathname)
        || parsedUrl.searchParams.has("match_key")) {
        return 0;
    }

    if (parsedUrl.hostname === "api.statbotics.io") {
        if (/\/team_years?(?:\/|$)/.test(pathname)) {
            return historical ? DAY_MS : 2 * MINUTE_MS;
        }
        if (/\/team_events?(?:\/|$)/.test(pathname)
            || /\/event(?:s)?(?:\/|$)/.test(pathname)) {
            if (historical) return DAY_MS;
            return isCompletedEvent(data) ? 15 * MINUTE_MS : 30 * SECOND_MS;
        }
    }

    if (parsedUrl.hostname === "peekorobo-db-bec52087b7e6.herokuapp.com") {
        if (/\/team_perfs(?:\/|$)/.test(pathname)) {
            return historical ? DAY_MS : 2 * MINUTE_MS;
        }
        if (/\/event\/[^/]+\/event_perfs(?:\/|$)/.test(pathname)) {
            return historical ? DAY_MS : 30 * SECOND_MS;
        }
    }

    if (parsedUrl.hostname === "www.thebluealliance.com") {
        if (/\/api\/v3\/search_index(?:\/|$)/.test(pathname)) return DAY_MS;
        if (/\/event\/[^/]+\/awards(?:\/|$)/.test(pathname)) {
            return historical ? DAY_MS : 5 * MINUTE_MS;
        }
    }

    return 0;
}

function getHeaderCacheTtl(headers, defaultTtl, requestHeaders) {
    if (defaultTtl <= 0) return 0;

    const cacheControl = headers.get("Cache-Control") || "";
    const directives = cacheControl.toLowerCase();
    if (/(?:^|,)\s*(?:no-store|no-cache)\b/.test(directives)) return 0;
    const requestHeaderNames = new Set(
        Object.keys(requestHeaders || {}).map((name) => name.toLowerCase())
    );
    const varyHeaders = (headers.get("Vary") || "")
        .split(",")
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean);
    if (varyHeaders.includes("*")
        || varyHeaders.some((name) => !requestHeaderNames.has(name))) return 0;

    const maxAge = directives.match(/(?:^|,)\s*max-age\s*=\s*"?(\d+)"?/);
    if (maxAge) {
        const ageSeconds = Number(headers.get("Age")) || 0;
        return Math.min(defaultTtl, Math.max(0, Number(maxAge[1]) - ageSeconds) * SECOND_MS);
    }

    const expires = Date.parse(headers.get("Expires") || "");
    if (Number.isFinite(expires)) {
        const serverDate = Date.parse(headers.get("Date") || "");
        const ageSeconds = Number(headers.get("Age")) || 0;
        const expiresTtl = Math.max(0, expires - (Number.isFinite(serverDate) ? serverDate : Date.now())
            - ageSeconds * SECOND_MS);
        return Math.min(defaultTtl, expiresTtl);
    }

    return defaultTtl;
}

function getCacheTtl(url, responseHeaders, data, requestHeaders) {
    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    } catch (_error) {
        return 0;
    }

    const providerTtl = getProviderCacheTtl(parsedUrl, data);
    return getHeaderCacheTtl(responseHeaders, providerTtl, requestHeaders);
}

function getCachedResponse(key) {
    const cached = responseCache.get(key);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
        responseCache.delete(key);
        cachedBytes -= cached.size;
        return null;
    }

    responseCache.delete(key);
    responseCache.set(key, cached);
    return cached.data;
}

function storeCachedResponse(key, data, ttl) {
    if (ttl <= 0 || data == null) return;
    const serialized = JSON.stringify(data);
    const size = serialized.length * 2;
    if (size > MAX_CACHE_BYTES) return;

    for (const [cacheKey, entry] of responseCache) {
        if (entry.expiresAt <= Date.now()) {
            responseCache.delete(cacheKey);
            cachedBytes -= entry.size;
        }
    }
    const existing = responseCache.get(key);
    if (existing) {
        responseCache.delete(key);
        cachedBytes -= existing.size;
    }
    while (responseCache.size >= MAX_CACHE_ENTRIES || cachedBytes + size > MAX_CACHE_BYTES) {
        const oldestKey = responseCache.keys().next().value;
        const oldest = responseCache.get(oldestKey);
        responseCache.delete(oldestKey);
        cachedBytes -= oldest.size;
    }
    responseCache.set(key, { data, expiresAt: Date.now() + ttl, size });
    cachedBytes += size;
}

function scheduleFetch(host, task) {
    return new Promise((resolve, reject) => {
        fetchQueue.push({ host, task, resolve, reject });
        pumpFetchQueue();
    });
}

function pumpFetchQueue() {
    while (activeFetches < MAX_ACTIVE_FETCHES) {
        const eligibleIndex = fetchQueue.findIndex((request) =>
            (activeFetchesByHost.get(request.host) || 0) < MAX_FETCHES_PER_HOST
        );
        if (eligibleIndex < 0) return;

        const [request] = fetchQueue.splice(eligibleIndex, 1);
        activeFetches += 1;
        activeFetchesByHost.set(
            request.host,
            (activeFetchesByHost.get(request.host) || 0) + 1
        );

        Promise.resolve().then(request.task).then(request.resolve, request.reject).finally(() => {
            activeFetches -= 1;
            const hostCount = (activeFetchesByHost.get(request.host) || 1) - 1;
            if (hostCount) activeFetchesByHost.set(request.host, hostCount);
            else activeFetchesByHost.delete(request.host);
            pumpFetchQueue();
        });
    }
}

async function fetchJson(url, headers, timeoutMs = FETCH_TIMEOUT_MS) {
    const key = normalizedRequestKey(url, headers);
    const cachedData = getCachedResponse(key);
    if (cachedData !== null) return cachedData;

    const requestKey = `${key}\n${timeoutMs}`;
    const existingRequest = inFlightRequests.get(requestKey);
    if (existingRequest) return existingRequest;

    const parsedUrl = new URL(url);
    const request = scheduleFetch(parsedUrl.hostname, async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                headers,
                signal: controller.signal
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            let data;
            try {
                data = await response.json();
            } catch (_error) {
                throw new Error("Invalid JSON");
            }
            storeCachedResponse(key, data, getCacheTtl(url, response.headers, data, headers));
            return data;
        } catch (error) {
            if (error && error.name === "AbortError") {
                throw new Error("Request timed out");
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    });

    inFlightRequests.set(requestKey, request);
    try {
        return await request;
    } finally {
        inFlightRequests.delete(requestKey);
    }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "fetchJson") {
        return undefined;
    }

    const timeoutMs = Number.isFinite(message.timeoutMs)
        ? Math.min(Math.max(message.timeoutMs, FETCH_TIMEOUT_MS), 30000)
        : FETCH_TIMEOUT_MS;
    fetchJson(message.url, message.headers || {}, timeoutMs).then((data) => {
        sendResponse({ ok: true, data });
    }).catch((error) => {
        sendResponse({
            ok: false,
            error: error && error.message ? error.message : "Request failed"
        });
    });

    return true;
});
