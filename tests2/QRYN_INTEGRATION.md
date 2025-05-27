# Qryn Integration for OpenSIPS-JS Testing Framework

This document describes the qryn integration implemented for the OpenSIPS-JS testing framework, enabling proper logs, traces, and metrics collection and export to qryn endpoints.

## Overview

The testing framework now properly integrates with qryn through the GIGAPIPE configuration, supporting:

1. **Structured Logging** - Logs are sent to qryn's Loki-compatible endpoint
2. **Distributed Tracing** - OpenTelemetry traces are sent to qryn's OTLP endpoint  
3. **Metrics Collection** - WebRTC audio metrics and test metrics are sent to qryn's Prometheus endpoint

## Configuration

### Environment Configuration (env.json5)

```json5
{
  "SAMPLE_TO_EXECUTE": "tests2/samples/e2e/sample.json",
  "APPLICATION_PORT": "5173",
  
  // GIGAPIPE configuration with qryn endpoints
  "GIGAPIPE": {
    // DEFAULT is used as fallback for all services if no specific config provided
    "DEFAULT": {
      "url": "https://your-qryn-instance.com",
      "scope": "test",
      "headers": {
        "Authorization": "Bearer your-token",
        "X-Scope-OrgID": "your-org-id"
      }
    },
    
    // Override specific service endpoints if needed
    "TRACING": {
      "url": "https://your-qryn-tracing.com",
      "scope": "tracing",
      "headers": {
        "Authorization": "Bearer your-tracing-token"
      }
    },
    
    "METRICS": {
      "url": "https://your-qryn-metrics.com", 
      "scope": "metrics",
      "headers": {
        "Authorization": "Bearer your-metrics-token"
      }
    },
    
    "LOGS": {
      "url": "https://your-qryn-logs.com",
      "scope": "logs", 
      "headers": {
        "Authorization": "Bearer your-logs-token"
      }
    }
  },
  
  "PARAMETERS": {
    "CALLER": {
      "sip_domain": "your-sip-domain.com",
      "username": "caller",
      "password": "password"
    },
    "CALLEE": {
      "sip_domain": "your-sip-domain.com", 
      "username": "callee",
      "password": "password"
    }
  }
}
```

## Implemented Features

### 1. QrynLogger Service

- **Location**: `tests2/services/QrynLogger.ts`
- **Purpose**: Replaces console.log calls with structured logging to qryn's Loki endpoint
- **Features**:
  - Automatic fallback to console logging if no qryn config
  - Structured log entries with metadata
  - Scenario context (name and ID) attached to all logs
  - Multiple log levels: info, error, warn, debug

### 2. Enhanced TelemetryService

- **Location**: `tests2/services/TelemetryService.ts`
- **Updates**:
  - Uses OTLP exporters for traces and metrics instead of console exporters
  - Sends data to qryn's OpenTelemetry endpoints
  - Includes scenario name/ID in all trace attributes
  - Enhanced error handling and structured logging

### 3. WebRTC Metrics Integration

- **Location**: `tests2/services/WebRTCMetricsCollector.ts`
- **Features**:
  - Collects real-time WebRTC audio metrics (jitter, packet loss, etc.)
  - Sends metrics to qryn in Prometheus format
  - Includes scenario context in all metrics
  - Periodic export to reduce load

### 4. Service Updates

All services now use structured logging and proper scenario naming:

- **ActionsExecutor**: All actions logged with context
- **PageWebSocketWorker**: WebSocket events and messages logged
- **TestExecutor**: Test execution flow logged
- **ScenarioManager**: Scenario lifecycle logged

## Data Structure

### Logs (Loki Format)

```json
{
  "streams": [{
    "stream": {
      "level": "info|error|warn|debug",
      "section": "service-name",
      "scenario_name": "My Test Scenario",
      "scenario_id": "scenario-1",
      "job": "opensips-js-tests",
      "environment": "test"
    },
    "values": [
      ["timestamp_ns", "{\"message\":\"Log message\",\"metadata\":{...}}"]
    ]
  }]
}
```

### Traces (OpenTelemetry)

All traces include attributes:
- `scenario.name`: Human-readable scenario name
- `scenario.id`: Unique scenario identifier  
- `service.name`: "opensips-js-tests"
- `environment`: From configuration scope

### Metrics (Prometheus Format)

```
# Test event metrics
opensips_test_events_total{scenario_name="My Test",scenario_id="scenario-1",event_name="register",stage="triggered",status="success",environment="test"} 1 1640995200000

# WebRTC audio metrics  
opensips_webrtc_jitter_ms{scenario_name="My Test",scenario_id="scenario-1",environment="test",metric_type="webrtc_audio"} 12.5 1640995200000
opensips_webrtc_packets_lost_total{scenario_name="My Test",scenario_id="scenario-1",environment="test",metric_type="webrtc_audio"} 0 1640995200000
```

## Fallback Behavior

If qryn configuration is not provided or unreachable:

1. **Logs**: Fall back to console.log with structured format
2. **Traces**: Fall back to console span exporter
3. **Metrics**: Fall back to console metrics exporter or local visualization server

## Scenario Naming

All logs, traces, and metrics now consistently reference scenarios by:
- **scenarioName**: Human-readable name from the test scenario definition
- **scenarioId**: Unique identifier (e.g., "scenario-1", "scenario-2")

This ensures proper correlation and filtering in qryn dashboards.

## Usage

1. Configure your qryn endpoints in `env.json5`
2. Run tests: `yarn run-test`
3. View data in qryn:
   - **Logs**: Filter by `scenario_name` or `scenario_id`
   - **Traces**: Search by scenario attributes
   - **Metrics**: Use scenario labels for filtering

## Benefits

- **Centralized Observability**: All test data in one place
- **Scenario Correlation**: Easy to trace issues across logs/metrics/traces
- **Production-Ready**: Structured data suitable for dashboards and alerting
- **Graceful Degradation**: Works without qryn configuration
- **Scalable**: Handles multiple concurrent test scenarios