const button = document.querySelector('.activation-deactivation-button');

chrome.storage.local.get(['extensionActive'], function(result) {
    const isActive = result.extensionActive ?? false;
    updateButtonState(isActive);
});

button.addEventListener('click', () => {
    chrome.storage.local.get(['extensionActive'], function(result) {
        const newState = !(result.extensionActive ?? false);
        chrome.storage.local.set({ extensionActive: newState });
        updateButtonState(newState);
    });
});

function updateButtonState(isActive) {
    if (isActive) {
        button.textContent = 'Deactivate';
        button.style.backgroundColor = '#D6C5CE';
        button.style.color = '#1c1c1c';
    } else {
        button.textContent = 'Activate';
        button.style.backgroundColor = '#1C1C1C';
        button.style.color = '#FBE9F2';
    }
}
