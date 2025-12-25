(() => {
    const App = window.App;

    const dom = {
        compileBtn: document.getElementById('compile-button'),
        uploadBtn: document.getElementById('upload-button'),
        boardSelector: document.getElementById('board-selector'),
    };

    async function populateBoards() {
        const data = await App.api.get('/api/boards');
        dom.boardSelector.innerHTML = '<option value="">Select Board</option>';
        if (data && data.boards) {
            data.boards.forEach(b => {
                dom.boardSelector.add(new Option(b.name, b.fqbn));
            });
        }
    }

    async function compileSketch() {
        if (!App.state.currentSketch || !App.state.selectedFqbn) {
            App.logOutput('Missing sketch or board selection for compile.');
            return;
        }
        await App.Editor.saveCurrentFile(); 
        App.logOutput(`Compiling sketch: ${App.state.currentSketch.name}...`);
        const result = await App.api.post('/api/compile', { 
            fqbn: App.state.selectedFqbn, 
            sketch_path: App.state.currentSketch.path 
        });
        App.logOutput(result);
    }

    async function uploadSketch() {
        if (!App.state.currentSketch || !App.state.selectedFqbn) {
            App.logOutput('Missing sketch or board selection for upload.');
            return;
        }

        const port = prompt("Enter serial port (e.g., COM3 or /dev/ttyUSB0):", "");
        if (!port) {
            App.logOutput("Upload cancelled.");
            return;
        }

        await App.Editor.saveCurrentFile();
        App.logOutput(`Uploading sketch: ${App.state.currentSketch.name}...`);
        const result = await App.api.post('/api/upload', {
            fqbn: App.state.selectedFqbn, 
            port: port, 
            sketch_path: App.state.currentSketch.path
        });
        App.logOutput(result);
    }

    App.Actions.init = () => {
        dom.compileBtn.addEventListener('click', compileSketch);
        dom.uploadBtn.addEventListener('click', uploadSketch);
        dom.boardSelector.addEventListener('change', () => {
            App.state.selectedFqbn = dom.boardSelector.value;
        });
        populateBoards(); // Populate boards on initialization
    };

})();