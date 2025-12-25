(() => {
    const App = window.App;

    const dom = {
        sketchModal: document.getElementById('sketch-modal'),
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
        dom.sketchModal.classList.remove('active');
        dom.appContainer.style.display = 'flex';
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
                const card = App.createCard(sketch.name, `Path: ${sketch.path}`, () => loadSketch(sketch));
                dom.existingSketchList.appendChild(card);
            });
        }
    }

    App.Sketch.init = () => {
        dom.createSketchBtn.addEventListener('click', createNewSketch);
    };

    App.Sketch.populateSketches = populateSketches;
})();