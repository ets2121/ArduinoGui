import os
import json
from pathlib import Path
from flask import Flask, render_template, request, jsonify
from arduino_cli import ArduinoCLI

app = Flask(__name__)
cli = ArduinoCLI()

# --- Pathlib-based Path Management --- #

SKETCHBOOK_PATH = None

def get_sketchbook_path():
    """Fetches and validates the sketchbook path using pathlib."""
    global SKETCHBOOK_PATH
    if SKETCHBOOK_PATH:
        return SKETCHBOOK_PATH

    result = cli._execute(["config", "get", "directories.user"])
    if result and result.get("success") and result.get("output"):
        path_str = result.get("output").strip()
        path_obj = Path(path_str).resolve()
        if path_obj.is_dir():
            SKETCHBOOK_PATH = path_obj
            return SKETCHBOOK_PATH
    
    # Fallback if the specific command fails
    config = cli._execute(["config", "dump"], parse_json=True)
    if config and config.get('directories', {}).get('user'):
        path_str = config['directories']['user']
        path_obj = Path(path_str).resolve()
        if path_obj.is_dir():
            SKETCHBOOK_PATH = path_obj
            return SKETCHBOOK_PATH
    return None

def is_safe_path(path_to_check):
    """Ensures a given path is a safe child of the sketchbook path."""
    if not SKETCHBOOK_PATH:
        return False
    try:
        # Resolve the path to its absolute form and check if it's within the sketchbook
        resolve_path = Path(path_to_check).resolve()
        return SKETCHBOOK_PATH in resolve_path.parents or SKETCHBOOK_PATH == resolve_path
    except Exception:
        return False

# --- API Routes --- #

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/directories/sketchbook", methods=['GET'])
def get_sketchbook_directory():
    if SKETCHBOOK_PATH:
        return jsonify({"path": SKETCHBOOK_PATH.as_posix()})
    return jsonify({"error": True, "message": "Sketchbook path not configured."}), 500

@app.route("/api/sketches", methods=['GET'])
def list_sketches():
    """Lists sketches, normalizing paths with pathlib."""
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
    if not is_safe_path(full_sketch_path):
        return jsonify({"error": True, "message": "Invalid sketch name; path is outside sketchbook."}), 400

    result = cli.sketch_new(str(full_sketch_path))
    if result.get('success'):
        result['path'] = full_sketch_path.as_posix()
    return jsonify(result)

@app.route("/api/sketch/files", methods=['GET'])
def list_sketch_files():
    sketch_path_str = request.args.get('path')
    if not is_safe_path(sketch_path_str):
        return jsonify({"error": True, "message": "Invalid sketch path."}), 403
    try:
        sketch_path = Path(sketch_path_str)
        files = [f.name for f in sketch_path.iterdir() if f.is_file()]
        return jsonify({"files": files})
    except Exception as e:
        return jsonify({"error": True, "message": str(e)}), 500

@app.route("/api/sketch/file/content", methods=['GET', 'PUT'])
def file_content():
    file_path_str = request.args.get('path') if request.method == 'GET' else request.json.get('path')
    if not is_safe_path(file_path_str):
        return jsonify({"error": True, "message": "Invalid file path."}), 403
    
    file_path = Path(file_path_str)
    try:
        if request.method == 'GET':
            content = file_path.read_text(encoding='utf-8')
            return jsonify({"content": content})
        elif request.method == 'PUT':
            file_path.write_text(request.json.get('content', ''), encoding='utf-8')
            return jsonify({"success": True, "message": "File saved."})
    except Exception as e:
        return jsonify({"error": True, "message": str(e)}), 500

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

# --- Other routes (delete, rename, libraries, etc.) would also use pathlib for robustness ---
# This is a simplified example focusing on the core path issues.

if __name__ == "__main__":
    if get_sketchbook_path():
        print(f"Using sketchbook path: {SKETCHBOOK_PATH.as_posix()}")
        app.run(host='0.0.0.0', port=8080, debug=True)
    else:
        print("CRITICAL ERROR: Could not determine Arduino sketchbook path.")
