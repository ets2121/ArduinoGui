
import subprocess
import os
import json
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

# --- Corrected Paths ---
# Use workspace-relative paths to ensure they are always correct.
CWD = os.getcwd()
ARDUINO_CLI_PATH = os.path.join(CWD, ".arduino-data/bin/arduino-cli")
ARDUINO_DATA_PATH = os.path.join(CWD, ".arduino-data")
ARDUINO_CONFIG_PATH = os.path.join(ARDUINO_DATA_PATH, "arduino-cli.yaml")
SKETCH_PATH = "/tmp/temp_sketch/temp_sketch.ino"
SUCCESS_FLAG_PATH = os.path.join(ARDUINO_DATA_PATH, "setup.success")

@app.before_request
def check_initialization():
    """Checks if the workspace setup is complete before handling API requests."""
    if request.path == '/' or request.path.startswith('/static'):
        return

    if request.path.startswith('/api/'):
        if not os.path.exists(SUCCESS_FLAG_PATH):
            return jsonify({
                "error": "initializing",
                "message": "The environment is still being configured. Please wait a moment and try again."
            }), 503

def run_arduino_command(command, parse_json=False):
    """Runs a given arduino-cli command using explicit, correct paths."""
    try:
        env = os.environ.copy()
        # The .venv is activated by devserver.sh, so we don't need to modify the PATH here.
        
        base_cmd = f'{ARDUINO_CLI_PATH} --config-file {ARDUINO_CONFIG_PATH} --data-dir {ARDUINO_DATA_PATH}'
        full_command = f'{base_cmd} {command} --format json'

        result = subprocess.run(
            full_command,
            shell=True,
            capture_output=True,
            text=True,
            check=True,
            env=env
        )

        if parse_json:
            # Handle empty output for list commands
            if not result.stdout.strip():
                if 'list' in command or 'search' in command:
                    return []
                return {}
            return json.loads(result.stdout)
        return {"success": True, "output": result.stdout + result.stderr}

    except subprocess.CalledProcessError as e:
        error_message = e.stderr or e.stdout
        if parse_json:
            try:
                return json.loads(error_message)
            except json.JSONDecodeError:
                return {"error": error_message}
        return {"success": False, "error": error_message}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.route("/")
def index():
    return render_template("index.html")

# --- API Endpoints (Unchanged) ---

@app.route("/api/boards")
def get_boards():
    return jsonify(run_arduino_command("board listall", parse_json=True))

@app.route("/api/cores/installed")
def get_installed_cores():
    return jsonify(run_arduino_command("core list", parse_json=True))

@app.route("/api/config/add-url", methods=['POST'])
def add_board_url():
    url = request.json.get("url")
    if not url:
        return jsonify({"error": "URL is required"}), 400
    
    current_config = run_arduino_command("config dump", parse_json=True)
    urls = (current_config.get('board-manager', {}).get('additional_urls', [])) or []
    if url not in urls:
        urls.append(url)

    urls_str = ' '.join(f'--additional-urls \"{u}\"' for u in urls)
    run_arduino_command(f"config set {urls_str}")
    
    return jsonify(run_arduino_command("core update-index"))

@app.route("/api/libraries/search")
def search_libraries():
    query = request.args.get("query")
    if not query:
        return jsonify({"error": "A search query is required."}), 400
    return jsonify(run_arduino_command(f"lib search \"{query}\"", parse_json=True))

@app.route("/api/libraries/install", methods=['POST'])
def install_library():
    library_name = request.json.get("name")
    if not library_name:
        return jsonify({"error": "Library name is required"}), 400
    return jsonify(run_arduino_command(f'lib install \"{library_name}\"'))

@app.route("/api/libraries/installed")
def get_installed_libraries():
    return jsonify(run_arduino_command("lib list", parse_json=True))

@app.route("/api/examples")
def get_examples():
    return jsonify(run_arduino_command("lib examples", parse_json=True))

@app.route("/api/sketch", methods=['POST'])
def save_sketch():
    code = request.json.get("code")
    os.makedirs(os.path.dirname(SKETCH_PATH), exist_ok=True)
    with open(SKETCH_PATH, 'w') as f:
        f.write(code)
    return jsonify({"success": True, "message": "Sketch saved"})

@app.route("/api/compile", methods=['POST'])
def compile_sketch():
    fqbn = request.json.get("fqbn")
    if not fqbn:
        return jsonify({"error": "A board (FQBN) is required for compilation."}), 400
    return jsonify(run_arduino_command(f"compile --fqbn {fqbn} {os.path.dirname(SKETCH_PATH)}"))

@app.route("/api/upload", methods=['POST'])
def upload_sketch():
    fqbn = request.json.get("fqbn")
    if not fqbn:
        return jsonify({"error": "A board (FQBN) is required for upload."}), 400
    return jsonify(run_arduino_command(f"upload -p /dev/ttyACM0 --fqbn {fqbn} {os.path.dirname(SKETCH_PATH)}"))

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=8080, debug=True)
