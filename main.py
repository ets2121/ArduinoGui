import os
import json
from pathlib import Path
from flask import Flask, render_template, request, jsonify
from arduino_cli import ArduinoCLI

app = Flask(__name__)
cli = ArduinoCLI()

# --- Pathlib-based Path Management ---

SKETCHBOOK_PATH = None

def get_sketchbook_path():
    """Fetches, validates, and sets the global SKETCHBOOK_PATH."""
    global SKETCHBOOK_PATH

    # Try the specific config command first
    result = cli._execute(["config", "get", "directories.user"])
    if result and result.get("success") and result.get("output"):
        path_str = result.get("output").strip()
        path_obj = Path(path_str).resolve()
        if path_obj.is_dir():
            SKETCHBOOK_PATH = path_obj
            return # Success

    # Fallback to dumping the full config
    config = cli._execute(["config", "dump"], parse_json=True)
    if config and config.get('directories', {}).get('user'):
        path_str = config['directories']['user']
        path_obj = Path(path_str).resolve()
        if path_obj.is_dir():
            SKETCHBOOK_PATH = path_obj
            return # Success

# --- Initialize Sketchbook Path on Application Start ---
get_sketchbook_path()

def is_safe_path(path_to_check):
    """Ensures a given path is a safe child of the sketchbook path."""
    if not SKETCHBOOK_PATH or not path_to_check:
        return False
    try:
        resolve_path = Path(path_to_check).resolve()
        return SKETCHBOOK_PATH == resolve_path or SKETCHBOOK_PATH in resolve_path.parents
    except Exception:
        return False

# --- Main App and API Routes --- #

@app.route("/")
def index():
    return render_template("index.html")

# --- Sketchbook and Sketch Management ---

@app.route("/api/directories/sketchbook", methods=['GET'])
def get_sketchbook_directory():
    if SKETCHBOOK_PATH:
        return jsonify({"path": SKETCHBOOK_PATH.as_posix()})
    return jsonify({"error": True, "message": "Sketchbook path not configured or found."}), 500

@app.route("/api/sketches", methods=['GET'])
def list_sketches():
    sketch_data = cli.sketch_list()
    if sketch_data and 'sketchbooks' in sketch_data:
        for sketchbook in sketch_data.get('sketchbooks', []):
            for sketch in sketchbook.get('sketches', []):
                if 'path' in sketch:
                    sketch['path'] = Path(sketch['path']).as_posix()
    return jsonify(sketch_data)

@app.route("/api/sketches/new", methods=['POST'])
def new_sketch():
    sketch_name = request.json.get("name")
    if not sketch_name or not SKETCHBOOK_PATH:
        return jsonify({"error": True, "message": "Invalid name or sketchbook path."}), 400
    
    full_sketch_path = SKETCHBOOK_PATH / sketch_name
    result = cli.sketch_new(str(full_sketch_path))
    if result.get('success'):
        result['path'] = full_sketch_path.as_posix()
    return jsonify(result)

# --- File Management ---

@app.route("/api/sketch/files", methods=['GET'])
def list_sketch_files():
    sketch_path_str = request.args.get('path')
    if not is_safe_path(sketch_path_str):
        return jsonify({"error": True, "message": "Invalid or unsafe sketch path."}), 403
    try:
        sketch_path = Path(sketch_path_str)
        files = [f.name for f in sketch_path.iterdir() if f.is_file()]
        return jsonify({"files": files})
    except Exception as e:
        return jsonify({"error": True, "message": str(e)}), 500

@app.route("/api/sketch/file", methods=['POST', 'DELETE'])
def manage_file():
    file_path_str = request.json.get('path')
    if not is_safe_path(file_path_str):
        return jsonify({"error": True, "message": "Invalid or unsafe file path."}), 403

    file_path = Path(file_path_str)
    if request.method == 'POST': # Create
        try:
            file_path.write_text('// New file\n', encoding='utf-8')
            return jsonify({"success": True, "message": f"File created: {file_path.name}"})
        except Exception as e: return jsonify({"error": True, "message": str(e)}), 500
    elif request.method == 'DELETE': # Delete
        try:
            file_path.unlink()
            return jsonify({"success": True, "message": f"File deleted: {file_path.name}"})
        except Exception as e: return jsonify({"error": True, "message": str(e)}), 500

@app.route("/api/sketch/file/content", methods=['GET', 'PUT'])
def file_content():
    file_path_str = request.args.get('path') if request.method == 'GET' else request.json.get('path')
    if not is_safe_path(file_path_str):
        return jsonify({"error": True, "message": "Invalid file path."}), 403
    
    file_path = Path(file_path_str)
    try:
        if request.method == 'GET':
            return jsonify({"content": file_path.read_text(encoding='utf-8')})
        elif request.method == 'PUT':
            file_path.write_text(request.json.get('content', ''), encoding='utf-8')
            return jsonify({"success": True, "message": "File saved."})
    except Exception as e: return jsonify({"error": True, "message": str(e)}), 500

@app.route("/api/sketch/file/rename", methods=['POST'])
def rename_file():
    old_path_str = request.json.get('old_path')
    new_name = request.json.get('new_name')
    if not is_safe_path(old_path_str): return jsonify({"error": True, "message": "Invalid source path."}), 403
    
    old_path = Path(old_path_str)
    new_path = old_path.with_name(new_name)
    if not is_safe_path(new_path): return jsonify({"error": True, "message": "Invalid new file name."}), 403

    try:
        old_path.rename(new_path)
        return jsonify({"success": True, "message": f"Renamed to {new_name}"})
    except Exception as e: return jsonify({"error": True, "message": str(e)}), 500

# --- Compile and Upload ---

@app.route("/api/compile", methods=['POST'])
def compile_sketch():
    fqbn = request.json.get("fqbn")
    sketch_path_str = request.json.get("sketch_path")
    if not fqbn or not is_safe_path(sketch_path_str):
        return jsonify({"error": True, "message": "Board (FQBN) or sketch path are invalid."}), 400
    return jsonify(cli.compile(fqbn, sketch_path_str))

@app.route("/api/upload", methods=['POST'])
def upload_sketch():
    fqbn = request.json.get("fqbn")
    port = request.json.get("port")
    sketch_path_str = request.json.get("sketch_path")
    if not fqbn or not port or not is_safe_path(sketch_path_str):
        return jsonify({"error": True, "message": "Board, port, or sketch path are invalid."}), 400
    return jsonify(cli.upload(fqbn, sketch_path_str, port))

# --- Board and Core Management ---

@app.route("/api/boards")
def get_boards():
    return jsonify(cli.board_list_all())

@app.route("/api/cores/installed")
def get_installed_cores():
    return jsonify(cli.core_list())

# --- Library Management ---

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
    if SKETCHBOOK_PATH:
        print(f"--- Running in debug mode. Sketchbook: {SKETCHBOOK_PATH.as_posix()} ---")
        app.run(host='0.0.0.0', port=8080, debug=True)
    else:
        print("--- CRITICAL ERROR: Could not determine Arduino sketchbook path. ---")
        print("--- Please ensure 'arduino-cli' is installed and configured correctly. ---")
