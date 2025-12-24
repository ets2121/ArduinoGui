import subprocess
import json

class ArduinoCLI:
    """
    Python wrapper for Arduino CLI to manage libraries, boards, cores, compile,
    upload sketches, and export binaries. This version is enhanced to handle
    JSON output for better integration with web UIs.
    """

    def __init__(self, cli_path="arduino-cli"):
        self.cli = cli_path

    def _execute(self, command, parse_json=False):
        """Internal method to execute arduino-cli commands."""
        base_cmd = [self.cli] + command
        if parse_json:
            # Add the format flag for all commands, not just list/search
            base_cmd.append("--format=json")

        try:
            result = subprocess.run(base_cmd, capture_output=True, text=True, check=True, encoding='utf-8')
            
            if parse_json:
                if not result.stdout.strip():
                    # Return an empty dict for commands that might have no output
                    return {}
                return json.loads(result.stdout)
            return {"success": True, "output": result.stdout + result.stderr}
        except subprocess.CalledProcessError as e:
            # If the command fails but produces JSON error output, parse it.
            try:
                return json.loads(e.stderr)
            except json.JSONDecodeError:
                return {"error": True, "message": e.stderr or e.stdout}
        except json.JSONDecodeError as e:
            return {"error": True, "message": f"Failed to parse JSON: {e}"}
        except FileNotFoundError:
            return {"error": True, "message": f"The command '{self.cli}' was not found. Please ensure arduino-cli is installed and in your system's PATH."}

    # =================== Sketch Management (JSON) ===================

    def sketch_list(self):
        return self._execute(["sketch", "list"], parse_json=True)
    
    def sketch_new(self, name):
        # The `new` command doesn't support JSON output, so we handle its text.
        return self._execute(["sketch", "new", name])

    # =================== Core & Board Management (JSON) ===================

    def core_list(self):
        return self._execute(["core", "list"], parse_json=True)

    def board_list_all(self):
        return self._execute(["board", "listall"], parse_json=True)

    def board_list_connected(self):
        return self._execute(["board", "list"], parse_json=True)

    # =================== Library Management (JSON) ===================

    def lib_search(self, name):
        return self._execute(["lib", "search", name], parse_json=True)

    def list_libs(self):
        return self._execute(["lib", "list"], parse_json=True)

    # =================== Installation & Execution ===================

    def core_update_index(self):
        return self._execute(["core", "update-index"])

    def lib_install(self, name):
        return self._execute(["lib", "install", name])

    def compile(self, fqbn, sketch_path):
        # Compile now requires the full path to the sketch directory
        return self._execute(["compile", "--fqbn", fqbn, sketch_path])

    def upload(self, fqbn, sketch_path, port):
        # Upload also requires the full path
        return self._execute(["upload", "-p", port, "--fqbn", fqbn, sketch_path])
