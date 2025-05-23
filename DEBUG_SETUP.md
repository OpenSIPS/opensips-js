# Debug Server Setup for OpenSIPS-JS Testing Framework

This setup provides a local debug server to collect and visualize logs, metrics, and traces from your OpenSIPS-JS testing framework.

## Quick Start

### 1. Start the Debug Server

```bash
yarn debug-server
```

This starts the debug server at `http://localhost:3001`

### 2. Access the Dashboard

Open your browser and go to:
```
http://localhost:3001
```

You'll see a real-time dashboard showing:
- 📝 **Logs**: All QrynLogger output with structured metadata
- 📊 **Metrics**: Test event metrics and custom metrics
- 🔗 **Traces**: OpenTelemetry traces with spans
- 🎵 **WebRTC**: Real-time audio quality metrics

### 3. Run Tests with Debug Mode

```bash
yarn run-test-debug
```

This automatically:
1. Copies the debug configuration (`.env.debug` → `.env`)
2. Runs your tests with all telemetry pointing to the local debug server

## What You'll See

### Dashboard Features

- **Real-time Updates**: Auto-refreshes every 5 seconds
- **Scenario Correlation**: All data tagged with scenario names for easy filtering
- **Structured Data**: Logs include metadata, metrics include labels
- **Clear Functionality**: Reset collected data anytime
- **Color Coding**: Errors highlighted in red, different data types color-coded

### Logs Section
```
2024-01-15T10:30:15.123Z [My Test Scenario] [ActionsExecutor] - Executing register action
{
  "data": {
    "username": "caller",
    "sip_domain": "example.com"
  }
}
```

### Metrics Section  
```
opensips_test_events_total: 1
Labels: {
  "scenario_name": "My Test Scenario",
  "event_name": "register", 
  "stage": "triggered",
  "status": "success"
}
```

### WebRTC Section
```
opensips_webrtc_jitter_ms: 12.5
Labels: {
  "scenario_name": "My Test Scenario",
  "metric_type": "webrtc_audio"
}
```

## Debug Server Endpoints

The server exposes the same endpoints that qryn would use:

- **Logs**: `POST /loki/api/v1/push` (Loki format)
- **Traces**: `POST /v1/traces` (OpenTelemetry format)  
- **Metrics**: `POST /v1/metrics` (OpenTelemetry format)
- **Prometheus**: `POST /api/v1/prom/remote/write` (Prometheus format)
- **Legacy**: `POST /collect-metrics` (Fallback format)

## Configuration

The debug configuration (`.env.debug`) sets:

```bash
# Local debug server configuration
GIGAPIPE.DEFAULT.url=http://localhost:3001
GIGAPIPE.DEFAULT.scope=debug
GIGAPIPE.DEFAULT.headers.Content-Type=application/json
```

This makes all services (logs, traces, metrics) use the local debug server.

## Troubleshooting

### No Data Appearing?

1. **Check Server**: Ensure debug server is running on port 3001
2. **Check Configuration**: Verify `.env` points to `http://localhost:3001`
3. **Check Console**: Look for connection errors in the debug server console
4. **Check Browser**: Open browser dev tools to see any frontend errors

### Port Conflicts?

If port 3001 is busy, edit `debug-server.js`:
```javascript
const PORT = 3002  // Change to available port
```

And update `.env.debug`:
```bash
GIGAPIPE.DEFAULT.url=http://localhost:3002
```

### Clear Old Data

Click "Clear All" in the dashboard or restart the debug server.

## Production vs Debug

- **Debug Mode**: Uses local server for easy visualization
- **Production Mode**: Configure real qryn endpoints in `.env`

The same code works for both - just change the endpoint URLs!

## Benefits

- ✅ **Verify Integration**: See that all telemetry is working
- ✅ **Debug Issues**: Trace problems across logs/metrics/traces  
- ✅ **Performance Monitoring**: Watch WebRTC quality in real-time
- ✅ **Scenario Correlation**: Filter by scenario name
- ✅ **No External Dependencies**: Works offline locally