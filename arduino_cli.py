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
            base_cmd.append("--format=json")

        try:
            # Set encoding to utf-8 to handle any special characters
            result = subprocess.run(base_cmd, capture_output=True, text=True, check=True, encoding='utf-8')
            
            if parse_json:
                # If the output is empty, return an empty list or dict to avoid errors
                if not result.stdout.strip():
                    return [] if 'list' in command or 'search' in command else {}
                return json.loads(result.stdout)
            # Return raw output if not parsing JSON (e.g., for compile/upload)
            return {"success": True, "output": result.stdout + result.stderr}
        except subprocess.CalledProcessError as e:
            # Return a structured error if the command fails
            return {"error": True, "message": e.stderr or e.stdout}
        except json.JSONDecodeError as e:
            return {"error": True, "message": f"Failed to parse JSON: {e}"}
        except FileNotFoundError:
            return {"error": True, "message": f"The command '{self.cli}' was not found. Please ensure arduino-cli is installed and in your system's PATH."}

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

    # =================== Installation & Execution (Raw Text) ===================

    def core_update_index(self):
        return self._execute(["core", "update-index"])

    def lib_install(self, name):
        return self._execute(["lib", "install", name])

    def compile(self, fqbn, sketch_path):
        return self._execute(["compile", "--fqbn", fqbn, sketch_path])

    def upload(self, fqbn, sketch_path, port):
        return self._execute(["upload", "-p", port, "--fqbn", fqbn, sketch_path])
