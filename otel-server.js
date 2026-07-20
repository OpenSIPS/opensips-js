const express = require('express')
const cors = require('cors')
const app = express()
const port = 8080

// In-memory storage for metrics
let metricsData = []
let tracesData = []

// Enable CORS
app.use(cors())

// Endpoint to receive metrics
app.post('/collect-metrics', express.json(), (req, res) => {
    const metric = req.body
    console.log('Received metric:', JSON.stringify(metric, null, 2))

    // Add timestamp to the metric if not present
    metric.timestamp = metric.timestamp || new Date().toISOString()

    // Store the metric (keeping only the last 100 metrics)
    metricsData.unshift(metric)
    if (metricsData.length > 100) {
        metricsData.pop()
    }

    res.status(200).send({ status: 'ok' })
})

// Endpoint to receive traces
app.post('/collect-traces', express.json(), (req, res) => {
    const trace = req.body
    console.log('Received trace:', JSON.stringify(trace, null, 2))

    // Add timestamp to the trace if not present
    trace.timestamp = trace.timestamp || new Date().toISOString()

    // Calculate duration if start and end times are provided but duration isn't
    if (trace.startTime && trace.endTime && !trace.durationMs) {
        const start = new Date(trace.startTime).getTime()
        const end = new Date(trace.endTime).getTime()
        trace.durationMs = end - start
    }

    // Store the trace (keeping only the last 50 traces)
    tracesData.unshift(trace)
    if (tracesData.length > 50) {
        tracesData.pop()
    }

    res.status(200).send({ status: 'ok' })
})

// API to get stored metrics
app.get('/api/metrics', (req, res) => {
    const sortField = req.query.sort || 'timestamp'
    const sortOrder = req.query.order === 'asc' ? 1 : -1

    // Clone and sort the metrics
    const sortedMetrics = [ ...metricsData ].sort((a, b) => {
        if (!a[sortField]) return sortOrder
        if (!b[sortField]) return -sortOrder

        if (typeof a[sortField] === 'string') {
            return sortOrder * a[sortField].localeCompare(b[sortField])
        }

        return sortOrder * (a[sortField] - b[sortField])
    })

    res.json(sortedMetrics)
})

// API to get stored traces
app.get('/api/traces', (req, res) => {
    const sortField = req.query.sort || 'timestamp'
    const sortOrder = req.query.order === 'asc' ? 1 : -1

    // Clone and sort the traces
    const sortedTraces = [ ...tracesData ].sort((a, b) => {
        if (!a[sortField]) return sortOrder
        if (!b[sortField]) return -sortOrder

        if (typeof a[sortField] === 'string') {
            return sortOrder * a[sortField].localeCompare(b[sortField])
        }

        return sortOrder * (a[sortField] - b[sortField])
    })

    res.json(sortedTraces)
})

// Serve HTML UI
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>OpenTelemetry Visualization</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        h1, h2 {
            color: #333;
        }
        .tabs {
            display: flex;
            margin-bottom: 20px;
        }
        .tab {
            padding: 10px 20px;
            background-color: #ddd;
            cursor: pointer;
            border-radius: 5px 5px 0 0;
            margin-right: 5px;
        }
        .tab.active {
            background-color: #fff;
            border: 1px solid #ccc;
            border-bottom: none;
        }
        .tab-content {
            display: none;
            background-color: #fff;
            padding: 20px;
            border-radius: 0 5px 5px 5px;
            border: 1px solid #ccc;
        }
        .tab-content.active {
            display: block;
        }
        .metric-card, .trace-card {
            background-color: #f9f9f9;
            border: 1px solid #eee;
            padding: 15px;
            margin-bottom: 10px;
            border-radius: 5px;
        }
        .trace-card.success {
            border-left: 5px solid #4CAF50;
        }
        .trace-card.failure {
            border-left: 5px solid #f44336;
        }
        pre {
            background-color: #f0f0f0;
            padding: 10px;
            border-radius: 5px;
            overflow: auto;
        }
        .actions {
            margin-bottom: 20px;
            display: flex;
            gap: 10px;
            align-items: center;
        }
        button {
            padding: 8px 15px;
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        button:hover {
            background-color: #45a049;
        }
        .empty-message {
            color: #666;
            font-style: italic;
        }

        /* Timeline visualization styles */
        .timeline {
            margin: 30px 0;
            position: relative;
        }
        .timeline-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
            font-size: 12px;
            color: #777;
        }
        .timeline-scale {
            height: 20px;
            background-color: #f0f0f0;
            position: relative;
            border-radius: 3px;
            margin-bottom: 10px;
        }
        .timeline-tick {
            position: absolute;
            width: 1px;
            height: 8px;
            background-color: #aaa;
            top: 0;
        }
        .timeline-tick-label {
            position: absolute;
            font-size: 10px;
            color: #777;
            transform: translateX(-50%);
            top: 10px;
        }
        .timeline-event {
            position: relative;
            height: 30px;
            margin-bottom: 5px;
            padding-left: 100px;
        }
        .timeline-event-label {
            position: absolute;
            left: 0;
            width: 95px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 12px;
            line-height: 30px;
        }
        .timeline-event-bar {
            position: absolute;
            height: 20px;
            border-radius: 3px;
            top: 5px;
            cursor: pointer;
        }
        .timeline-event-bar.success {
            background-color: rgba(76, 175, 80, 0.6);
            border: 1px solid #4CAF50;
        }
        .timeline-event-bar.failure {
            background-color: rgba(244, 67, 54, 0.6);
            border: 1px solid #f44336;
        }
        .timeline-event-bar:hover {
            opacity: 0.8;
        }

        /* Filters */
        .filter-section {
            margin-bottom: 15px;
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
        }
        .filter-group {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        .filter-label {
            font-weight: bold;
            font-size: 14px;
        }
        select, input {
            padding: 5px;
            border-radius: 3px;
            border: 1px solid #ccc;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>OpenTelemetry Visualization</h1>
        <div class="tabs">
            <div class="tab active" onclick="switchTab('metrics')">Metrics</div>
            <div class="tab" onclick="switchTab('traces')">Traces</div>
            <div class="tab" onclick="switchTab('timeline')">Timeline</div>
        </div>

        <div id="metrics-tab" class="tab-content active">
            <div class="filter-section">
                <div class="filter-group">
                    <span class="filter-label">Sort by:</span>
                    <select id="metrics-sort" onchange="refreshMetrics()">
                        <option value="timestamp">Time</option>
                        <option value="name">Name</option>
                        <option value="event">Event</option>
                        <option value="status">Status</option>
                        <option value="executionTimeMs">Duration</option>
                    </select>
                </div>
                <div class="filter-group">
                    <span class="filter-label">Order:</span>
                    <select id="metrics-order" onchange="refreshMetrics()">
                        <option value="desc">Newest First</option>
                        <option value="asc">Oldest First</option>
                    </select>
                </div>
                <div class="filter-group">
                    <span class="filter-label">Filter:</span>
                    <input type="text" id="metrics-filter" placeholder="Filter by text" onkeyup="refreshMetrics()">
                </div>
            </div>

            <div class="actions">
                <button onclick="refreshMetrics()">Refresh Metrics</button>
            </div>

            <h2>Collected Metrics</h2>
            <div id="metrics-container">Loading metrics...</div>
        </div>

        <div id="traces-tab" class="tab-content">
            <div class="filter-section">
                <div class="filter-group">
                    <span class="filter-label">Sort by:</span>
                    <select id="traces-sort" onchange="refreshTraces()">
                        <option value="timestamp">Time</option>
                        <option value="name">Name</option>
                        <option value="durationMs">Duration</option>
                        <option value="status">Status</option>
                    </select>
                </div>
                <div class="filter-group">
                    <span class="filter-label">Order:</span>
                    <select id="traces-order" onchange="refreshTraces()">
                        <option value="desc">Newest First</option>
                        <option value="asc">Oldest First</option>
                    </select>
                </div>
                <div class="filter-group">
                    <span class="filter-label">Filter:</span>
                    <input type="text" id="traces-filter" placeholder="Filter by text" onkeyup="refreshTraces()">
                </div>
            </div>

            <div class="actions">
                <button onclick="refreshTraces()">Refresh Traces</button>
            </div>

            <h2>Collected Traces</h2>
            <div id="traces-container">Loading traces...</div>
        </div>

        <div id="timeline-tab" class="tab-content">
            <div class="filter-section">
                <div class="filter-group">
                    <span class="filter-label">Time Range:</span>
                    <select id="timeline-range" onchange="refreshTimeline()">
                        <option value="60">Last minute</option>
                        <option value="300">Last 5 minutes</option>
                        <option value="600">Last 10 minutes</option>
                        <option value="1800">Last 30 minutes</option>
                        <option value="3600">Last hour</option>
                        <option value="all">All data</option>
                    </select>
                </div>
                <div class="filter-group">
                    <span class="filter-label">Group by:</span>
                    <select id="timeline-group" onchange="refreshTimeline()">
                        <option value="name">Event Name</option>
                        <option value="scenarioId">Scenario ID</option>
                        <option value="status">Status</option>
                    </select>
                </div>
                <div class="filter-group">
                    <span class="filter-label">Filter:</span>
                    <input type="text" id="timeline-filter" placeholder="Filter by text" onkeyup="refreshTimeline()">
                </div>
            </div>

            <div class="actions">
                <button onclick="refreshTimeline()">Refresh Timeline</button>
            </div>

            <h2>Timeline Visualization</h2>
            <div id="timeline-container">Loading timeline data...</div>
        </div>
    </div>

    <script>
        // Switch between tabs
        function switchTab(tabName) {
            document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            document.querySelector('.tab[onclick="switchTab(\\'' + tabName + '\\')"]').classList.add('active');
            document.getElementById(tabName + '-tab').classList.add('active');

            // Refresh the active tab
            if (tabName === 'metrics') {
                refreshMetrics();
            } else if (tabName === 'traces') {
                refreshTraces();
            } else if (tabName === 'timeline') {
                refreshTimeline();
            }
        }

        // Fetch and display metrics
        async function refreshMetrics() {
            try {
                const sortField = document.getElementById('metrics-sort').value;
                const sortOrder = document.getElementById('metrics-order').value;
                const filterText = document.getElementById('metrics-filter').value.toLowerCase();

                const response = await fetch(\`/api/metrics?sort=\${sortField}&order=\${sortOrder}\`);
                const metrics = await response.json();

                const container = document.getElementById('metrics-container');

                // Filter metrics based on text input
                const filteredMetrics = filterText
                    ? metrics.filter(m => JSON.stringify(m).toLowerCase().includes(filterText))
                    : metrics;

                if (filteredMetrics.length === 0) {
                    container.innerHTML = '<p class="empty-message">No metrics matching your criteria.</p>';
                    return;
                }

                let html = '';
                filteredMetrics.forEach(metric => {
                    const executionTime = metric.executionTimeMs
                        ? \`<div><strong>Execution Time:</strong> \${metric.executionTimeMs}ms</div>\`
                        : '';

                    html += \`<div class="metric-card">\`;
                    html += \`<div><strong>Timestamp:</strong> \${metric.timestamp || 'N/A'}</div>\`;
                    html += \`<div><strong>Name:</strong> \${metric.name || 'N/A'}</div>\`;
                    html += \`<div><strong>Type:</strong> \${metric.metricType || 'N/A'}</div>\`;
                    html += \`<div><strong>Status:</strong> \${metric.status || 'N/A'}</div>\`;
                    html += \`<div><strong>Stage:</strong> \${metric.stage || 'N/A'}</div>\`;
                    html += executionTime;
                    html += \`<pre>\${JSON.stringify(metric, null, 2)}</pre>\`;
                    html += \`</div>\`;
                });

                container.innerHTML = html;
            } catch (error) {
                console.error('Error fetching metrics:', error);
                document.getElementById('metrics-container').innerHTML = '<p class="empty-message">Error loading metrics. See console for details.</p>';
            }
        }

        // Fetch and display traces
        async function refreshTraces() {
            try {
                const sortField = document.getElementById('traces-sort').value;
                const sortOrder = document.getElementById('traces-order').value;
                const filterText = document.getElementById('traces-filter').value.toLowerCase();

                const response = await fetch(\`/api/traces?sort=\${sortField}&order=\${sortOrder}\`);
                const traces = await response.json();

                const container = document.getElementById('traces-container');

                // Filter traces based on text input
                const filteredTraces = filterText
                    ? traces.filter(t => JSON.stringify(t).toLowerCase().includes(filterText))
                    : traces;

                if (filteredTraces.length === 0) {
                    container.innerHTML = '<p class="empty-message">No traces matching your criteria.</p>';
                    return;
                }

                let html = '';
                filteredTraces.forEach(trace => {
                    const statusClass = trace.status === 'failure' ? 'failure' : 'success';

                    html += \`<div class="trace-card \${statusClass}">\`;
                    html += \`<div><strong>Timestamp:</strong> \${trace.timestamp || 'N/A'}</div>\`;
                    html += \`<div><strong>Name:</strong> \${trace.name || 'N/A'}</div>\`;
                    html += \`<div><strong>Status:</strong> \${trace.status || 'N/A'}</div>\`;

                    if (trace.startTime && trace.endTime) {
                        html += \`<div><strong>Start Time:</strong> \${new Date(trace.startTime).toLocaleTimeString()}</div>\`;
                        html += \`<div><strong>End Time:</strong> \${new Date(trace.endTime).toLocaleTimeString()}</div>\`;
                    }

                    html += \`<div><strong>Duration:</strong> \${trace.durationMs ? trace.durationMs + 'ms' : 'N/A'}</div>\`;

                    // Add scenario ID if available
                    if (trace.scenarioId) {
                        html += \`<div><strong>Scenario ID:</strong> \${trace.scenarioId}</div>\`;
                    }

                    html += \`<pre>\${JSON.stringify(trace, null, 2)}</pre>\`;
                    html += \`</div>\`;
                });

                container.innerHTML = html;
            } catch (error) {
                console.error('Error fetching traces:', error);
                document.getElementById('traces-container').innerHTML = '<p class="empty-message">Error loading traces. See console for details.</p>';
            }
        }

        // Fetch and visualize timeline
        async function refreshTimeline() {
            try {
                // Get all metrics and traces
                const [metricsResponse, tracesResponse] = await Promise.all([
                    fetch('/api/metrics'),
                    fetch('/api/traces')
                ]);

                const metrics = await metricsResponse.json();
                const traces = await tracesResponse.json();

                // Combine data for timeline
                let timelineEvents = [
                    ...metrics.map(m => ({
                        id: m.timestamp + '-' + m.name + '-' + (m.stage || ''),
                        timestamp: new Date(m.timestamp).getTime(),
                        name: m.name,
                        displayName: m.displayName || m.name,
                        duration: m.executionTimeMs || 0,
                        status: m.status || 'success',
                        scenarioId: m.scenarioId,
                        stage: m.stage,
                        type: 'metric',
                        raw: m
                    })),
                    ...traces.map(t => ({
                        id: t.timestamp + '-' + t.name,
                        timestamp: new Date(t.timestamp).getTime(),
                        name: t.name,
                        displayName: t.name,
                        duration: t.durationMs || 0,
                        status: t.status || 'success',
                        scenarioId: t.scenarioId,
                        type: 'trace',
                        raw: t
                    }))
                ];

                // Apply time range filter
                const timeRange = document.getElementById('timeline-range').value;
                if (timeRange !== 'all') {
                    const rangeMs = parseInt(timeRange) * 1000;
                    const cutoffTime = Date.now() - rangeMs;
                    timelineEvents = timelineEvents.filter(event => event.timestamp >= cutoffTime);
                }

                // Apply text filter
                const filterText = document.getElementById('timeline-filter').value.toLowerCase();
                if (filterText) {
                    timelineEvents = timelineEvents.filter(event =>
                        JSON.stringify(event.raw).toLowerCase().includes(filterText)
                    );
                }

                // Sort by timestamp
                timelineEvents.sort((a, b) => a.timestamp - b.timestamp);

                // Group events
                const groupBy = document.getElementById('timeline-group').value;
                const groupedEvents = {};

                timelineEvents.forEach(event => {
                    const groupKey = event[groupBy] || 'unknown';
                    if (!groupedEvents[groupKey]) {
                        groupedEvents[groupKey] = [];
                    }
                    groupedEvents[groupKey].push(event);
                });

                // Render timeline
                renderTimeline(groupedEvents, timelineEvents);

            } catch (error) {
                console.error('Error creating timeline:', error);
                document.getElementById('timeline-container').innerHTML = '<p class="empty-message">Error creating timeline. See console for details.</p>';
            }
        }

        // Render the timeline visualization
        function renderTimeline(groupedEvents, allEvents) {
            const container = document.getElementById('timeline-container');

            if (allEvents.length === 0) {
                container.innerHTML = '<p class="empty-message">No data available for timeline visualization.</p>';
                return;
            }

            // Calculate time range
            const startTime = Math.min(...allEvents.map(e => e.timestamp));
            const endTime = Math.max(...allEvents.map(e => e.timestamp + (e.duration || 0)));
            const timeRange = endTime - startTime;

            // Need at least some time range
            const effectiveTimeRange = timeRange > 0 ? timeRange : 60000; // Default to 1 minute if no real range

            // Create timeline container
            let html = '<div class="timeline">';

            // Create timeline header and scale
            html += '<div class="timeline-header">';
            html += \`<span>\${new Date(startTime).toLocaleString()}</span>\`;
            html += \`<span>\${new Date(endTime).toLocaleString()}</span>\`;
            html += '</div>';

            html += '<div class="timeline-scale">';

            // Add time ticks
            const tickCount = 10;
            for (let i = 0; i <= tickCount; i++) {
                const position = (i / tickCount) * 100;
                const tickTime = startTime + (i / tickCount) * effectiveTimeRange;

                html += \`<div class="timeline-tick" style="left: \${position}%;"></div>\`;
                html += \`<div class="timeline-tick-label" style="left: \${position}%;">\${new Date(tickTime).toLocaleTimeString()}</div>\`;
            }

            html += '</div>';

            // Add events by group
            Object.keys(groupedEvents).forEach(groupKey => {
                const events = groupedEvents[groupKey];

                html += \`<div class="timeline-group-header">\${groupKey}</div>\`;

                events.forEach(event => {
                    // Calculate position and width
                    const startPosition = ((event.timestamp - startTime) / effectiveTimeRange) * 100;

                    // Use duration if available, otherwise use a fixed width
                    let width;
                    if (event.duration && event.duration > 0) {
                        width = (event.duration / effectiveTimeRange) * 100;
                        // Minimum width for visibility
                        width = Math.max(width, 0.5);
                    } else {
                        width = 0.5; // Default width for point events
                    }

                    // Ensure the event is visible on the timeline
                    const adjustedStartPosition = Math.min(Math.max(startPosition, 0), 100);
                    const adjustedWidth = Math.min(width, 100 - adjustedStartPosition);

                    const statusClass = event.status === 'failure' ? 'failure' : 'success';

                    html += \`<div class="timeline-event" data-id="\${event.id}">\`;
                    html += \`<div class="timeline-event-label" title="\${event.displayName}">\${event.displayName}</div>\`;
                    html += \`<div class="timeline-event-bar \${statusClass}"
                                style="left: \${adjustedStartPosition}%; width: \${adjustedWidth}%;"
                                title="\${event.displayName}\\nTime: \${new Date(event.timestamp).toLocaleTimeString()}\\nDuration: \${event.duration}ms\\nStatus: \${event.status}"
                                onclick="showEventDetails('\${event.id}', \${JSON.stringify(event.raw).replace(/"/g, '\\"')})">
                             </div>\`;
                    html += \`</div>\`;
                });
            });

            html += '</div>'; // Close timeline

            // Add event details section
            html += '<div id="event-details"></div>';

            container.innerHTML = html;
        }

        // Show details for a specific event
        function showEventDetails(eventId, eventData) {
            const detailsContainer = document.getElementById('event-details');

            detailsContainer.innerHTML = \`
                <div style="margin-top: 20px; padding: 15px; background-color: #f9f9f9; border-radius: 5px; border: 1px solid #eee;">
                    <h3>Event Details</h3>
                    <pre>\${JSON.stringify(eventData, null, 2)}</pre>
                </div>
            \`;

            // Scroll to the details
            detailsContainer.scrollIntoView({ behavior: 'smooth' });
        }

        // Auto-refresh data
        document.addEventListener('DOMContentLoaded', () => {
            refreshMetrics();
            refreshTraces();
            refreshTimeline();

            // Auto refresh every 5 seconds
            setInterval(() => {
                if (document.getElementById('metrics-tab').classList.contains('active')) {
                    refreshMetrics();
                } else if (document.getElementById('traces-tab').classList.contains('active')) {
                    refreshTraces();
                } else if (document.getElementById('timeline-tab').classList.contains('active')) {
                    refreshTimeline();
                }
            }, 5000);
        });
    </script>
</body>
</html>
  `)
})

// Start the server
app.listen(port, () => {
    console.log(`OpenTelemetry visualization server running at http://localhost:${port}`)
})
