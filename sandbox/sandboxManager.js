const Docker = require('dockerode');
const tmp = require('tmp');
const fs = require('fs-extra');
const path = require('path');
const { Toxiproxy } = require('toxiproxy-node-client');

const docker = new Docker();
const toxiproxy = new Toxiproxy('http://localhost:8474');

// Helper to find a free port (for demo, use random high port)
function getRandomPort() {
    return Math.floor(Math.random() * (65535 - 20000) + 20000);
}

// Helper: Format output to be more human-readable
function formatOutput(output) {
    // Remove control characters and format warnings/errors
    let formattedOutput = output
        .replace(/\u0001|\u0002|\u0000/g, '') // Remove control characters
        .replace(/WARNING: Running pip as the 'root' user.*\n/g, ''); // Remove pip warnings
    
    // Extract log lines and format them nicely
    const logLines = formattedOutput.match(/INFO:root:.*$/gm) || [];
    if (logLines.length > 0) {
        formattedOutput = logLines
            .map(line => line.replace('INFO:root:', ''))
            .join('\n');
    }
    
    // Handle timeout message
    if (formattedOutput.includes('[Timeout]')) {
        formattedOutput = 'Execution timed out after 10 seconds.\n' + formattedOutput;
    }
    
    // Fix JSON output if it's truncated
    try {
        // Check if output contains JSON by looking for opening brace
        if (formattedOutput.includes('{') && !formattedOutput.includes('}')) {
            // Try to find the JSON part and complete it
            const jsonStart = formattedOutput.indexOf('{');
            if (jsonStart >= 0) {
                const jsonPart = formattedOutput.substring(jsonStart);
                // If it's IP info from httpbin, complete it
                if (jsonPart.includes('\"origin\"')) {
                    formattedOutput = formattedOutput.substring(0, jsonStart) + 
                        '{ \"origin\": \"[IP address]\" }';
                }
            }
        }
    } catch (e) {
        // If any error in JSON parsing, leave as is
    }
    
    return formattedOutput.trim();
}

// Helper: inject scenario simulation code into user script
function wrapUserCode(code, scenario, language) {
    let pre = '', post = '';

    // Artificial delay before execution
    if (scenario.artificialDelayMs) {
        if (language === 'python') {
            pre += `import time\nprint("Simulating artificial delay...")\ntime.sleep(${scenario.artificialDelayMs / 1000})\n`;
        } else if (language === 'javascript' || language === 'node') {
            pre += `console.log("Simulating artificial delay...");\nawait new Promise(r => setTimeout(r, ${scenario.artificialDelayMs}));\n`;
        }
    }

    // Simulate crash after execution
    if (scenario.simulateCrash) {
        if (language === 'python') {
            post += `\nimport sys\nsys.exit(1)  # Simulate crash`;
        } else if (language === 'javascript' || language === 'node') {
            post += `\nprocess.exit(1); // Simulate crash`;
        }
    }

    // Simulate high CPU load
    if (scenario.simulateHighCpu) {
        if (language === 'python') {
            pre += `import threading\nimport time\ndef cpu_load():\n    while True:\n        pass\nthreading.Thread(target=cpu_load, daemon=True).start()\nprint("Simulating high CPU load...")\n`;
        } else if (language === 'javascript' || language === 'node') {
            pre += `console.log("Simulating high CPU load...");\nfunction cpuLoad() { while(true) {} }\nsetTimeout(cpuLoad, 0);\n`;
        }
    }

    // Simulate memory leak
    if (scenario.simulateMemoryLeak) {
        if (language === 'python') {
            pre += `print("Simulating memory leak...")\n_leak = []\nfor _ in range(10**7):\n    _leak.append('leak')\n`;
        } else if (language === 'javascript' || language === 'node') {
            pre += `console.log("Simulating memory leak...");\nlet leak = [];\nfor(let i=0; i<1e7; i++) { leak.push('leak'); }\n`;
        }
    }

    // Auto-install requests if Python code uses it (for fallback)
    if (language === 'python' && code.includes('import requests')) {
        pre += `import os\nos.system('pip install --quiet requests')\n`;
    }

    return pre + code + post;
}

async function setupNetworkScenario(jobId, scenario) {
    // Use a unique proxy name and port for each job
    const proxyName = `sandbox_proxy_${jobId}`;
    const listenPort = 8666; // Use a fixed port for local dev; randomize for concurrency
    const upstream = scenario.upstream || 'httpbin.org:80';

    // Clean up proxy if it already exists (rare, but safe)
    try { await toxiproxy.deleteProxy(proxyName); } catch {}

    // Create the proxy
    const proxy = await toxiproxy.createProxy({
        name: proxyName,
        listen: `0.0.0.0:${listenPort}`,
        upstream
    });

    // Add toxics
    if (scenario.networkLatencyMs) {
        await proxy.addToxic({
            type: 'latency',
            attributes: { latency: scenario.networkLatencyMs }
        });
    }
    if (scenario.bandwidthKbps) {
        await proxy.addToxic({
            type: 'bandwidth',
            attributes: { rate: scenario.bandwidthKbps }
        });
    }
    if (scenario.timeoutMs) {
        await proxy.addToxic({
            type: 'timeout',
            attributes: { timeout: scenario.timeoutMs }
        });
    }

    return { proxyName, host: 'host.docker.internal', port: listenPort };
}

async function cleanupNetworkScenario(proxyName) {
    try { await toxiproxy.deleteProxy(proxyName); } catch {}
}

async function runJob(job) {
    // 1. Create a temp directory for the job
    const tmpDir = tmp.dirSync({ unsafeCleanup: true });
    let codeFile = path.join(tmpDir.name, 'usercode.js'); // Default to JS

    // 2. Prepare code with scenario simulation
    let userCode = wrapUserCode(job.code, job.scenario, job.language);

    // 3. Choose Docker image and command based on language
    let image, runCmd;
    if (job.language === 'python') {
        image = 'python-sandbox:latest'; // <-- Use your custom image!
        codeFile = path.join(tmpDir.name, 'usercode.py');
        runCmd = ['python', '/code/usercode.py'];
    } else if (job.language === 'javascript' || job.language === 'node') {
        image = 'node:20-slim';
        runCmd = ['node', '/code/usercode.js'];
    } else {
        throw new Error('Unsupported language');
    }

    // 4. Write user code to file
    await fs.writeFile(codeFile, userCode);

    // 5. Set up network scenario if requested
    let proxyEnv = {};
    let proxyName = null;
    if (
        job.scenario &&
        (job.scenario.networkLatencyMs ||
         job.scenario.bandwidthKbps ||
         job.scenario.timeoutMs ||
         job.scenario.upstream)
    ) {
        const net = await setupNetworkScenario(job.id, job.scenario);
        proxyName = net.proxyName;
        // Set HTTP_PROXY/HTTPS_PROXY for the container
        proxyEnv = {
            HTTP_PROXY: `http://${net.host}:${net.port}`,
            HTTPS_PROXY: `http://${net.host}:${net.port}`
        };
    }

    // 6. Run Docker container
    return new Promise(async (resolve, reject) => {
        try {
            const container = await docker.createContainer({
                Image: image,
                Cmd: runCmd,
                Env: Object.entries(proxyEnv).map(([k, v]) => `${k}=${v}`),
                HostConfig: {
                    Binds: [`${tmpDir.name}:/code:ro`],
                    AutoRemove: true,
                    Memory: 128 * 1024 * 1024, // 128MB limit
                    CpuPeriod: 100000,
                    CpuQuota: 50000, // 0.5 CPU
                }
            });

            let output = '';
            const stream = await container.attach({ stream: true, stdout: true, stderr: true });
            stream.on('data', chunk => output += chunk.toString());

            await container.start();

            // Timeout after 10 seconds
            const timeout = setTimeout(async () => {
                await container.kill();
                output += '\n[Timeout]';
                resolve({ output: formatOutput(output), success: false });
            }, 10000);

            await container.wait();
            clearTimeout(timeout);

            resolve({ output: formatOutput(output), success: true });
        } catch (err) {
            reject(err);
        } finally {
            // Clean up resources
            tmpDir.removeCallback();
            if (proxyName) await cleanupNetworkScenario(proxyName);
        }
    });
}

module.exports = { runJob };
