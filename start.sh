#!/bin/bash
set -e

echo "Starting frontend (yarn dev)..."
yarn dev --host 0.0.0.0 &

DEV_PID=$!

echo "Waiting for frontend to be ready..."
while ! curl -s http://localhost:5173 >/dev/null; do
  sleep 1
done

echo "Frontend is up! Running tests..."

echo "SAMPLE_TO_EXECUTE=$SAMPLE_TO_EXECUTE"
echo "PARAMETERS=$PARAMETERS"

yarn run-test

echo "Tests finished. Killing frontend..."
kill $DEV_PID
wait $DEV_PID 2>/dev/null || true
