import os
import json
from flask import Flask, render_template, request, jsonify
from arduino_cli import ArduinoCLI

app = Flask(__name__)
cli = ArduinoCLI()

# --- Helper function to get the user's sketchbook path --- #

def get_sketchbook_path():
    """Fetches the sketchbook path directly from the arduino-cli config.""""
    result = cli._execute(["config", "get", "directories.user"])
    if result and result.get("success") and result.get("output"):
        return result.get("output").strip().replace(os.sep, '/') # Normalize to forward slashes
    # Fallback
    config = cli._execute(["config", "dump"], parse_json=True)
    if config and config.get('directories') and config.get('directories').get('user'):
        return config['directories']['user'].replace(os.sep, '/') # Normalize
    return None

SKETCHBOOK_PATH = get_sketchbook_path()

# --- Security Helper ---
def is_safe_path(path):
    """Ensure the path is within the sketchbook to prevent directory traversal."""
    if not SKETCHBOOK_PATH:
        return False
    # Normalize incoming path for comparison
    normalized_path = os.path.abspath(path.replace('/', os.sep))
    return normalized_path.startswith(os.path.abspath(SKETCHBOOK_PATH))

# --- Main Application Route --- #

@app.route("/")
def index():
    return render_template("index.html")

# ======================================================================
# --- NEW: Sketch and File Management APIs ---
# ======================================================================

@app.route("/api/directories/sketchbook", methods=['GET'])
def get_sketchbook_directory():
    if SKETCHBOOK_PATH:
        return jsonify({"path": SKETCHBOOK_PATH})
    else:
        return jsonify({"error": True, "message": "Sketchbook path not configured."}), 500

# --- Sketch APIs ---

@app.route("/api/sketches", methods=['GET'])
def list_sketches():
    """Lists all sketches, ensuring their paths use forward slashes."""
    sketch_data = cli.sketch_list()
    if sketch_data and 'sketchbooks' in sketch_data:
        for sketchbook in sketch_data['sketchbooks']:
            if 'sketches' in sketchbook:
                for sketch in sketchbook['sketches']:
                    if 'path' in sketch:
                        sketch['path'] = sketch['path'].replace(os.sep, '/')
    return jsonify(sketch_data)

@app.route("/api/sketches/new", methods=['POST'])
def new_sketch():
    """Creates a new sketch and returns its path with forward slashes."""
    sketch_name = request.json.get("name")
    if not sketch_name or not SKETCHBOOK_PATH:
        return jsonify({"error": True, "message": "Invalid name or sketchbook path."}), 400

    full_sketch_path = os.path.join(SKETCHBOOK_PATH, sketch_name)
    if not is_safe_path(full_sketch_path):
        return jsonify({"error": True, "message": "Invalid sketch name or path."}), 400

    # Use the OS-specific path for the command, but normalize the output for the frontend
    result = cli.sketch_new(full_sketch_path.replace('/', os.sep))
    if result.get('output'):
        result['output'] = result['output'].strip().replace(os.sep, '/')
    
    # The command on success returns the path in 'output', let's also add it to a 'path' field
    if result.get('success') and result.get('output'):
        result['path'] = result['output']

    return jsonify(result)

# --- File APIs (Path handling relies on is_safe_path) ---

@app.route("/api/sketch/files", methods=['GET'])
def list_sketch_files():
    sketch_path = request.args.get('path')
    if not is_safe_path(sketch_path):
        return jsonify({"error": True, "message": "Invalid or unsafe sketch path."}), 403
    
    try:
        # Convert to OS-specific path for file system operations
        os_path = sketch_path.replace('/', os.sep)
        files = [f for f in os.listdir(os_path) if os.path.isfile(os.path.join(os_path, f))]
        return jsonify({"files": files})
    except OSError as e:
        return jsonify({"error": True, "message": str(e)}), 500

@app.route("/api/sketch/file/content", methods=['GET', 'PUT'])
def file_content():
    file_path = request.args.get('path') if request.method == 'GET' else request.json.get('path')
    if not is_safe_path(file_path):
        return jsonify({"error": True, "message": "Invalid file path."}), 403
    
    os_path = file_path.replace('/', os.sep)
    if request.method == 'GET':
        try:
            with open(os_path, 'r', encoding='utf-8') as f:
                return jsonify({"content": f.read()})
        except OSError as e:
            return jsonify({"error": True, "message": str(e)}), 500
    elif request.method == 'PUT':
        try:
            with open(os_path, 'w', encoding='utf-8') as f:
                f.write(request.json.get('content', ''))
            return jsonify({"success": True, "message": "File saved."})
        except OSError as e:
            return jsonify({"error": True, "message": str(e)}), 500

# Other file management routes (delete, rename, create) are similar
@app.route("/api/sketch/file", methods=['POST', 'DELETE'])
def manage_file():
    file_path = request.json.get('path')
    if not is_safe_path(file_path):
        return jsonify({"error": True, "message": "Invalid or unsafe file path."}), 403
    os_path = file_path.replace('/', os.sep)
    if request.method == 'POST':
        try:
            with open(os_path, 'w') as f: f.write('// New file\n')
            return jsonify({"success": True, "message": f"File created: {os.path.basename(os_path)}"})
        except OSError as e: return jsonify({"error": True, "message": str(e)}), 500
    elif request.method == 'DELETE':
        try:
            os.remove(os_path)
            return jsonify({"success": True, "message": f"File deleted: {os.path.basename(os_path)}"})
        except OSError as e: return jsonify({"error": True, "message": str(e)}), 500

@app.route("/api/sketch/file/rename", methods=['POST'])
def rename_file():
    old_path = request.json.get('old_path')
    new_name = request.json.get('new_name')
    if not is_safe_path(old_path): return jsonify({"error": True, "message": "Unsafe source path."}), 403
    new_path = os.path.join(os.path.dirname(old_path), new_name).replace(os.sep, '/')
    if not is_safe_path(new_path): return jsonify({"error": True, "message": "Unsafe new name."}), 403
    try:
        os.rename(old_path.replace('/', os.sep), new_path.replace('/', os.sep))
        return jsonify({"success": True, "message": f"Renamed to {new_name}"})
    except OSError as e: return jsonify({"error": True, "message": str(e)}), 500

# --- Compile and Upload --- #
@app.route("/api/compile", methods=['POST'])
def compile_sketch():
    fqbn = request.json.get("fqbn")
    sketch_path = request.json.get("sketch_path")
    if not fqbn or not sketch_path or not is_safe_path(sketch_path):
        return jsonify({"error": True, "message": "Board (FQBN) or sketch path are invalid."}), 400
    return jsonify(cli.compile(fqbn, sketch_path.replace('/', os.sep)))

@app.route("/api/upload", methods=['POST'])
def upload_sketch():
    fqbn = request.json.get("fqbn")
    port = request.json.get("port")
    sketch_path = request.json.get("sketch_path")
    if not fqbn or not port or not sketch_path or not is_safe_path(sketch_path):
        return jsonify({"error": True, "message": "Board, port, or sketch path are invalid."}), 400
    return jsonify(cli.upload(fqbn, sketch_path.replace('/', os.sep), port))


# --- Library and Board APIs (Unchanged) ---
@app.route("/api/boards")
def get_boards(): return jsonify(cli.board_list_all())

@app.route("/api/cores/installed")
def get_installed_cores(): return jsonify(cli.core_list())

@app.route("/api/libraries/search")
def search_libraries():
    query = request.args.get("query")
    if not query: return jsonify({"error": True, "message": "A search query is required."}), 400
    return jsonify(cli.lib_search(query))

@app.route("/api/libraries/install", methods=['POST'])
def install_library():
    library_name = request.json.get("name")
    if not library_name: return jsonify({"error": True, "message": "Library name is required"}), 400
    return jsonify(cli.lib_install(library_name))

@app.route("/api/libraries/installed")
def get_installed_libraries(): return jsonify(cli.list_libs())

if __name__ == "__main__":
    if not SKETCHBOOK_PATH:
        print("CRITICAL ERROR: Could not determine Arduino sketchbook path.")
    else:
        print(f"Using sketchbook path: {SKETCHBOOK_PATH}")
        app.run(host='0.0.0.0', port=8080, debug=True)
