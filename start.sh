#!/bin/bash

MODE=${1:-wasm}

case $MODE in
    wasm)
        echo "Starting in WASM mode..."
        cd frontend && npm start
        ;;
    server)
        echo "Starting in Server mode..."
        docker-compose up --build
        ;;
    *)
        echo "Invalid mode. Use 'wasm' or 'server'"
        exit 1
        ;;
esac