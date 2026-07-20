const express = require('express')
const cors = require('cors')
const fs = require('fs')
const path = require('path')

const app = express()
const PORT = 3001

// Enable CORS and JSON parsing
app.use(cors())
app.use(express.json())
app.use(express.text({ type: 'text/plain' }))

// Storage for collected data
const storage = {
    logs: [],
    traces: [],
    metrics: [],
    webrtcMetrics: []
}

// Utility function to add timestamp and format data
function addToStorage (type, data) {
    const entry = {
        timestamp: new Date().toISOString(),
        data: data
    }
    storage[type].push(entry)

    // Keep only last 1000 entries to prevent memory issues
    if (storage[type].length > 1000) {
        storage[type] = storage[type].slice(-1000)
    }

    console.log(`[${type.toUpperCase()}] ${entry.timestamp}:`, typeof data === 'string' ? data.substring(0, 100) : JSON.stringify(data).substring(0, 100))
}

// Loki API endpoint for logs
app.post('/loki/api/v1/push', (req, res) => {
    try {
        const payload = req.body
        if (payload.streams) {
            payload.streams.forEach(stream => {
                stream.values.forEach(([ timestamp, message ]) => {
                    const logEntry = {
                        timestamp: new Date(parseInt(timestamp) / 1000000).toISOString(),
                        labels: stream.stream,
                        message: typeof message === 'string' ? JSON.parse(message) : message
                    }
                    addToStorage('logs', logEntry)
                })
            })
        }
        res.status(204).send()
    } catch (error) {
        console.error('Error processing logs:', error)
        res.status(400).json({ error: error.message })
    }
})

// OpenTelemetry traces endpoint
app.post('/v1/traces', (req, res) => {
    try {
        const traces = req.body
        if (traces.resourceSpans) {
            traces.resourceSpans.forEach(resourceSpan => {
                resourceSpan.scopeSpans?.forEach(scopeSpan => {
                    scopeSpan.spans?.forEach(span => {
                        const traceEntry = {
                            traceId: span.traceId,
                            spanId: span.spanId,
                            name: span.name,
                            attributes: span.attributes,
                            startTime: span.startTimeUnixNano,
                            endTime: span.endTimeUnixNano,
                            status: span.status
                        }
                        addToStorage('traces', traceEntry)
                    })
                })
            })
        }
        res.status(200).json({ status: 'success' })
    } catch (error) {
        console.error('Error processing traces:', error)
        res.status(400).json({ error: error.message })
    }
})

// OpenTelemetry metrics endpoint
app.post('/v1/metrics', (req, res) => {
    try {
        const metrics = req.body
        if (metrics.resourceMetrics) {
            metrics.resourceMetrics.forEach(resourceMetric => {
                resourceMetric.scopeMetrics?.forEach(scopeMetric => {
                    scopeMetric.metrics?.forEach(metric => {
                        const metricEntry = {
                            name: metric.name,
                            description: metric.description,
                            unit: metric.unit,
                            data: metric.gauge || metric.sum || metric.histogram
                        }
                        addToStorage('metrics', metricEntry)
                    })
                })
            })
        }
        res.status(200).json({ status: 'success' })
    } catch (error) {
        console.error('Error processing metrics:', error)
        res.status(400).json({ error: error.message })
    }
})

// Prometheus metrics endpoint
app.post('/api/v1/prom/remote/write', (req, res) => {
    try {
        const metricsText = req.body
        console.log('[DEBUG] Raw metrics received:', metricsText.substring(0, 200) + '...')
        
        const lines = metricsText.split('\n').filter(line => line.trim())
        console.log('[DEBUG] Parsed lines count:', lines.length)

        lines.forEach(line => {
            const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*){([^}]*)} ([0-9.-]+) ([0-9]+)$/)
            if (match) {
                const [ , metricName, labelsStr, value, timestamp ] = match
                const labels = {}

                // Parse labels
                labelsStr.split(',').forEach(label => {
                    const [ key, val ] = label.split('=')
                    if (key && val) {
                        labels[key.trim()] = val.trim().replace(/"/g, '')
                    }
                })

                const metricEntry = {
                    name: metricName,
                    labels: labels,
                    value: parseFloat(value),
                    timestamp: new Date(parseInt(timestamp)).toISOString()
                }

                // Separate WebRTC metrics from general metrics
                if (metricName.startsWith('opensips_webrtc_')) {
                    console.log('[DEBUG] Adding WebRTC metric:', metricName, metricEntry)
                    addToStorage('webrtcMetrics', metricEntry)
                } else {
                    addToStorage('metrics', metricEntry)
                }
            }
        })

        res.status(200).send('OK')
    } catch (error) {
        console.error('Error processing Prometheus metrics:', error)
        res.status(400).json({ error: error.message })
    }
})

// Legacy visualization server endpoint (fallback)
app.post('/collect-metrics', (req, res) => {
    try {
        addToStorage('metrics', req.body)
        res.status(200).json({ status: 'received' })
    } catch (error) {
        console.error('Error processing legacy metrics:', error)
        res.status(400).json({ error: error.message })
    }
})

// Dashboard HTML page
app.get('/', (req, res) => {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OpenSIPS-JS Debug Dashboard</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: #2c3e50; color: white; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
        .stat-card { background: white; padding: 15px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stat-number { font-size: 2em; font-weight: bold; color: #3498db; }
        .tabs { display: flex; gap: 5px; margin-bottom: 20px; }
        .tab { padding: 10px 20px; background: #34495e; color: white; cursor: pointer; border-radius: 5px 5px 0 0; }
        .tab.active { background: #3498db; }
        .content { background: white; padding: 20px; border-radius: 0 5px 5px 5px; min-height: 400px; }
        .log-entry, .metric-entry, .trace-entry { margin: 10px 0; padding: 10px; background: #f8f9fa; border-left: 4px solid #3498db; }
        .timestamp { color: #666; font-size: 0.9em; }
        .scenario { background: #e74c3c; color: white; padding: 2px 6px; border-radius: 3px; font-size: 0.8em; }
        .metric-name { font-weight: bold; color: #2c3e50; }
        .clear-btn { background: #e74c3c; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-left: 10px; }
        .auto-refresh { margin-left: auto; }
        pre { background: #f4f4f4; padding: 10px; border-radius: 3px; overflow-x: auto; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 OpenSIPS-JS Debug Dashboard</h1>
            <p>Real-time monitoring of logs, metrics, and traces</p>
        </div>

        <div class="stats">
            <div class="stat-card">
                <div>📝 Total Logs</div>
                <div class="stat-number" id="logs-count">0</div>
            </div>
            <div class="stat-card">
                <div>📊 Total Metrics</div>
                <div class="stat-number" id="metrics-count">0</div>
            </div>
            <div class="stat-card">
                <div>🔗 Total Traces</div>
                <div class="stat-number" id="traces-count">0</div>
            </div>
            <div class="stat-card">
                <div>🎵 WebRTC Metrics</div>
                <div class="stat-number" id="webrtc-count">0</div>
            </div>
        </div>

        <div class="tabs">
            <div class="tab active" onclick="showTab('logs')">📝 Logs</div>
            <div class="tab" onclick="showTab('metrics')">📊 Metrics</div>
            <div class="tab" onclick="showTab('traces')">🔗 Traces</div>
            <div class="tab" onclick="showTab('webrtc')">🎵 WebRTC</div>
            <div class="auto-refresh">
                <label><input type="checkbox" id="auto-refresh" checked> Auto Refresh (5s)</label>
                <button class="clear-btn" onclick="clearData()">Clear All</button>
            </div>
        </div>

        <div class="content" id="content">
            Loading...
        </div>
    </div>

    <script>
        let currentTab = 'logs';
        let refreshInterval;

        function showTab(tab) {
            currentTab = tab;
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelector(\`[onclick="showTab('\${tab}')"]\`).classList.add('active');
            loadData();
        }

        function formatLogEntry(entry) {
            const scenario = entry.data.labels?.scenario_name || entry.data.labels?.scenario_id || 'unknown';
            return \`
                <div class="log-entry">
                    <div class="timestamp">\${entry.timestamp}</div>
                    <span class="scenario">\${scenario}</span>
                    <strong>\${entry.data.labels?.section || 'system'}</strong> -
                    <span style="color: \${entry.data.labels?.level === 'error' ? '#e74c3c' : '#2c3e50'}">\${entry.data.message.message || entry.data.message}</span>
                    \${entry.data.message.metadata ? \`<pre>\${JSON.stringify(entry.data.message.metadata, null, 2)}</pre>\` : ''}
                </div>
            \`;
        }

        function formatMetricEntry(entry) {
            const scenario = entry.data.labels?.scenario_name || 'unknown';
            return \`
                <div class="metric-entry">
                    <div class="timestamp">\${entry.timestamp}</div>
                    <span class="scenario">\${scenario}</span>
                    <span class="metric-name">\${entry.data.name}</span>: \${entry.data.value}
                    \${entry.data.labels ? \`<pre>\${JSON.stringify(entry.data.labels, null, 2)}</pre>\` : ''}
                </div>
            \`;
        }

        function formatTraceEntry(entry) {
            return \`
                <div class="trace-entry">
                    <div class="timestamp">\${entry.timestamp}</div>
                    <strong>\${entry.data.name}</strong> (Span: \${entry.data.spanId})
                    <pre>\${JSON.stringify(entry.data.attributes, null, 2)}</pre>
                </div>
            \`;
        }

        async function loadData() {
            try {
                const response = await fetch('/api/data');
                const data = await response.json();

                // Update stats
                document.getElementById('logs-count').textContent = data.stats.logs;
                document.getElementById('metrics-count').textContent = data.stats.metrics;
                document.getElementById('traces-count').textContent = data.stats.traces;
                document.getElementById('webrtc-count').textContent = data.stats.webrtcMetrics;

                // Update content
                const contentDiv = document.getElementById('content');
                let html = '';

                switch(currentTab) {
                    case 'logs':
                        html = data.logs.map(formatLogEntry).join('');
                        break;
                    case 'metrics':
                        html = data.metrics.map(formatMetricEntry).join('');
                        break;
                    case 'traces':
                        html = data.traces.map(formatTraceEntry).join('');
                        break;
                    case 'webrtc':
                        html = data.webrtcMetrics.map(formatMetricEntry).join('');
                        break;
                }

                contentDiv.innerHTML = html || '<p>No data available</p>';
            } catch (error) {
                document.getElementById('content').innerHTML = \`<p style="color: red;">Error loading data: \${error.message}</p>\`;
            }
        }

        async function clearData() {
            if (confirm('Clear all collected data?')) {
                await fetch('/api/clear', { method: 'POST' });
                loadData();
            }
        }

        // Auto refresh setup
        function setupAutoRefresh() {
            const checkbox = document.getElementById('auto-refresh');

            if (refreshInterval) {
                clearInterval(refreshInterval);
            }

            if (checkbox.checked) {
                refreshInterval = setInterval(loadData, 5000);
            }
        }

        document.getElementById('auto-refresh').addEventListener('change', setupAutoRefresh);

        // Initial load
        loadData();
        setupAutoRefresh();
    </script>
</body>
</html>
    `
    res.send(html)
})

// API endpoint for dashboard data
app.get('/api/data', (req, res) => {
    const limit = parseInt(req.query.limit) || 50

    res.json({
        stats: {
            logs: storage.logs.length,
            metrics: storage.metrics.length,
            traces: storage.traces.length,
            webrtcMetrics: storage.webrtcMetrics.length
        },
        logs: storage.logs.slice(-limit).reverse(),
        metrics: storage.metrics.slice(-limit).reverse(),
        traces: storage.traces.slice(-limit).reverse(),
        webrtcMetrics: storage.webrtcMetrics.slice(-limit).reverse()
    })
})

// Clear data endpoint
app.post('/api/clear', (req, res) => {
    storage.logs = []
    storage.traces = []
    storage.metrics = []
    storage.webrtcMetrics = []
    res.json({ status: 'cleared' })
})

app.listen(PORT, () => {
    console.log(`🔍 Debug Server running at http://localhost:${PORT}`)
    console.log(`📊 Dashboard: http://localhost:${PORT}`)
    console.log(`📝 Logs endpoint: http://localhost:${PORT}/loki/api/v1/push`)
    console.log(`🔗 Traces endpoint: http://localhost:${PORT}/v1/traces`)
    console.log(`📊 Metrics endpoint: http://localhost:${PORT}/v1/metrics`)
    console.log(`📈 Prometheus endpoint: http://localhost:${PORT}/api/v1/prom/remote/write`)
    console.log('\n🚀 Ready to collect telemetry data!')
})
