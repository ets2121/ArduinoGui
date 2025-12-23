
# To learn more about how to use Nix to configure your environment
# see: https://developers.google.com/idx/guides/customize-idx-env
{ pkgs, ... }: {
  channel = "stable-24.05";
  packages = [ pkgs.python3 pkgs.wget pkgs.gnutar ];
  idx = {
    extensions = [ "ms-python.python" ];
    workspace = {
      onCreate = {
        pip-install = "python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt";
      };
      onStart = {
        # This long-running script runs in the background. It is now robust and will exit on any error.
        arduino-setup = ''
          set -e # BUG FIX: Exit immediately if any command fails.

          # Use a workspace-relative path for all Arduino data and binaries.
          ARDUINO_DATA_PATH="$PWD/.arduino-data"
          ARDUINO_BIN_PATH="$ARDUINO_DATA_PATH/bin"
          ARDUINO_CLI_PATH="$ARDUINO_BIN_PATH/arduino-cli"
          ARDUINO_CONFIG_PATH="$ARDUINO_DATA_PATH/arduino-cli.yaml"
          SUCCESS_FLAG_PATH="$ARDUINO_DATA_PATH/setup.success"

          # Ensure the directories exist and remove any old success flag.
          mkdir -p "$ARDUINO_BIN_PATH"
          rm -f "$SUCCESS_FLAG_PATH"

          # Install arduino-cli if it's not already installed.
          if [ ! -f "$ARDUINO_CLI_PATH" ]; then
            echo "Installing arduino-cli..."
            wget -O arduino-cli.tar.gz https://github.com/arduino/arduino-cli/releases/download/0.35.3/arduino-cli_0.35.3_Linux_64bit.tar.gz
            tar -xzf arduino-cli.tar.gz -C "$ARDUINO_BIN_PATH"
            rm arduino-cli.tar.gz
          fi

          # Always re-initialize the config to ensure it's correct.
          echo "Initializing arduino-cli configuration..."
          "$ARDUINO_CLI_PATH" --config-file "$ARDUINO_CONFIG_PATH" --data-dir "$ARDUINO_DATA_PATH" config init --overwrite
          "$ARDUINO_CLI_PATH" --config-file "$ARDUINO_CONFIG_PATH" --data-dir "$ARDUINO_DATA_PATH" config set board-manager.additional_urls https://downloads.arduino.cc/packages/package_index.json https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
          
          echo "Updating core index... (This may take a moment)"
          "$ARDUINO_CLI_PATH" --config-file "$ARDUINO_CONFIG_PATH" --data-dir "$ARDUINO_DATA_PATH" core update-index
          
          echo "Installing Arduino AVR core..."
          "$ARDUINO_CLI_PATH" --config-file "$ARDUINO_CONFIG_PATH" --data-dir "$ARDUINO_DATA_PATH" core install arduino:avr

          echo "Installing Espressif ESP32 core..."
          "$ARDUINO_CLI_PATH" --config-file "$ARDUINO_CONFIG_PATH" --data-dir "$ARDUINO_DATA_PATH" core install esp32:esp32

          # Create the success flag file ONLY after all installations are complete.
          echo "Setup complete. Creating success flag."
          touch "$SUCCESS_FLAG_PATH"
        '';
      };
    };
    previews = {
      enable = true;
      previews = {
        web = {
          command = [ "./devserver.sh" ];
          env = { PORT = "$PORT"; };
          manager = "web";
        };
      };
    };
  };
}
