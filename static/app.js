document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const boardSelector = document.getElementById('board-selector');
    const compileBtn = document.getElementById('compile-btn');
    const uploadBtn = document.getElementById('upload-btn');
    const codeEditor = document.getElementById('code-editor');
    const outputArea = document.getElementById('output-area');
    const librarySearchInput = document.getElementById('library-search-input');
    const librarySearchBtn = document.getElementById('library-search-btn');
    const librarySearchResults = document.getElementById('library-search-results');
    const installedLibrariesList = document.getElementById('installed-libraries-list');

    // --- State Management ---
    let selectedFqbn = null;

    // --- API Communication ---
    const api = {
        get: (endpoint) => fetch(`/api/${endpoint}`).then(res => res.json()),
        post: (endpoint, body) => fetch(`/api/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }).then(res => res.json()),
    };

    // --- UI Rendering Functions ---

    const logOutput = (data) => {
        let message = 'An unknown error occurred.';

        // Handle structured JSON from our API or raw text
        if (typeof data === 'object' && data !== null) {
            if (data.message) {
                message = data.message;
            } else if (data.output) {
                message = data.output;
            } else if (data.error && data.message) {
                message = `Error: ${data.message}`;
            }
             else {
                message = JSON.stringify(data, null, 2);
            }
        } else {
            message = data; // Fallback for plain text
        }

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
            const contentEl = document.createElement('p');
            contentEl.textContent = content;
            card.appendChild(contentEl);
        }

        if (onClick) {
            const btn = document.createElement('button');
            btn.textContent = 'Install';
            btn.onclick = (e) => {
                e.stopPropagation();
                onClick();
            };
            card.appendChild(btn);
        }

        return card;
    };

    // --- Core Logic Functions ---

    const populateBoards = async () => {
        const data = await api.get('boards');
        boardSelector.innerHTML = '<option value="">Select a Board</option>';
        if (data && data.boards) {
            data.boards.forEach(board => {
                const option = document.createElement('option');
                option.value = board.fqbn;
                option.textContent = board.name;
                boardSelector.appendChild(option);
            });
        }
    };

    const searchLibraries = async () => {
        const query = librarySearchInput.value;
        if (!query) return;
        logOutput(`Searching for "${query}"...`);
        const data = await api.get(`libraries/search?query=${query}`);
        logOutput(data);
        renderLibrarySearchResults(data.libraries);
    };

    const installLibrary = async (name) => {
        logOutput(`Installing ${name}...`);
        const result = await api.post('libraries/install', { name });
        logOutput(result);
        // Refresh the installed list after installing
        getInstalledLibraries(); 
    };

    const getInstalledLibraries = async () => {
        const data = await api.get('libraries/installed');
        renderInstalledLibraries(data);
    };

    const compileCode = async () => {
        if (!selectedFqbn) {
            logOutput('Error: Please select a board first.');
            return;
        }
        logOutput('Saving sketch...');
        await api.post('sketch', { code: codeEditor.value });
        logOutput(`Compiling for ${selectedFqbn}...`);
        const result = await api.post('compile', { fqbn: selectedFqbn });
        logOutput(result);
    };

    const uploadCode = async () => {
        if (!selectedFqbn) {
            logOutput('Error: Please select a board first.');
            return;
        }
        const port = prompt("Enter the serial port for your board (e.g., COM3 or /dev/ttyACM0):");
        if (!port) {
            logOutput('Upload cancelled.');
            return;
        }
        logOutput('Saving sketch...');
        await api.post('sketch', { code: codeEditor.value });
        logOutput(`Uploading to ${selectedFqbn} on port ${port}...`);
        const result = await api.post('upload', { fqbn: selectedFqbn, port });
        logOutput(result);
    };

    // --- Rendering Functions ---

    const renderLibrarySearchResults = (libs) => {
        librarySearchResults.innerHTML = '';
        if (libs) {
            libs.forEach(lib => {
                const card = createCard(lib.library.name, lib.library.sentence, () => installLibrary(lib.library.name));
                librarySearchResults.appendChild(card);
            });
        }
    };

    const renderInstalledLibraries = (data) => {
        installedLibrariesList.innerHTML = '';
        // BUG FIX: The API returns { "installed_libraries": [...] }
        // The old code was looking for a "libraries" property.
        if(data && data.installed_libraries){
          data.installed_libraries.forEach(lib => {
              const library = lib.library;
              const content = `Version: ${library.version} | Author: ${library.author}`;
              const card = createCard(library.name, content);
              installedLibrariesList.appendChild(card);
          });
        } else if (data.error) {
            logOutput(`Could not load installed libraries: ${data.message}`);
        }
    };

    // --- Event Listeners ---
    boardSelector.addEventListener('change', () => {
        selectedFqbn = boardSelector.value;
    });
    compileBtn.addEventListener('click', compileCode);
    uploadBtn.addEventListener('click', uploadCode);
    librarySearchBtn.addEventListener('click', searchLibraries);

    // --- Initial Load ---
    logOutput("Application initialized. Waiting for board list...");
    populateBoards().then(() => logOutput("Board list loaded."));
    getInstalledLibraries();
});
