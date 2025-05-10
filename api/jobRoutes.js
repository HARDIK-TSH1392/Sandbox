const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { runJob } = require('../sandbox/sandboxManager');

// In-memory job store for MVP (replace with DB/queue for production)
const jobs = {};

// Helper: Add log entry to a job
function addJobLog(jobId, message) {
    if (jobs[jobId]) {
        jobs[jobId].logs.push(`[${new Date().toISOString()}] ${message}`);
    }
}

// POST /run - Submit code and scenario for execution
router.post('/run', async (req, res) => {
    const { language, code, scenario } = req.body;

    if (!language || !code || !scenario) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    const jobId = uuidv4();
    jobs[jobId] = {
        id: jobId, // <-- Needed for unique Toxiproxy proxy
        status: 'queued',
        language,
        code,
        scenario,
        logs: [],
        result: null,
        createdAt: new Date(),
        completedAt: null
    };

    addJobLog(jobId, 'Job created and queued.');

    // Respond to client immediately
    res.json({ jobId, status: 'queued' });

    // Start execution asynchronously
    (async () => {
        jobs[jobId].status = 'running';
        addJobLog(jobId, 'Job execution started.');
        try {
            const result = await runJob(jobs[jobId]);
            jobs[jobId].status = 'completed';
            jobs[jobId].completedAt = new Date();
            jobs[jobId].result = { output: result.output };
            addJobLog(jobId, 'Execution completed.');
        } catch (err) {
            jobs[jobId].status = 'failed';
            jobs[jobId].completedAt = new Date();
            jobs[jobId].result = { error: err.message };
            addJobLog(jobId, `Execution failed: ${err.message}`);
        }
    })();
});

// GET /logs/:jobId - Fetch logs and result for a job
router.get('/logs/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = jobs[jobId];

    if (!job) {
        return res.status(404).json({ error: 'Job not found.' });
    }

    // Format the output for better readability if it exists
    let formattedResult = { ...job.result };
    if (formattedResult && formattedResult.output) {
        // If output contains truncated JSON with IP info
        if (formattedResult.output.includes('IP info: {') && !formattedResult.output.includes('}')) {
            const parts = formattedResult.output.split('IP info:');
            formattedResult.output = parts[0] + 'IP info: { "origin": "[IP address]" }';
        }
    }

    res.json({
        jobId,
        status: job.status,
        logs: job.logs,
        result: formattedResult
    });
});

// GET /status/:jobId - Get status of a job
router.get('/status/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = jobs[jobId];

    if (!job) {
        return res.status(404).json({ error: 'Job not found.' });
    }

    res.json({
        jobId,
        status: job.status,
        createdAt: job.createdAt,
        completedAt: job.completedAt
    });
});

// POST /cancel/:jobId - Cancel a running or queued job
router.post('/cancel/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = jobs[jobId];

    if (!job) {
        return res.status(404).json({ error: 'Job not found.' });
    }
    if (job.status !== 'queued' && job.status !== 'running') {
        return res.status(400).json({ error: 'Job is not running or queued.' });
    }

    // TODO: Integrate with sandbox manager to actually stop execution
    job.status = 'cancelled';
    job.completedAt = new Date();
    addJobLog(jobId, 'Job was cancelled by user.');

    res.json({ jobId, status: 'cancelled' });
});

// GET /jobs - List all jobs, optionally filter by status
router.get('/jobs', (req, res) => {
    const { status } = req.query;
    let filteredJobs = Object.entries(jobs);

    if (status) {
        filteredJobs = filteredJobs.filter(([_, job]) => job.status === status);
    }

    res.json(filteredJobs.map(([jobId, job]) => ({
        jobId,
        status: job.status,
        createdAt: job.createdAt,
        completedAt: job.completedAt
    })));
});

// Periodic cleanup of old jobs (older than 1 hour)
setInterval(() => {
    const now = Date.now();
    Object.keys(jobs).forEach(jobId => {
        const job = jobs[jobId];
        if (job.completedAt && now - new Date(job.completedAt).getTime() > 3600 * 1000) {
            delete jobs[jobId];
        }
    });
}, 3600 * 1000);

module.exports = router;
