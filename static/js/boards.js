(() => {
    const App = window.App;

    const dom = {
        installedCoresList: document.getElementById('installed-cores-list'),
    };

    async function getInstalledCores() {
        const data = await App.api.get('/api/cores/installed');
        dom.installedCoresList.innerHTML = '';
        if (data && data.platforms) {
            data.platforms.forEach(p => {
                const card = App.createCard(
                    p.maintainer,
                    `ID: ${p.id}\nVersion: ${p.installed_version}`
                );
                dom.installedCoresList.appendChild(card);
            });
        } else {
            App.logOutput('Could not load installed cores.', 'Boards');
        }
    }

    App.Boards.init = () => {
        // Get cores when the page is likely to be viewed.
        // This could also be tied to a "refresh" button.
        getInstalledCores();
    };

})();