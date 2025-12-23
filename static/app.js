
document.addEventListener('DOMContentLoaded', () => {
    // --- UI Elements ---
    const navButtons = document.querySelectorAll('.nav-button');
    const pages = document.querySelectorAll('.page');
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    const consoleOutput = document.getElementById('console-output');

    // --- Editor Elements ---
    const codeEditor = CodeMirror.fromTextArea(document.getElementById('code-editor'), {
        lineNumbers: true,
        mode: 'text/x-c++src',
        theme: 'monokai',
        gutters: ["CodeMirror-linenumbers"],
    });
    const boardSelector = document.getElementById('board-selector');
    const compileButton = document.getElementById('compile-button');
    const uploadButton = document.getElementById('upload-button');

    // --- Board Manager Elements ---
    const addBoardUrlButton = document.getElementById('add-board-url-button');
    const boardUrlInput = document.getElementById('board-url-input');
    const installedCoresList = document.getElementById('installed-cores-list');
    const boardListContainer = document.getElementById('board-list-container');

    // --- Library Manager Elements ---
    const librarySearchButton = document.getElementById('library-search-button');
    const librarySearchInput = document.getElementById('library-search-input');
    const librarySearchResults = document.getElementById('library-search-results');
    const installedLibrariesList = document.getElementById('installed-libraries-list');

    // --- Example Elements ---
    const exampleListContainer = document.getElementById('example-list-container');

    // --- State ---
    let selectedFqbn = '';
    let isInitialized = false;

    // --- Utility Functions ---
    const showLoading = (text = 'Processing...') => {
        loadingText.textContent = text;
        loadingOverlay.style.display = 'flex';
    };
    const hideLoading = () => {
        loadingOverlay.style.display = 'none';
    };
    const logToConsole = (message, isError = false) => {
        consoleOutput.textContent += message + '\n';
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
        if (isError) console.error(message);
    };
    
    const handleApiResponse = async (response) => {
        if (response.status === 503) {
            const err = await response.json();
            if (err.error === 'initializing') {
                showLoading('Initializing Workspace... Please wait.');
                return { isInitializing: true }; 
            }
        }

        const result = await response.json();
        if (response.status >= 400) {
            throw new Error(result.error || `Request failed with status ${response.status}`);
        }
        return result;
    };

    // --- Navigation ---
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (!isInitialized) return;
            const pageId = `page-${button.dataset.page}`;
            pages.forEach(page => page.classList.remove('active'));
            navButtons.forEach(btn => btn.classList.remove('active'));
            document.getElementById(pageId).classList.add('active');
            button.classList.add('active');

            if (pageId === 'page-boards') fetchBoardsAndCores();
            if (pageId === 'page-libraries') fetchInstalledLibraries();
            if (pageId === 'page-examples') fetchExamples();
        });
    });

    // --- API Calls ---
    const api = {
        get: async (url) => {
            const response = await fetch(url);
            return handleApiResponse(response);
        },
        post: async (url, body) => {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            return handleApiResponse(response);
        },
    };

    // --- Board Management ---
    const fetchBoardsAndCores = async () => {
        try {
            const [boardsResponse, coresResponse] = await Promise.all([api.get('/api/boards'), api.get('/api/cores/installed')]);
            
            if (boardsResponse.isInitializing || coresResponse.isInitializing) {
                return false; // Indicate that initialization is pending
            }

            renderBoards(boardsResponse.boards || []);
            renderInstalledCores(coresResponse || []);
            populateBoardSelector(boardsResponse.boards || []);
            return true; // Indicate success
        } catch (error) {
            logToConsole(`Error loading boards: ${error.message}`, true);
            return false;
        } 
    };

    const pollForInitialization = async () => {
        const success = await fetchBoardsAndCores();
        if (success) {
            isInitialized = true;
            hideLoading();
            logToConsole('Workspace ready!');
            fetchInstalledLibraries();
            document.body.classList.remove('uninitialized');
        } else {
            setTimeout(pollForInitialization, 3000); 
        }
    };

    addBoardUrlButton.addEventListener('click', async () => {
        const url = boardUrlInput.value;
        if (!url) return;
        showLoading('Adding URL and updating index...');
        try {
            const result = await api.post('/api/config/add-url', { url });
            if(result.output) logToConsole(result.output);
            logToConsole('Successfully updated core index.');
            fetchBoardsAndCores();
        } catch (error) {
            logToConsole(`Error adding board URL: ${error.message}`, true);
        } finally {
            hideLoading();
        }
    });

    // --- Library Management ---
    const fetchInstalledLibraries = async () => {
        if (!isInitialized) return;
        showLoading('Loading libraries...');
        try {
            const libs = await api.get('/api/libraries/installed');
            if (libs && !libs.isInitializing) {
                 renderInstalledLibraries(libs || []);
            }
        } catch (error) {
            logToConsole(`Error loading installed libraries: ${error.message}`, true);
        } finally {
            hideLoading();
        }
    };

    librarySearchButton.addEventListener('click', async () => {
        const query = librarySearchInput.value;
        if (!query) return;
        showLoading('Searching libraries...');
        try {
            const results = await api.get(`/api/libraries/search?query=${encodeURIComponent(query)}`);
            renderLibrarySearchResults(results.libraries || []);
        } catch (error) {
            logToConsole(`Error searching libraries: ${error.message}`, true);
        } finally {
            hideLoading();
        }
    });

    window.installLibrary = async (name) => {
        showLoading(`Installing ${name}...`);
        try {
            const result = await api.post('/api/libraries/install', { name });
            if(result.output) logToConsole(result.output);
            logToConsole(`${name} installed successfully.`);
            fetchInstalledLibraries();
        } catch (error) {
            logToConsole(`Error installing library: ${error.message}`, true);
        } finally {
            hideLoading();
        }
    };

    // --- Examples ---
    const fetchExamples = async () => {
        showLoading('Loading examples...');
        try {
            const examples = await api.get('/api/examples');
            renderExamples(examples.examples || []);
        } catch (error) {
            logToConsole(`Error loading examples: ${error.message}`, true);
        } finally {
            hideLoading();
        }
    };

    window.loadExample = (code) => {
        codeEditor.setValue(code || '// Example code not available.');
        document.querySelector('.nav-button[data-page="editor"]').click();
    };

    // --- Editor and Compilation ---
    codeEditor.on('change', async () => {
        await api.post('/api/sketch', { code: codeEditor.getValue() }).catch(() => {});
    });

    boardSelector.addEventListener('change', () => {
        selectedFqbn = boardSelector.value;
    });

    compileButton.addEventListener('click', async () => {
        if (!selectedFqbn) {
            logToConsole('Please select a board first.', true);
            return;
        }
        showLoading('Compiling...');
        try {
            const result = await api.post('/api/compile', { fqbn: selectedFqbn });
            if(result.output) logToConsole(result.output);
            logToConsole('Compilation finished.');
        } catch (error) {
            logToConsole(`Compilation failed: ${error.message}`, true);
        } finally {
            hideLoading();
        }
    });

    uploadButton.addEventListener('click', async () => {
        if (!selectedFqbn) {
            logToConsole('Please select a board first.', true);
            return;
        }
        showLoading('Uploading...');
        try {
            const result = await api.post('/api/upload', { fqbn: selectedFqbn });
            if(result.output) logToConsole(result.output);
            logToConsole('Upload finished.');
        } catch (error) {
            logToConsole(`Upload failed: ${error.message}`, true);
        } finally {
            hideLoading();
        }
    });

    // --- Rendering Functions ---
    const createCard = (title, content, installFn) => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `<h5>${title || 'Unknown'}</h5><p>${content || ''}</p>`;
        if (installFn) {
            const button = document.createElement('button');
            button.textContent = 'Install';
            button.onclick = installFn;
            card.appendChild(button);
        }
        return card;
    };
    
    const renderBoards = (boards) => {
      boardListContainer.innerHTML = '';
      const categorized = {};
      if(boards){
        boards.forEach(board => {
            const platformName = (board.platform && board.platform.name) ? board.platform.name : 'Other Boards';
            if (!categorized[platformName]) categorized[platformName] = [];
            categorized[platformName].push(board);
        });
        for (const platform in categorized) {
            const header = document.createElement('h4');
            header.textContent = platform;
            boardListContainer.appendChild(header);
            categorized[platform].forEach(board => {
                const card = createCard(board.name, `FQBN: ${board.fqbn}`);
                boardListContainer.appendChild(card);
            });
        }
      }
    };

    const renderInstalledCores = (cores) => {
        installedCoresList.innerHTML = ''; // BUG FIX: Corrected this line
        if(cores && cores.platforms){
          cores.platforms.forEach(core => {
              const content = `ID: ${core.id}, Version: ${core.version}`;
              installedCoresList.appendChild(createCard(core.name, content));
          });
        }
    };

    const populateBoardSelector = (boards) => {
        const currentFqbn = boardSelector.value;
        boardSelector.innerHTML = '<option value="">Select Board</option>';
        if(boards){
          boards.forEach(board => {
              const option = document.createElement('option');
              option.value = board.fqbn;
              option.textContent = board.name;
              boardSelector.appendChild(option);
          });
        }
        boardSelector.value = currentFqbn;
    };

    const renderLibrarySearchResults = (libs) => {
        librarySearchResults.innerHTML = '';
        if (libs) {
            libs.forEach(lib => {
                const card = createCard(lib.name, lib.description, () => installLibrary(lib.name));
                librarySearchResults.appendChild(card);
            });
        }
    };

    const renderInstalledLibraries = (libs) => {
        installedLibrariesList.innerHTML = '';
        if(libs && libs.libraries){
          libs.libraries.forEach(lib => {
              const library = lib.library;
              const content = `Version: ${library.version}, Author: ${library.author}`;
              installedLibrariesList.appendChild(createCard(library.name, content));
          });
        }
    };

    const renderExamples = (examples) => {
        exampleListContainer.innerHTML = '';
        if(examples){
          examples.forEach(ex => {
              const card = document.createElement('div');
              card.className = 'item-card';
              card.innerHTML = `<h5>${ex.name}</h5>`;
              card.onclick = () => loadExample(ex.code);
              exampleListContainer.appendChild(card);
          });
        }
    };

    // --- Initial Load ---
    const initialize = () => {
        document.body.classList.add('uninitialized');
        logToConsole('Welcome to the Arduino Web IDE! Initializing workspace...');
        codeEditor.setValue("// Your Arduino sketch goes here\nvoid setup() {\n  // put your setup code here, to run once:\n\n}\n\nvoid loop() {\n  // put your main code here, to run repeatedly:\n\n}");
        pollForInitialization();
    };

    initialize();
});
