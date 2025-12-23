import os
from flask import Flask, render_template, request, jsonify
from arduino_cli import ArduinoCLI

app = Flask(__name__)
# Instantiate the enhanced wrapper
cli = ArduinoCLI()

# Use a temporary directory for the sketch. This will be created on the
# local machine where the server is running.
SKETCH_PATH = os.path.join("/tmp", "arduino_ide_sketch", "sketch.ino")

# --- Main Application Route --- #

@app.route("/")
def index():
    """Serves the main HTML page of the UI."""
    return render_template("index.html")

# --- API Endpoints that wrap the ArduinoCLI class --- #

@app.route("/api/boards")
def get_boards():
    """Lists all installable boards and returns them as JSON."""
    # The wrapper now directly returns a dictionary/list from the JSON output
    return jsonify(cli.board_list_all())

@app.route("/api/cores/installed")
def get_installed_cores():
    """Lists all installed cores and returns them as JSON."""
    return jsonify(cli.core_list())

@app.route("/api/libraries/search")
def search_libraries():
    """Searches for a library by name and returns the results as JSON."""
    query = request.args.get("query")
    if not query:
        return jsonify({"error": True, "message": "A search query is required."}), 400
    return jsonify(cli.lib_search(query))

@app.route("/api/libraries/install", methods=['POST'])
def install_library():
    """Installs a library by name and returns the command output."""
    library_name = request.json.get("name")
    if not library_name:
        return jsonify({"error": True, "message": "Library name is required"}), 400
    # This command returns raw text output, wrapped in a JSON object by the wrapper
    return jsonify(cli.lib_install(library_name))

@app.route("/api/libraries/installed")
def get_installed_libraries():
    """Lists all installed libraries and returns them as JSON."""
    return jsonify(cli.list_libs())

@app.route("/api/sketch", methods=['POST'])
def save_sketch():
    """Saves the editor code to a temporary local file."""
    code = request.json.get("code")
    # Ensure the temporary directory exists on the local machine
    os.makedirs(os.path.dirname(SKETCH_PATH), exist_ok=True)
    with open(SKETCH_PATH, 'w', encoding='utf-8') as f:
        f.write(code)
    return jsonify({"success": True, "message": "Sketch saved locally for compilation."})

@app.route("/api/compile", methods=['POST'])
def compile_sketch():
    """Compiles the currently saved sketch for a given board."""
    fqbn = request.json.get("fqbn")
    if not fqbn:
        return jsonify({"error": True, "message": "A board (FQBN) is required."}), 400
    
    sketch_dir = os.path.dirname(SKETCH_PATH)
    # This command returns raw text output, wrapped in a JSON object
    return jsonify(cli.compile(fqbn, sketch_dir))

@app.route("/api/upload", methods=['POST'])
def upload_sketch():
    """Uploads the compiled sketch to a connected board via a specified port."""
    fqbn = request.json.get("fqbn")
    port = request.json.get("port")
    if not fqbn or not port:
        return jsonify({"error": True, "message": "Board (FQBN) and port are required for upload."}), 400
    
    sketch_dir = os.path.dirname(SKETCH_PATH)
    # This command returns raw text output, wrapped in a JSON object
    return jsonify(cli.upload(fqbn, sketch_dir, port))

# --- Placeholder Endpoints --- #

@app.route("/api/config/add-url", methods=['POST'])
def add_board_url():
    return jsonify({"message": "This functionality should be managed via your local arduino-cli config."}), 501

@app.route("/api/examples")
def get_examples():
     return jsonify({"message": "Example loading is not implemented in this version."}), 501

if __name__ == "__main__":
    # This will run the Flask server on your local machine
    print("Starting Arduino UI Wrapper Server...")
    print("Open http://127.0.0.1:8080 in your browser.")
    app.run(host='0.0.0.0', port=8080, debug=True)
