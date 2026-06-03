#!/bin/bash

# Start React dev server
npm run react-dev &
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
npm run electron &
ELECTRON_PID=$!

# Wait for all processes
wait
