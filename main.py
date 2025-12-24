import os
import json
from flask import Flask, render_template, request, jsonify
from arduino_cli import ArduinoCLI

app = Flask(__name__)
cli = ArduinoCLI()

# --- Helper function to get the user's sketchbook path --- #

def get_sketchbook_path():
    """Fetches the sketchbook path from the arduino-cli config."""
    # arduino-cli config dump returns a JSON with the sketchbook path
    config = cli._execute(["config", "dump"], parse_json=True)
    if config and config.get('directories') and config.get('directories').get('user'):
        return config['directories']['user']
    return None

SKETCHBOOK_PATH = get_sketchbook_path()

# --- Security Helper ---
def is_safe_path(path):
    """Ensure the path is within the sketchbook to prevent directory traversal."""
    if not SKETCHBOOK_PATH:
        return False
    # Resolve the absolute path and check if it's within the sketchbook directory
    abs_path = os.path.abspath(path)
    return abs_path.startswith(os.path.abspath(SKETCHBOOK_PATH))

# --- Main Application Route --- #

@app.route("/")
def index():
    return render_template("index.html")

# ======================================================================
# --- NEW: Sketch and File Management APIs ---
# ======================================================================

# --- Sketch APIs ---

@app.route("/api/sketches", methods=['GET'])
def list_sketches():
    """Lists all sketches found by arduino-cli."""
    return jsonify(cli.sketch_list())

@app.route("/api/sketches/new", methods=['POST'])
def new_sketch():
    """Creates a new sketch using arduino-cli."""
    sketch_name = request.json.get("name")
    if not sketch_name:
        return jsonify({"error": True, "message": "Sketch name is required."}), 400
    return jsonify(cli.sketch_new(sketch_name))

# --- File APIs ---

@app.route("/api/sketch/files", methods=['GET'])
def list_sketch_files():
    """Lists all files in a specific sketch directory."""
    sketch_path = request.args.get('path')
    if not is_safe_path(sketch_path):
        return jsonify({"error": True, "message": "Invalid or unsafe sketch path."}), 403
    
    try:
        files = [f for f in os.listdir(sketch_path) if os.path.isfile(os.path.join(sketch_path, f))]
        return jsonify({"files": files})
    except OSError as e:
        return jsonify({"error": True, "message": str(e)}), 500

@app.route("/api/sketch/file", methods=['POST', 'DELETE'])
def manage_file():
    """Create or delete a file within a sketch."""
    file_path = request.json.get('path')
    if not is_safe_path(file_path):
        return jsonify({"error": True, "message": "Invalid or unsafe file path."}), 403

    if request.method == 'POST': // Create
        try:
            with open(file_path, 'w') as f: # Create an empty file
                f.write('// New file\n')
            return jsonify({"success": True, "message": f"File created: {os.path.basename(file_path)}"})
        except OSError as e:
            return jsonify({"error": True, "message": str(e)}), 500

    elif request.method == 'DELETE': // Delete
        try:
            os.remove(file_path)
            return jsonify({"success": True, "message": f"File deleted: {os.path.basename(file_path)}"})
        except OSError as e:
            return jsonify({"error": True, "message": str(e)}), 500

@app.route("/api/sketch/file/content", methods=['GET', 'PUT'])
def file_content():
    """Read or update the content of a specific file."""
    file_path = request.args.get('path') if request.method == 'GET' else request.json.get('path')
    if not is_safe_path(file_path):
        return jsonify({"error": True, "message": "Invalid or unsafe file path."}), 403
    
    if request.method == 'GET':
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return jsonify({"content": content})
        except OSError as e:
            return jsonify({"error": True, "message": str(e)}), 500

    elif request.method == 'PUT': // Save/Update
        content = request.json.get('content', '')
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return jsonify({"success": True, "message": "File saved."})
        except OSError as e:
            return jsonify({"error": True, "message": str(e)}), 500

@app.route("/api/sketch/file/rename", methods=['POST'])
def rename_file():
    old_path = request.json.get('old_path')
    new_name = request.json.get('new_name')
    if not is_safe_path(old_path):
        return jsonify({"error": True, "message": "Invalid or unsafe source path."}), 403

    new_path = os.path.join(os.path.dirname(old_path), new_name)
    if not is_safe_path(new_path): # Also check the destination
        return jsonify({"error": True, "message": "Invalid new file name."}), 403

    try:
        os.rename(old_path, new_path)
        return jsonify({"success": True, "message": f"Renamed to {new_name}"})
    except OSError as e:
        return jsonify({"error": True, "message": str(e)}), 500


# ======================================================================
# --- Core Functionality APIs (Updated) ---
# ======================================================================

@app.route("/api/compile", methods=['POST'])
def compile_sketch():
    fqbn = request.json.get("fqbn")
    sketch_path = request.json.get("sketch_path") # Path to sketch dir
    if not fqbn or not sketch_path:
        return jsonify({"error": True, "message": "Board (FQBN) and sketch path are required."}), 400
    if not is_safe_path(sketch_path):
        return jsonify({"error": True, "message": "Invalid sketch path."}), 403
    
    return jsonify(cli.compile(fqbn, sketch_path))

@app.route("/api/upload", methods=['POST'])
def upload_sketch():
    fqbn = request.json.get("fqbn")
    port = request.json.get("port")
    sketch_path = request.json.get("sketch_path")
    if not fqbn or not port or not sketch_path:
        return jsonify({"error": True, "message": "Board, port, and sketch path are required."}), 400
    if not is_safe_path(sketch_path):
        return jsonify({"error": True, "message": "Invalid sketch path."}), 403

    return jsonify(cli.upload(fqbn, sketch_path, port))

# ======================================================================
# --- Existing Library and Board APIs (Unchanged) ---
# ======================================================================

@app.route("/api/boards")
def get_boards():
    return jsonify(cli.board_list_all())

@app.route("/api/cores/installed")
def get_installed_cores():
    return jsonify(cli.core_list())

@app.route("/api/libraries/search")
def search_libraries():
    query = request.args.get("query")
    if not query:
        return jsonify({"error": True, "message": "A search query is required."}), 400
    return jsonify(cli.lib_search(query))

@app.route("/api/libraries/install", methods=['POST'])
def install_library():
    library_name = request.json.get("name")
    if not library_name:
        return jsonify({"error": True, "message": "Library name is required"}), 400
    return jsonify(cli.lib_install(library_name))

@app.route("/api/libraries/installed")
def get_installed_libraries():
    return jsonify(cli.list_libs())

if __name__ == "__main__":
    if not SKETCHBOOK_PATH:
        print("CRITICAL ERROR: Could not determine Arduino sketchbook path.")
        print("Please ensure 'arduino-cli' is configured correctly.")
    else:
        print(f"Using sketchbook path: {SKETCHBOOK_PATH}")
        print("Starting Arduino UI Wrapper Server...")
        app.run(host='0.0.0.0', port=8080, debug=True)
