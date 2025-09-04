document.addEventListener("DOMContentLoaded", () => {
    const playerNameInput = document.getElementById("playerName");
    const colorPicker = document.getElementById("color-picker");
    const continueBtn = document.getElementById("continueBtn");
    const avatarPreview = document.getElementById("avatar-preview");
    const styleSelector = document.getElementById("style-selector");
    const hairSelector = document.getElementById("hair-selector");

    let selectedStyle = 'casual';
    let selectedHair = 'short';

    // Set initial preview state
    avatarPreview.style.backgroundColor = colorPicker.value;

    // Update preview color as the color changes
    colorPicker.addEventListener("input", () => {
        avatarPreview.style.backgroundColor = colorPicker.value;
    });

    // Handle style selection
    styleSelector.addEventListener('click', (e) => {
        const button = e.target.closest('.style-btn');
        if (!button) return;
        selectedStyle = button.dataset.style;
        document.querySelectorAll('.style-btn').forEach(btn => btn.classList.remove('selected'));
        button.classList.add('selected');
    });

    // Handle hair selection
    hairSelector.addEventListener('click', (e) => {
        const button = e.target.closest('.hair-btn');
        if (!button) return;
        selectedHair = button.dataset.hair;
        document.querySelectorAll('.hair-btn').forEach(btn => btn.classList.remove('selected'));
        button.classList.add('selected');
    });

    // When the continue button is clicked
    continueBtn.addEventListener("click", () => {
        const playerName = playerNameInput.value.trim();
        if (!playerName) {
            alert("Please enter a name.");
            return;
        }

        // Save all player info to localStorage to be used in the main app
        localStorage.setItem("playerName", playerName);
        localStorage.setItem("playerColor", colorPicker.value);
        localStorage.setItem("playerStyle", selectedStyle);
        localStorage.setItem("playerHair", selectedHair);

        // Redirect to the main application
        window.location.href = "index.html";
    });
});
