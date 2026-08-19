const FETCH_TIMEOUT_MS = 8000;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "fetchJson") {
        return undefined;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    fetch(message.url, {
        headers: message.headers || {},
        signal: controller.signal
    }).then(async (response) => {
        if (!response.ok) {
            sendResponse({ ok: false, error: `HTTP ${response.status}` });
            return;
        }
        try {
            sendResponse({ ok: true, data: await response.json() });
        } catch (error) {
            sendResponse({ ok: false, error: "Invalid JSON" });
        }
    }).catch((error) => {
        const timedOut = error && error.name === "AbortError";
        sendResponse({
            ok: false,
            error: timedOut ? "Request timed out" : (error && error.message ? error.message : "Request failed")
        });
    }).finally(() => {
        clearTimeout(timeoutId);
    });

    return true;
});
