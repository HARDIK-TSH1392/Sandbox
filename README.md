# AWS-Q-Chat Backend

A robust sandbox environment for executing code under simulated network conditions and resource constraints. This tool allows developers to test how their code behaves in various challenging scenarios without affecting production systems.

## Features

- **Isolated Code Execution**: Run Python code in secure Docker containers
- **Network Condition Simulation**:
  - Latency (delay in network responses)
  - Bandwidth limitations
  - Timeouts
  - Custom upstream targets
- **Resource Simulation**:
  - High CPU usage
  - Memory leaks
  - Artificial delays
  - Application crashes
- **REST API** for job submission and monitoring
- **Concurrent Execution** support for multiple simultaneous jobs

## Prerequisites

- Docker and Docker Compose
- Node.js (v14+)
- npm or yarn
- Python 3.x (for local development)

## Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/HARDIK-TSH1392/Sandbox.git
cd Sandbox
```

### 2. Environment Variables

The project uses the following environment variables that you can set:

| Variable | Description | Default Value |
|----------|-------------|---------------|
| PORT | Port on which the API server runs | 3000 |

You can set these variables in a `.env` file in the root directory:

```bash
# .env file example
PORT=3000
```

### 3. Build the Docker Image

```bash
docker build -t python-sandbox .
```

### 4. Install Node.js Dependencies

```bash
npm install
```

### 5. Start the Services

```bash
docker-compose up -d
```

### 6. Start the API Server

```bash
node app.js
```

The server will start on port 3000 by default (or the port specified in your environment variables).

## API Usage

### Submit a Job

```bash
curl -X POST -H "Content-Type: application/json" -d '{
  "language": "python",
  "code": "import requests\nprint(requests.get(\"http://httpbin.org/ip\").text)",
  "scenario": {
    "networkLatencyMs": 1000,
    "bandwidthKbps": 50,
    "timeoutMs": 0,
    "simulateCrash": false,
    "simulateHighCpu": false,
    "simulateMemoryLeak": false,
    "artificialDelayMs": 0,
    "upstream": "httpbin.org:80"
  }
}' http://localhost:3000/api/run
```

Response:
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued"
}
```

### Get Job Results

```bash
curl http://localhost:3000/api/logs/550e8400-e29b-41d4-a716-446655440000
```

Response:
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "logs": [
    "[2025-05-07T10:15:30.123Z] Job created and queued.",
    "[2025-05-07T10:15:30.125Z] Job execution started.",
    "[2025-05-07T10:15:32.456Z] Execution completed."
  ],
  "result": {
    "output": "{\n  \"origin\": \"103.157.53.205\"\n}\n"
  }
}
```

### List All Jobs

```bash
curl http://localhost:3000/api/jobs
```

### Cancel a Job

```bash
curl -X POST http://localhost:3000/api/cancel/550e8400-e29b-41d4-a716-446655440000
```

## Available Scenario Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| networkLatencyMs | Number | Adds latency to network requests (milliseconds) |
| bandwidthKbps | Number | Limits bandwidth (kilobits per second) |
| timeoutMs | Number | Forces timeout after specified milliseconds |
| simulateCrash | Boolean | Simulates application crash after execution |
| simulateHighCpu | Boolean | Simulates high CPU usage |
| simulateMemoryLeak | Boolean | Simulates memory leak |
| artificialDelayMs | Number | Adds delay before execution (milliseconds) |
| upstream | String | Custom upstream target (format: "host:port") |

## Advanced Demo

The repository includes a comprehensive demo script (`test.py`) that showcases the capabilities of the sandbox environment. This demo:

1. Performs CPU-intensive data processing with pandas and numpy
2. Tests network resilience with concurrent API requests
3. Handles various HTTP status codes and timeouts
4. Provides detailed logging and timing information

### Running the Advanced Demo

```bash
# Normal execution
curl -X POST -H "Content-Type: application/json" -d "{\"language\": \"python\", \"code\": $(cat test.py | jq -Rs .), \"scenario\": {}}" http://localhost:3000/api/run

# With network latency (500ms)
curl -X POST -H "Content-Type: application/json" -d "{\"language\": \"python\", \"code\": $(cat test.py | jq -Rs .), \"scenario\": {\"networkLatencyMs\": 500}}" http://localhost:3000/api/run

# With bandwidth limitation (50 Kbps)
curl -X POST -H "Content-Type: application/json" -d "{\"language\": \"python\", \"code\": $(cat test.py | jq -Rs .), \"scenario\": {\"bandwidthKbps\": 50}}" http://localhost:3000/api/run

# With high CPU simulation
curl -X POST -H "Content-Type: application/json" -d "{\"language\": \"python\", \"code\": $(cat test.py | jq -Rs .), \"scenario\": {\"simulateHighCpu\": true}}" http://localhost:3000/api/run

# Combined scenario (realistic poor network conditions)
curl -X POST -H "Content-Type: application/json" -d "{\"language\": \"python\", \"code\": $(cat test.py | jq -Rs .), \"scenario\": {\"networkLatencyMs\": 200, \"bandwidthKbps\": 100, \"timeoutMs\": 5000}}" http://localhost:3000/api/run
```

### Expected Output

The demo will produce output similar to:

```
SANDBOX CAPABILITIES DEMO
==================================================

[1] System Information:
Python version: 3.11.x
Platform: Linux-x.x.x-x-amd64-with-glibc2.31

[2] Data Processing Test:
Generating dataset with 1000 rows
Dataset generated in 0.03s
Processing dataset...
Data processing completed in 0.15s
Data statistics: mean_A=-0.0140, mean_B=0.0524
Correlation A-B: 0.0013

[3] Network Resilience Test:
Requesting http://httpbin.org/delay/1
Requesting http://httpbin.org/status/200
Requesting http://httpbin.org/status/404
Requesting http://httpbin.org/status/500
Response from http://httpbin.org/status/200: status=200, time=0.12s
Response from http://httpbin.org/status/404: status=404, time=0.13s
Response from http://httpbin.org/status/500: status=500, time=0.14s
Response from http://httpbin.org/delay/1: status=200, time=1.15s
All network tests completed in 1.16s
Results: {'success': 2, 'error': 2, 'timeout': 0}

[4] Test Summary:
Data processing: Processed 1000 rows with multiple transformations
Network testing: 4 endpoints tested with 4 concurrent workers
Network results: {'success': 2, 'error': 2, 'timeout': 0}

Demo completed successfully!
```

When run with different scenarios, you'll observe:
- With network latency: All API calls take longer
- With bandwidth limitation: Data transfers slow down
- With high CPU: Processing times increase
- With timeouts: Some API calls may fail with timeout errors

## Testing Concurrency

To test how the system handles multiple concurrent requests, use the provided script:

```bash
./concurrent_test_simple.sh
```

This will submit 5 concurrent jobs and display their results.

## Docker Configuration

The project uses Docker and Docker Compose for containerization:

- **Toxiproxy**: Used for network condition simulation
  - Default ports: 8474 (API) and 8666 (proxy)
- **Python Sandbox**: Custom Docker image for code execution
  - Resource limits: 128MB memory, 0.5 CPU

You can modify these settings in the `docker-compose.yml` file.

## Architecture

- **API Server**: Node.js with Express
- **Sandbox**: Docker containers with resource constraints
- **Network Simulation**: Toxiproxy for realistic network conditions
- **Job Management**: In-memory store with unique job IDs

## Use Cases

- Test application behavior under poor network conditions
- Verify code handles resource constraints gracefully
- Debug timing-related issues with controlled network delays
- Demonstrate how code performs under various conditions
- Simulate edge cases that are difficult to reproduce naturally
- Test API resilience against slow or unreliable external services

## Limitations

- Currently supports Python code execution only
- Jobs are stored in memory (no persistence across restarts)
- No authentication or multi-user support yet

## Cleanup

To stop all services:

```bash
pkill -f "node app.js"
docker-compose down
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
