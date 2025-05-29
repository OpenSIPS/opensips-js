# WebRTC Metrics Documentation

This document describes all metrics collected and sent to Grafana for WebRTC testing scenarios.

## Metric Names

All metrics follow the naming convention `opensips_webrtc_*` and are collected every 5 seconds during active WebRTC sessions.

### Connection Metrics
- `opensips_webrtc_setup_time_ms` - Time taken to establish the WebRTC connection (milliseconds)
- `opensips_webrtc_total_duration_ms` - Total duration of the WebRTC session (milliseconds)
- `opensips_webrtc_connection_successful` - Connection success status (1 = successful, 0 = failed)

### Audio Quality Metrics
- `opensips_webrtc_packets_received_total` - Total number of audio packets received
- `opensips_webrtc_packets_sent_total` - Total number of audio packets sent
- `opensips_webrtc_packets_lost_total` - Total number of audio packets lost
- `opensips_webrtc_jitter_ms` - Audio jitter in milliseconds
- `opensips_webrtc_round_trip_time_ms` - Round trip time for audio packets (milliseconds)
- `opensips_webrtc_audio_level` - Current audio level (0.0 to 1.0)
- `opensips_webrtc_total_audio_energy` - Cumulative audio energy measurement
- `opensips_webrtc_current_delay_ms` - Current audio delay (milliseconds)

### Data Transfer Metrics
- `opensips_webrtc_bytes_received_total` - Total bytes received
- `opensips_webrtc_bytes_sent_total` - Total bytes sent

## Labels

All metrics include the following labels for filtering and grouping:

### Scenario Information
- `scenario_name` - Name of the test scenario
- `scenario_id` - Unique identifier for the scenario instance
- `environment` - Test environment (e.g., 'test', 'staging', 'prod')

### Connection Status
- `metric_type` - Always set to 'webrtc_audio'
- `connection_successful` - 'true' or 'false'
- `has_audio_metrics` - 'true' if audio metrics are available, 'false' otherwise

### Audio Quality Categories
- `audio_level_range` - 'high' (>0.5), 'low' (≤0.5), or 'unknown'
- `jitter_category` - 'high' (>50ms), 'normal' (≤50ms), or 'unknown'
- `rtt_category` - 'high' (>200ms), 'normal' (≤200ms), or 'unknown'
- `packets_lost_status` - 'some_lost' (>0), 'no_loss' (=0), or actual count
- `current_delay_category` - 'high' (>100ms), 'normal' (≤100ms), or 'unknown'
- `audio_energy_level` - 'high' (>1000), 'low' (≤1000), or 'unknown'

### Performance Categories
- `setup_time_category` - 'slow' (>5000ms), 'fast' (≤5000ms), or 'unknown'
- `duration_category` - 'long' (>60000ms) or 'short' (≤60000ms)

### Collection Metadata
- `stats_count` - Number of stats samples collected (string representation)
- `timestamp_category` - 'morning' (before 12 PM) or 'afternoon' (12 PM and after)

## Usage Examples

### Grafana Query Examples

**Average setup time by scenario:**
```promql
avg(opensips_webrtc_setup_time_ms) by (scenario_name)
```

**Packet loss rate:**
```promql
rate(opensips_webrtc_packets_lost_total[5m]) / rate(opensips_webrtc_packets_received_total[5m])
```

**Connection success rate:**
```promql
avg(opensips_webrtc_connection_successful) by (scenario_name, environment)
```

**Audio quality dashboard:**
```promql
opensips_webrtc_jitter_ms{jitter_category="high"}
opensips_webrtc_round_trip_time_ms{rtt_category="high"}
```

## Collection Frequency

- Metrics are collected every 5 seconds during active WebRTC sessions
- Final metrics are sent when the session ends
- Only new metrics are sent (incremental updates based on stats count)

## Error Handling

- If no metrics are available, collection is skipped silently
- If Qryn is not configured, a warning is logged and metrics are not sent
- Collection errors are logged but do not interrupt the WebRTC session