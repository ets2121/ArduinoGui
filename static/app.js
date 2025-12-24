document.addEventListener('DOMContentLoaded', () => {
    // ======================================================================
    // --- STATE MANAGEMENT ---
    // ======================================================================
    let state = {
        sketchbookPath: null, 
        currentSketch: null, // { name: "MySketch", path: "/path/to/MySketch" }
        openFiles: {}, // { "/path/to/MySketch/MySketch.ino": "...content..." }
        activeFile: null, // "/path/to/MySketch/MySketch.ino"
        selectedFqbn: null,
    };

    // ======================================================================
    // --- DOM ELEMENT REFERENCES ---
    // ======================================================================
    const appContainer = document.getElementById('app-container');
    const outputArea = document.getElementById('console-output');
    // Sketch Modal
    const sketchModal = document.getElementById('sketch-modal');
    const existingSketchList = document.getElementById('existing-sketch-list');
    const newSketchNameInput = document.getElementById('new-sketch-name');
    const createSketchBtn = document.getElementById('create-sketch-button');
    // Main UI
    const sketchNameDisplay = document.getElementById('sketch-name-display');
    const fileList = document.getElementById('file-list');
    const fileTabs = document.getElementById('file-tabs');
    const editorContainer = document.getElementById('editor-container');
    const codeEditorElement = document.getElementById('code-editor');
    // Buttons
    const saveFileBtn = document.getElementById('save-file-button');
    const deleteFileBtn = document.getElementById('delete-file-button');
    const renameFileBtn = document.getElementById('rename-file-button');
    const newFileNameInput = document.getElementById('new-file-name');
    const createFileBtn = document.getElementById('create-file-button');
    const compileBtn = document.getElementById('compile-button');
    const uploadBtn = document.getElementById('upload-button');
    // Other UI
    const boardSelector = document.getElementById('board-selector');
    const navButtons = document.querySelectorAll('.nav-button');
    const pages = document.querySelectorAll('.page');
    // Library Page
    const librarySearchInput = document.getElementById('library-search-input');
    const librarySearchBtn = document.getElementById('library-search-button');
    const librarySearchResults = document.getElementById('library-search-results');
    const installedLibrariesList = document.getElementById('installed-libraries-list');
    // Boards Page
    const installedCoresList = document.getElementById('installed-cores-list');

    // ======================================================================
    // --- CODEMIRROR INITIALIZATION ---
    // ======================================================================
    const codeEditor = CodeMirror.fromTextArea(codeEditorElement, {
        lineNumbers: true, mode: 'text/x-c++src', theme: 'monokai',
        matchBrackets: true, indentUnit: 2, tabSize: 2, 
    });
    codeEditor.setOption("extraKeys", {
        "Ctrl-S": () => saveCurrentFile(),
    });

    // ======================================================================
    // --- API COMMUNICATION ---
    // ======================================================================
    const api = {
        get: (endpoint) => fetch(endpoint).then(res => res.json()),
        post: (endpoint, body) => fetch(endpoint, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }).then(res => res.json()),
        put: (endpoint, body) => fetch(endpoint, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }).then(res => res.json()),
        delete: (endpoint, body) => fetch(endpoint, {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }).then(res => res.json()),
    };

    // ======================================================================
    // --- UTILITY & LOGGING ---
    // ======================================================================
    const logOutput = (data, prefix = '') => {
        let message = 'An unknown error occurred.';
        if (typeof data === 'object' && data !== null) {
            if (data.error && data.message) message = `Error: ${data.message}`;
            else if (data.output) message = data.output;
            else if (data.message) message = data.message;
            else message = JSON.stringify(data, null, 2);
        } else { message = data; }
        outputArea.textContent += (prefix ? `[${prefix}] ` : '') + message + '\n';
        outputArea.scrollTop = outputArea.scrollHeight;
    };
    
    const createCard = (title, content, onClick) => {
        const card = document.createElement('div');
        card.className = 'card';
        const titleEl = document.createElement('h3');
        titleEl.textContent = title;
        card.appendChild(titleEl);
        if (content) {
            const contentEl = document.createElement('pre');
            contentEl.textContent = content;
            card.appendChild(contentEl);
        }
        if (onClick) {
            card.classList.add('clickable');
            card.addEventListener('click', onClick);
        }
        return card;
    };

    // ======================================================================
    // --- UI RENDERING & MANAGEMENT ---
    // ======================================================================

    function renderFileList() {
        fileList.innerHTML = '';
        Object.keys(state.openFiles).forEach(filePath => {
            const fileName = filePath.split('/').pop();
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.textContent = fileName;
            fileItem.dataset.filePath = filePath;
            fileItem.addEventListener('click', () => openFile(filePath));
            fileList.appendChild(fileItem);
        });
    }

    function renderFileTabs() {
        fileTabs.innerHTML = '';
        Object.keys(state.openFiles).forEach(filePath => {
            const fileName = filePath.split('/').pop();
            const tab = document.createElement('div');
            tab.className = 'tab';
            tab.textContent = fileName;
            tab.dataset.filePath = filePath;
            if (filePath === state.activeFile) {
                tab.classList.add('active');
            }
            tab.addEventListener('click', () => setActiveFile(filePath));
            fileTabs.appendChild(tab);
        });
    }

    function setActiveFile(filePath) {
        if (!state.openFiles.hasOwnProperty(filePath)) return;
        state.activeFile = filePath;
        codeEditor.setValue(state.openFiles[filePath]);
        renderFileTabs();
        logOutput(`Opened ${filePath.split('/').pop()}`, 'Editor');
    }

    // ======================================================================
    // --- CORE LOGIC: Sketch & File Handling ---
    // ======================================================================

    async function loadSketch(sketch) {
        logOutput(`Loading sketch: ${sketch.name}...`);
        state.currentSketch = sketch;
        state.openFiles = {};
        state.activeFile = null;

        const data = await api.get(`/api/sketch/files?path=${encodeURIComponent(sketch.path)}`);
        if (data.error) {
            logOutput(data);
            return;
        }

        for (const fileName of data.files) {
            const filePath = `${sketch.path}/${fileName}`;
            await openFile(filePath, false); // Open but don't make active yet
        }

        // Set the first file as active
        if (data.files.length > 0) {
            const firstFilePath = `${sketch.path}/${data.files[0]}`;
            setActiveFile(firstFilePath);
        }

        renderFileList();
        sketchNameDisplay.textContent = sketch.name;
        sketchModal.classList.remove('active');
        appContainer.style.display = 'flex';
        logOutput(`Sketch loaded successfully.`);
    }

    async function openFile(filePath, makeActive = true) {
        const data = await api.get(`/api/sketch/file/content?path=${encodeURIComponent(filePath)}`);
        if (data.error) {
            logOutput(data);
            return;
        }
        state.openFiles[filePath] = data.content;
        if (makeActive) {
            setActiveFile(filePath);
        }
    }

    async function saveCurrentFile() {
        if (!state.activeFile) {
            logOutput('No active file to save.', 'Editor');
            return;
        }
        logOutput(`Saving ${state.activeFile.split('/').pop()}...`, 'Editor');
        const content = codeEditor.getValue();
        const result = await api.put('/api/sketch/file/content', {
            path: state.activeFile,
            content: content
        });
        logOutput(result);
        if (!result.error) {
            state.openFiles[state.activeFile] = content; // Update local cache
        }
    }
    
    async function createNewSketch() {
        const sketchName = newSketchNameInput.value;
        if (!sketchName || !sketchName.match(/^[a-zA-Z0-9_\-]+$/)) {
            logOutput('Invalid sketch name. Use letters, numbers, underscore, or dash.');
            return;
        }
        logOutput(`Creating new sketch: ${sketchName}...`);
        const result = await api.post('/api/sketches/new', { name: sketchName });
        logOutput(result);
        if (result.success && result.output) {
            // The output of `sketch new` is the path to the sketch folder.
            // We need to parse it to get the name and path.
            const path = result.output.trim();
            const name = path.split(/[\\/]/).pop();
            await loadSketch({ name, path });
        }
        // Refresh the list in the modal
        populateExistingSketches(); 
    }

    async function createNewFile() {
        const fileName = newFileNameInput.value;
        if (!fileName) {
            logOutput("Please enter a file name.");
            return;
        }
        const filePath = `${state.currentSketch.path}/${fileName}`;
        logOutput(`Creating file: ${fileName}...`);
        const result = await api.post('/api/sketch/file', { path: filePath });
        logOutput(result);
        if (!result.error) {
            await openFile(filePath, true); // Open the new file
            renderFileList();
            renderFileTabs();
        }
    }
    
    async function deleteCurrentFile() {
        if (!state.activeFile) {
            logOutput('No active file selected.');
            return;
        }
        if (!confirm(`Are you sure you want to delete ${state.activeFile.split('/').pop()}?`)) {
            return;
        }
        logOutput(`Deleting file: ${state.activeFile}...`);
        const result = await api.delete('/api/sketch/file', { path: state.activeFile });
        logOutput(result);

        if (!result.error) {
            delete state.openFiles[state.activeFile];
            state.activeFile = null;
            // Switch to another file if one exists
            const remainingFiles = Object.keys(state.openFiles);
            if (remainingFiles.length > 0) {
                setActiveFile(remainingFiles[0]);
            }
            renderFileList();
            renderFileTabs();
        }
    }

    async function renameCurrentFile() {
        if (!state.activeFile) {
            logOutput('No active file selected.');
            return;
        }
        const oldPath = state.activeFile;
        const oldName = oldPath.split('/').pop();
        const newName = prompt("Enter new name for the file:", oldName);

        if (!newName || newName === oldName) {
            logOutput("Rename cancelled.");
            return;
        }

        logOutput(`Renaming ${oldName} to ${newName}...`);
        const result = await api.post('/api/sketch/file/rename', { old_path: oldPath, new_name: newName });
        logOutput(result);

        if (!result.error) {
            const newPath = `${state.currentSketch.path}/${newName}`;
            // Update state
            state.openFiles[newPath] = state.openFiles[oldPath];
            delete state.openFiles[oldPath];
            state.activeFile = newPath;
            renderFileList();
            renderFileTabs();
        }
    }

    // ======================================================================
    // --- INITIALIZATION & MODAL ---
    // ======================================================================

    async function populateExistingSketches() {
        const data = await api.get('/api/sketches');
        existingSketchList.innerHTML = '';
        if (data.sketchbooks && data.sketchbooks[0].sketches) {
            data.sketchbooks[0].sketches.forEach(sketch => {
                const card = createCard(sketch.name, `Path: ${sketch.path}`, () => loadSketch(sketch));
                existingSketchList.appendChild(card);
            });
        }
    }

    // ======================================================================
    // --- OTHER API-DEPENDENT FUNCTIONS ---
    // ======================================================================
    
    // --- Compile & Upload (Updated) ---
    async function compileSketch() {
        if (!state.currentSketch) { logOutput('No sketch loaded.'); return; }
        if (!state.selectedFqbn) { logOutput('Please select a board.'); return; }
        await saveCurrentFile(); // Save before compiling
        logOutput(`Compiling sketch: ${state.currentSketch.name}...`);
        const result = await api.post('/api/compile', {
            fqbn: state.selectedFqbn,
            sketch_path: state.currentSketch.path
        });
        logOutput(result);
    }

    async function uploadSketch() {
        if (!state.currentSketch) { logOutput('No sketch loaded.'); return; }
        if (!state.selectedFqbn) { logOutput('Please select a board.'); return; }
        const port = prompt("Enter serial port (e.g., COM3):", "");
        if (!port) { logOutput("Upload cancelled."); return; }
        await saveCurrentFile(); // Save before uploading
        logOutput(`Uploading sketch: ${state.currentSketch.name}...`);
        const result = await api.post('/api/upload', {
            fqbn: state.selectedFqbn,
            port: port,
            sketch_path: state.currentSketch.path
        });
        logOutput(result);
    }

    // --- Boards & Libraries (Existing) ---
    async function populateBoards() {
        const data = await api.get('/api/boards');
        boardSelector.innerHTML = '<option value="">Select Board</option>';
        if (data && data.boards) {
            data.boards.forEach(board => {
                const option = new Option(board.name, board.fqbn);
                boardSelector.add(option);
            });
        }
    }

    async function getInstalledCores() {
        const data = await api.get('/api/cores/installed');
        installedCoresList.innerHTML = '';
        if (data && data.platforms) {
            data.platforms.forEach(p => {
                const content = `ID: ${p.id}\nVersion: ${p.installed_version}`;
                installedCoresList.appendChild(createCard(p.maintainer, content));
            });
        }
    }

    async function searchLibraries() {
        const query = librarySearchInput.value;
        if (!query) return;
        logOutput(`Searching for "${query}"...`, 'Library');
        const data = await api.get(`/api/libraries/search?query=${query}`);
        librarySearchResults.innerHTML = '';
        if (data.libraries) {
            data.libraries.forEach(lib => {
                const card = createCard(lib.library.name, lib.library.sentence, () => installLibrary(lib.library.name));
                librarySearchResults.appendChild(card);
            });
        }
    }
    
    async function installLibrary(name) {
        logOutput(`Installing ${name}...`, 'Library');
        const result = await api.post('/api/libraries/install', { name });
        logOutput(result, 'Library');
        getInstalledLibraries();
    }

    async function getInstalledLibraries() {
        const data = await api.get('/api/libraries/installed');
        installedLibrariesList.innerHTML = '';
        if (data.installed_libraries) {
            data.installed_libraries.forEach(lib => {
                const l = lib.library;
                const content = `Author: ${l.author}\nVersion: ${l.version}\n\n${l.paragraph}`;
                installedLibrariesList.appendChild(createCard(l.name, content));
            });
        }
    }
    
    // ======================================================================
    // --- EVENT LISTENERS ---
    // ======================================================================
    createSketchBtn.addEventListener('click', createNewSketch);
    createFileBtn.addEventListener('click', createNewFile);
    saveFileBtn.addEventListener('click', saveCurrentFile);
    deleteFileBtn.addEventListener('click', deleteCurrentFile);
    renameFileBtn.addEventListener('click', renameCurrentFile);
    compileBtn.addEventListener('click', compileSketch);
    uploadBtn.addEventListener('click', uploadSketch);
    boardSelector.addEventListener('change', () => state.selectedFqbn = boardSelector.value);
    librarySearchBtn.addEventListener('click', searchLibraries);

    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetPageId = 'page-' + button.getAttribute('data-page');
            pages.forEach(page => page.classList.remove('active'));
            document.getElementById(targetPageId).classList.add('active');
            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
        });
    });

    // ======================================================================
    // --- INITIAL LOAD ---
    // ======================================================================
    logOutput("Initializing application...");
    populateExistingSketches();
    populateBoards();
    getInstalledLibraries();
    getInstalledCores();
    logOutput("Ready. Please select or create a sketch.");
});
