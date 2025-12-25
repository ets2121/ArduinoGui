document.addEventListener('DOMContentLoaded', () => {
    // ======================================================================
    // --- GLOBAL APP OBJECT & STATE ---
    // ======================================================================
    window.App = {
        state: {
            sketchbookPath: null,
            currentSketch: null, 
            openFiles: {}, 
            activeFile: null, 
            selectedFqbn: null,
        },
        // Namespaces for other modules to attach to
        Sketch: {},
        Editor: {},
        Actions: {},
        Libraries: {},
        Boards: {},
    };

    // ======================================================================
    // --- DOM ELEMENT REFERENCES ---
    // ======================================================================
    // We will pass these to the modules that need them
    const dom = {
        outputArea: document.getElementById('console-output'),
        navButtons: document.querySelectorAll('.nav-button'),
        pages: document.querySelectorAll('.page'),
    };

    // ======================================================================
    // --- SHARED UTILITIES ---
    // ======================================================================
    App.api = {
        get: (endpoint) => fetch(endpoint).then(res => res.json()),
        post: (endpoint, body) => fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(res => res.json()),
        put: (endpoint, body) => fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(res => res.json()),
        delete: (endpoint, body) => fetch(endpoint, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(res => res.json()),
    };

    App.logOutput = (data, prefix = '') => {
        const outputArea = dom.outputArea;
        let message = (typeof data === 'object' && data !== null) ? (data.error ? `Error: ${data.message}` : (data.output || data.message || JSON.stringify(data, null, 2))) : data;
        outputArea.textContent += (prefix ? `[${prefix}] ` : '') + message + '\n';
        outputArea.scrollTop = outputArea.scrollHeight;
    };

    App.createCard = (title, content, onClick) => {
        const card = document.createElement('div');
        card.className = 'card';
        const titleEl = document.createElement('h3');
        titleEl.textContent = title;
        card.appendChild(titleEl);
        if (content) { const contentEl = document.createElement('pre'); contentEl.textContent = content; card.appendChild(contentEl); }
        if (onClick) { card.classList.add('clickable'); card.addEventListener('click', onClick); }
        return card;
    };

    // ======================================================================
    // --- NAVIGATION ---
    // ======================================================================
    function setupNavigation() {
        dom.navButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetPageId = 'page-' + button.getAttribute('data-page');
                dom.pages.forEach(page => page.classList.remove('active'));
                document.getElementById(targetPageId).classList.add('active');
                dom.navButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
            });
        });
    }

    // ======================================================================
    // --- INITIALIZATION ---
    // ======================================================================
    async function initializeApp() {
        App.logOutput("Initializing application...");
        setupNavigation();
        
        // Initialize all the modules
        App.Sketch.init();
        App.Editor.init();
        App.Actions.init();
        App.Libraries.init();
        App.Boards.init();

        const dirData = await App.api.get('/api/directories/sketchbook');
        if (dirData.path) {
            App.state.sketchbookPath = dirData.path;
            App.logOutput(`Using sketchbook: ${App.state.sketchbookPath}`, 'Config');
        } else {
            App.logOutput(dirData);
        }

        // The Sketch module will now take over to show the modal
        await App.Sketch.populateSketches();
        App.logOutput("Ready. Please select or create a sketch.");
    }

    initializeApp();
});