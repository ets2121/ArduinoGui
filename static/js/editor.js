(() => {
    const App = window.App;

    let codeEditor;

    const dom = {
        fileList: document.getElementById('file-list'),
        fileTabs: document.getElementById('file-tabs'),
        codeEditorElement: document.getElementById('code-editor'),
        saveFileBtn: document.getElementById('save-file-button'),
        deleteFileBtn: document.getElementById('delete-file-button'),
        renameFileBtn: document.getElementById('rename-file-button'),
        newFileNameInput: document.getElementById('new-file-name'),
        createFileBtn: document.getElementById('create-file-button'),
    };

    function renderFileList() {
        dom.fileList.innerHTML = '';
        Object.keys(App.state.openFiles).forEach(filePath => {
            const fileName = filePath.split('/').pop();
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.textContent = fileName;
            fileItem.addEventListener('click', () => setActiveFile(filePath));
            dom.fileList.appendChild(fileItem);
        });
    }

    function renderFileTabs() {
        dom.fileTabs.innerHTML = '';
        Object.keys(App.state.openFiles).forEach(filePath => {
            const fileName = filePath.split('/').pop();
            const tab = document.createElement('div');
            tab.className = 'tab';
            tab.textContent = fileName;
            if (filePath === App.state.activeFile) tab.classList.add('active');
            tab.addEventListener('click', () => setActiveFile(filePath));
            dom.fileTabs.appendChild(tab);
        });
    }

    function setActiveFile(filePath) {
        if (!App.state.openFiles.hasOwnProperty(filePath) || App.state.activeFile === filePath) return;
        App.state.activeFile = filePath;
        codeEditor.setValue(App.state.openFiles[filePath]);
        renderFileTabs();
        App.logOutput(`Opened ${filePath.split('/').pop()}`, 'Editor');
    }

    async function openFile(filePath, makeActive = true) {
        const data = await App.api.get(`/api/sketch/file/content?path=${encodeURIComponent(filePath)}`);
        if (data.error) { App.logOutput(data); return; }
        App.state.openFiles[filePath] = data.content;
        if (makeActive) setActiveFile(filePath);
    }

    async function saveCurrentFile() {
        if (!App.state.activeFile) return;
        const content = codeEditor.getValue();
        if (content === App.state.openFiles[App.state.activeFile]) return; 

        App.logOutput(`Saving ${App.state.activeFile.split('/').pop()}...`, 'Editor');
        const result = await App.api.put('/api/sketch/file/content', { path: App.state.activeFile, content });
        App.logOutput(result);
        if (!result.error) App.state.openFiles[App.state.activeFile] = content;
    }

    async function createNewFile() {
        const fileName = dom.newFileNameInput.value;
        if (!fileName) { App.logOutput("Please enter a file name."); return; }
        const filePath = `${App.state.currentSketch.path}/${fileName}`;
        const result = await App.api.post('/api/sketch/file', { path: filePath });
        App.logOutput(result);
        if (!result.error) {
            await openFile(filePath, true);
            renderFileList();
        }
    }

    async function deleteCurrentFile() {
        if (!App.state.activeFile) { App.logOutput('No active file selected.'); return; }
        const fileName = App.state.activeFile.split('/').pop();
        if (!confirm(`Are you sure you want to delete ${fileName}?`)) return;

        const result = await App.api.delete('/api/sketch/file', { path: App.state.activeFile });
        App.logOutput(result);

        if (!result.error) {
            const deletedPath = App.state.activeFile;
            delete App.state.openFiles[deletedPath];
            App.state.activeFile = null;
            codeEditor.setValue('');

            renderFileList();
            const remainingFiles = Object.keys(App.state.openFiles);
            if (remainingFiles.length > 0) {
                setActiveFile(remainingFiles[0]);
            } else {
                renderFileTabs(); // Clear the tabs if no files are left
            }
        }
    }

    async function renameCurrentFile() {
        if (!App.state.activeFile) { App.logOutput('No active file selected.'); return; }
        const oldPath = App.state.activeFile;
        const oldName = oldPath.split('/').pop();
        const newName = prompt("Enter new name for the file:", oldName);

        if (!newName || newName === oldName) { App.logOutput("Rename cancelled."); return; }

        const result = await App.api.post('/api/sketch/file/rename', { old_path: oldPath, new_name: newName });
        App.logOutput(result);

        if (!result.error) {
            const newPath = oldPath.substring(0, oldPath.lastIndexOf('/') + 1) + newName;
            App.state.openFiles[newPath] = App.state.openFiles[oldPath];
            delete App.state.openFiles[oldPath];
            App.state.activeFile = newPath;
            renderFileList();
            renderFileTabs();
            setActiveFile(newPath);
        }
    }

    App.Editor.loadAllFiles = async (sketchPath) => {
        const data = await App.api.get(`/api/sketch/files?path=${encodeURIComponent(sketchPath)}`);
        if (data.error) { App.logOutput(data); return; }

        for (const fileName of data.files) {
            const filePath = `${sketchPath}/${fileName}`;
            await openFile(filePath, false); // open without making it active yet
        }

        if (data.files.length > 0) {
            const firstFilePath = `${sketchPath}/${data.files[0]}`;
            setActiveFile(firstFilePath);
        }

        renderFileList();
    };

    App.Editor.init = () => {
        codeEditor = CodeMirror.fromTextArea(dom.codeEditorElement, { lineNumbers: true, mode: 'text/x-c++src', theme: 'monokai' });
        dom.createFileBtn.addEventListener('click', createNewFile);
        dom.saveFileBtn.addEventListener('click', saveCurrentFile);
        dom.deleteFileBtn.addEventListener('click', deleteCurrentFile);
        dom.renameFileBtn.addEventListener('click', renameCurrentFile);
    };

})();