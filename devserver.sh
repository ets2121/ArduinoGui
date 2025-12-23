#!/bin/sh
set -e # Exit immediately if a command exits with a non-zero status.
source .venv/bin/activate
PORT=${PORT:-8080}
python -u -m flask --app main run --port $PORT --debug
