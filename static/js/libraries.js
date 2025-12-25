(() => {
    const App = window.App;

    const dom = {
        librarySearchInput: document.getElementById('library-search-input'),
        librarySearchBtn: document.getElementById('library-search-button'),
        librarySearchResults: document.getElementById('library-search-results'),
        installedLibrariesList: document.getElementById('installed-libraries-list'),
    };

    async function searchLibraries() {
        const query = dom.librarySearchInput.value;
        if (!query) return;

        App.logOutput(`Searching for "${query}"...`, 'Library');
        const data = await App.api.get(`/api/libraries/search?query=${encodeURIComponent(query)}`);
        dom.librarySearchResults.innerHTML = '';

        if (data.libraries) {
            data.libraries.forEach(lib => {
                // Correctly access the properties based on the user-provided JSON structure
                const card = App.createCard(
                    lib.name, 
                    lib.latest.sentence, 
                    () => installLibrary(lib.name)
                );
                dom.librarySearchResults.appendChild(card);
            });
        } else {
            App.logOutput('No libraries found or an error occurred.', 'Library');
        }
    }

    async function installLibrary(name) {
        App.logOutput(`Installing ${name}...`, 'Library');
        const result = await App.api.post('/api/libraries/install', { name });
        App.logOutput(result, 'Library');
        getInstalledLibraries(); // Refresh the list after installing
    }

    async function getInstalledLibraries() {
        const data = await App.api.get('/api/libraries/installed');
        dom.installedLibrariesList.innerHTML = '';
        // This assumes a different structure for installed libraries, which is common.
        if (data.installed_libraries) {
            data.installed_libraries.forEach(lib => {
                const l = lib.library;
                const card = App.createCard(
                    l.name, 
                    `Author: ${l.author}\nVersion: ${l.version}\n\n${l.paragraph}`
                );
                dom.installedLibrariesList.appendChild(card);
            });
        }
    }

    App.Libraries.init = () => {
        dom.librarySearchBtn.addEventListener('click', searchLibraries);
        // Fetch initial list when the module is loaded
        getInstalledLibraries(); 
    };

})();