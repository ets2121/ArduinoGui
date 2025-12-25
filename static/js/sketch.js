(() => {
    const App = window.App;
    let sketchModalInstance;

    const dom = {
        sketchModalEl: document.getElementById('sketch-modal'),
        existingSketchList: document.getElementById('existing-sketch-list'),
        newSketchNameInput: document.getElementById('new-sketch-name'),
        createSketchBtn: document.getElementById('create-sketch-button'),
        appContainer: document.getElementById('app-container'),
        sketchNameDisplay: document.getElementById('sketch-name-display'),
    };

    async function loadSketch(sketch) {
        App.logOutput(`Loading sketch: ${sketch.name}...`);
        App.state.currentSketch = sketch;
        App.state.openFiles = {};
        App.state.activeFile = null;

        // Hand off to the editor module to load files
        await App.Editor.loadAllFiles(sketch.path);

        dom.sketchNameDisplay.textContent = sketch.name;
        
        // Hide the modal using Bootstrap's API
        if (sketchModalInstance) {
            sketchModalInstance.hide();
        }

        // Show the main app container
        dom.appContainer.style.display = ''; // Use default display
        dom.appContainer.classList.remove('d-none');
        
        App.logOutput(`Sketch loaded successfully.`);
    }

    async function createNewSketch() {
        const sketchName = dom.newSketchNameInput.value;
        if (!sketchName || !sketchName.match(/^[a-zA-Z0-9_\-]+$/)) {
            App.logOutput('Invalid sketch name. Use letters, numbers, underscore, or dash.');
            return;
        }
        App.logOutput(`Creating new sketch: ${sketchName}...`);
        const result = await App.api.post('/api/sketches/new', { name: sketchName });
        App.logOutput(result);

        if (result.success && result.path) {
            await loadSketch({ name: sketchName, path: result.path });
            populateSketches(); // Refresh list in the background
        }
    }

    async function populateSketches() {
        const data = await App.api.get('/api/sketches');
        dom.existingSketchList.innerHTML = '';
        if (data.sketchbooks && data.sketchbooks[0] && data.sketchbooks[0].sketches) {
            data.sketchbooks[0].sketches.forEach(sketch => {
                // Create a Bootstrap card in a column
                const col = document.createElement('div');
                col.className = 'col';
                const card = App.createCard(sketch.name, null, () => loadSketch(sketch)); // No path needed for display
                col.appendChild(card);
                dom.existingSketchList.appendChild(col);
            });
        }
    }

    App.Sketch.init = () => {
        // Create a Bootstrap Modal instance
        sketchModalInstance = new bootstrap.Modal(dom.sketchModalEl);

        dom.createSketchBtn.addEventListener('click', createNewSketch);

        // Show the modal on initialization
        sketchModalInstance.show();
    };

    // Expose for main.js to call
    App.Sketch.populateSketches = populateSketches;
})();