document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const navButtons = document.querySelectorAll('.nav-button');
    const pages = document.querySelectorAll('.page');
    const boardSelector = document.getElementById('board-selector');
    const compileBtn = document.getElementById('compile-button');
    const uploadBtn = document.getElementById('upload-button');
    const codeEditorElement = document.getElementById('code-editor');
    const outputArea = document.getElementById('console-output');
    const librarySearchInput = document.getElementById('library-search-input');
    const librarySearchBtn = document.getElementById('library-search-button');
    const librarySearchResults = document.getElementById('library-search-results');
    const installedLibrariesList = document.getElementById('installed-libraries-list');
    const installedCoresList = document.getElementById('installed-cores-list'); // Added reference

    // --- Initialize CodeMirror Editor ---
    const codeEditor = CodeMirror.fromTextArea(codeEditorElement, {
        lineNumbers: true, mode: 'text/x-c++src', theme: 'monokai',
        matchBrackets: true, indentUnit: 2, tabSize: 2
    });
    codeEditor.setValue("void setup() {\n  // put your setup code here, to run once:\n\n}\n\nvoid loop() {\n  // put your main code here, to run repeatedly:\n\n}");

    // --- State Management ---
    let selectedFqbn = null;

    // --- API Communication ---
    const api = {
        get: (endpoint) => fetch(`/api/${endpoint}`).then(res => res.json()),
        post: (endpoint, body) => fetch(`/api/${endpoint}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }).then(res => res.json()),
    };

    // --- UI Rendering Functions ---

    const logOutput = (data) => {
        let message = 'An unknown error occurred.';
        if (typeof data === 'object' && data !== null) {
            if (data.error && data.message) message = `Error: ${data.message}`;
            else if (data.output) message = data.output;
            else if (data.message) message = data.message;
            else message = JSON.stringify(data, null, 2);
        } else { message = data; }
        outputArea.textContent += message + '\n';
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
            const btn = document.createElement('button');
            btn.textContent = 'Install';
            btn.onclick = (e) => { e.stopPropagation(); onClick(); };
            card.appendChild(btn);
        }
        return card;
    };

    // --- Core Logic & API Calls ---

    const populateBoards = async () => {
        const data = await api.get('boards');
        boardSelector.innerHTML = '<option value="">Select a Board</option>';
        if (data && Array.isArray(data.boards)) {
            data.boards.forEach(board => {
                const option = document.createElement('option');
                option.value = board.fqbn;
                option.textContent = board.name;
                boardSelector.appendChild(option);
            });
        } else if (data.error) { logOutput(data); }
    };

    const getInstalledCores = async () => {
        const data = await api.get('cores/installed');
        renderInstalledCores(data);
    };

    const searchLibraries = async () => {
        const query = librarySearchInput.value;
        if (!query) return;
        logOutput(`Searching for "${query}"...`);
        const data = await api.get(`libraries/search?query=${query}`);
        renderLibrarySearchResults(data.libraries);
    };

    const installLibrary = async (name) => {
        logOutput(`Installing ${name}...`);
        const result = await api.post('libraries/install', { name });
        logOutput(result);
        getInstalledLibraries();
    };

    const getInstalledLibraries = async () => {
        const data = await api.get('libraries/installed');
        renderInstalledLibraries(data);
    };

    const compileCode = async () => {
        if (!selectedFqbn) { logOutput('Error: Please select a board first.'); return; }
        logOutput('Saving sketch...');
        await api.post('sketch', { code: codeEditor.getValue() });
        logOutput(`Compiling for ${selectedFqbn}...`);
        const result = await api.post('compile', { fqbn: selectedFqbn });
        logOutput(result);
    };

    const uploadCode = async () => {
        if (!selectedFqbn) { logOutput('Error: Please select a board first.'); return; }
        const port = prompt("Enter the serial port for your board (e.g., COM3 or /dev/ttyACM0):");
        if (!port) { logOutput('Upload cancelled.'); return; }
        logOutput('Saving sketch...');
        await api.post('sketch', { code: codeEditor.getValue() });
        logOutput(`Uploading to ${selectedFqbn} on port ${port}...`);
        const result = await api.post('upload', { fqbn: selectedFqbn, port });
        logOutput(result);
    };

    // --- Rendering Functions ---

    const renderInstalledCores = (data) => {
        installedCoresList.innerHTML = '';
        if (data && Array.isArray(data.platforms)) {
            data.platforms.forEach(platform => {
                const content = [
                    `ID: ${platform.id}`,
                    `Version: ${platform.installed_version}`,
                    `Maintainer: ${platform.maintainer}`
                ].join('\n');
                // The API result from arduino-cli does not include a top-level "name" field for the platform itself
                // We will use the maintainer as the title instead.
                const card = createCard(platform.maintainer, content);
                installedCoresList.appendChild(card);
            });
        } else if (data.error) {
            logOutput(`Could not load installed cores: ${data.message}`);
        }
    };

    const renderLibrarySearchResults = (libs) => {
        librarySearchResults.innerHTML = '';
        if (libs && Array.isArray(libs)) {
            libs.forEach(lib => {
                const card = createCard(lib.library.name, lib.library.sentence, () => installLibrary(lib.library.name));
                librarySearchResults.appendChild(card);
            });
        }
    };

    const renderInstalledLibraries = (data) => {
        installedLibrariesList.innerHTML = '';
        if (data && Array.isArray(data.installed_libraries)) {
            data.installed_libraries.forEach(lib => {
                const library = lib.library;
                const content = [
                    `Author: ${library.author}`,
                    `Version: ${library.version}`,
                    '\n',
                    library.paragraph
                ].join('\n');
                const card = createCard(library.name, content);
                installedLibrariesList.appendChild(card);
            });
        } else if (data.error) {
            logOutput(`Could not load installed libraries: ${data.message}`);
        }
    };

    // --- Event Listeners ---

    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetPageId = 'page-' + button.getAttribute('data-page');
            pages.forEach(page => page.classList.remove('active'));
            document.getElementById(targetPageId).classList.add('active');
            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
        });
    });

    if (boardSelector) boardSelector.addEventListener('change', () => { selectedFqbn = boardSelector.value; });
    if (compileBtn) compileBtn.addEventListener('click', compileCode);
    if (uploadBtn) uploadBtn.addEventListener('click', uploadCode);
    if (librarySearchBtn) librarySearchBtn.addEventListener('click', searchLibraries);

    // --- Initial Load ---
    document.getElementById('page-editor').classList.add('active');
    document.querySelector('.nav-button[data-page="editor"]').classList.add('active');
    
    logOutput("Application initialized. Loading data...");
    populateBoards().then(() => logOutput("Board list loaded."));
    getInstalledLibraries();
    getInstalledCores(); // Fetch and render the installed cores
});
