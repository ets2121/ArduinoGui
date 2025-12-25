// ======================================================================
// --- GLOBAL APP OBJECT & STATE ---
// This is created IMMEDIATELY when the script is loaded.
// It provides the namespace that other scripts will attach to.
// ======================================================================
window.App = {
    state: {
        sketchbookPath: null,
        currentSketch: null, 
        openFiles: {}, 
        activeFile: null, 
        selectedFqbn: null,
    },
    // API methods don't depend on the DOM, so they can be here.
    api: {
        get: (endpoint) => fetch(endpoint).then(res => res.json()),
        post: (endpoint, body) => fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(res => res.json()),
        put: (endpoint, body) => fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(res => res.json()),
        delete: (endpoint, body) => fetch(endpoint, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(res => res.json()),
    },
    // Namespaces for other modules to attach their functions to
    Sketch: {},
    Editor: {},
    Actions: {},
    Libraries: {},
    Boards: {},
};

// ======================================================================
// --- APPLICATION INITIALIZATION ---
// This runs AFTER the document is fully parsed and ready.
// ======================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Create a local reference to the global App object
    const App = window.App;

    // ======================================================================
    // --- DOM ELEMENT REFERENCES ---
    // ======================================================================
    const dom = {
        outputArea: document.getElementById('console-output'),
        navButtons: document.querySelectorAll('.nav-button'),
        pages: document.querySelectorAll('.page'),
    };

    // ======================================================================
    // --- SHARED UTILITIES (that need the DOM) ---
    // ======================================================================
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
        
        // Now we call the init functions that were attached by the other scripts
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

    // Kick off the application
    initializeApp();
});