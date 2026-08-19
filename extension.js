const button = document.querySelector(".activation-deactivation-button");
const sourceButtons = document.querySelectorAll(".source-button");

const DEFAULTS = {
    extensionActive: true,
    dataSource: "peekorobo"
};

chrome.storage.local.get(DEFAULTS, (result) => {
    updateButtonState(result.extensionActive);
    updateSourceButtons(result.dataSource);
});

button.addEventListener("click", () => {
    chrome.storage.local.get(DEFAULTS, (result) => {
        const newState = !result.extensionActive;
        chrome.storage.local.set({ extensionActive: newState });
        updateButtonState(newState);
    });
});

sourceButtons.forEach((sourceButton) => {
    sourceButton.addEventListener("click", () => {
        const dataSource = sourceButton.dataset.source;
        chrome.storage.local.set({ dataSource });
        updateSourceButtons(dataSource);
    });
});

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
