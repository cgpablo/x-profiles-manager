#!/bin/bash

# Build core and the Electron main process (the app loads them from dist)
npm run build:core && npm run build:desktop || exit 1

# Start React dev server
npm run dev -w @xpm/ui &
REACT_PID=$!

# Wait for Vite to be ready (max 30 seconds)
echo "Waiting for Vite to be ready..."
for i in {1..30}; do
  if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "Vite is ready!"
    break
  fi
  echo "Attempt $i/30..."
  sleep 1
done

# Start Electron
echo "Starting Electron..."
npm start -w x-profiles-manager &
ELECTRON_PID=$!

# Wait for all processes
wait
