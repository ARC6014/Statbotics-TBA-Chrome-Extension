const button = document.querySelector(".activation-deactivation-button");
const sourceButtons = document.querySelectorAll(".source-button");
const favoritesList = document.querySelector("#favorites-list");
const favoritesStatus = document.querySelector("#favorites-status");
const favoritesCount = document.querySelector("#favorites-count");
const FAVORITES_STORAGE_KEY = "favoriteTeams";

const DEFAULTS = {
    extensionActive: true,
    dataSource: "peekorobo",
    [FAVORITES_STORAGE_KEY]: []
};

let currentFavorites = [];

chrome.storage.local.get(DEFAULTS, (result) => {
    if (chrome.runtime.lastError) {
        favoritesStatus.textContent = "Unable to load extension settings.";
        return;
    }
    updateButtonState(result.extensionActive);
    updateSourceButtons(result.dataSource);
    currentFavorites = normalizeFavoriteTeams(result[FAVORITES_STORAGE_KEY]);
    renderFavorites();
});

button.addEventListener("click", () => {
    chrome.storage.local.get(DEFAULTS, (result) => {
        if (chrome.runtime.lastError) return;
        const newState = !result.extensionActive;
        chrome.storage.local.set({ extensionActive: newState }, () => {
            if (chrome.runtime.lastError) return;
            updateButtonState(newState);
        });
    });
});

sourceButtons.forEach((sourceButton) => {
    sourceButton.addEventListener("click", () => {
        const dataSource = sourceButton.dataset.source;
        chrome.storage.local.set({ dataSource }, () => {
            if (chrome.runtime.lastError) return;
            updateSourceButtons(dataSource);
        });
    });
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[FAVORITES_STORAGE_KEY]) {
        currentFavorites = normalizeFavoriteTeams(changes[FAVORITES_STORAGE_KEY].newValue);
        renderFavorites();
    }
});

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

function updateButtonState(isActive) {
    if (isActive) {
        button.textContent = "Deactivate";
        button.style.backgroundColor = "#D6C5CE";
        button.style.color = "#1c1c1c";
        button.style.borderColor = "#D6C5CE";
    } else {
        button.textContent = "Activate";
        button.style.backgroundColor = "#1C1C1C";
        button.style.color = "#FBE9F2";
        button.style.borderColor = "#FBE9F2";
    }
}

function updateSourceButtons(dataSource) {
    sourceButtons.forEach((sourceButton) => {
        sourceButton.classList.toggle("active", sourceButton.dataset.source === dataSource);
    });
}

function renderFavorites() {
    favoritesCount.textContent = String(currentFavorites.length);
    favoritesList.replaceChildren();

    currentFavorites.forEach((favorite) => {
        const item = document.createElement("div");
        item.className = "favorite-item";

        const link = document.createElement("a");
        link.className = "favorite-link";
        link.href = `https://www.thebluealliance.com/team/${encodeURIComponent(favorite.teamNumber)}`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = favorite.name
            ? `${favorite.teamNumber} - ${favorite.name}`
            : `Team ${favorite.teamNumber}`;

        item.appendChild(link);
        favoritesList.appendChild(item);
    });

    favoritesStatus.textContent = currentFavorites.length
        ? ""
        : "No favorites yet. Select the star on a TBA team page to add one.";
}
