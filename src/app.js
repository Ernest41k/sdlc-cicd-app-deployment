const express = require('express');
const fs = require('fs');
const path = require('path');
const { validateTask, createTaskStore } = require('./tasks');

// build-info.json is written by the pipeline's BUILD stage.
// Locally it doesn't exist, so we fall back to "dev" values.
function loadBuildInfo() {
  const file = path.join(__dirname, '..', 'build-info.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { version: 'dev', commit: 'local', builtAt: null, runNumber: null };
  }
}

function createApp() {
  const app = express();
  const store = createTaskStore();
  const buildInfo = loadBuildInfo();

  app.use(express.json());

  app.get('/', (req, res) => {
    res.send(`<!doctype html>
<html>
<head><meta charset="utf-8"><title>SDLC Demo</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 640px; margin: 40px auto; padding: 0 16px; color: #222; }
  .card { border: 1px solid #ddd; border-radius: 8px; padding: 16px 20px; margin-top: 16px; }
  code { background: #f3f3f3; padding: 2px 6px; border-radius: 4px; }
</style>
</head>
<body>
  <h1>Hello from the SDLC Demo App</h1>
  <p>This page was delivered by a GitHub Actions CI/CD pipeline to AWS EC2.</p>
  <div class="card">
    <p>Version: <code>${buildInfo.version}</code></p>
    <p>Commit: <code>${buildInfo.commit}</code></p>
    <p>Pipeline run: <code>${buildInfo.runNumber ?? 'n/a'}</code></p>
    <p>Built at: <code>${buildInfo.builtAt ?? 'n/a'}</code></p>
  </div>
  <p>Try the API: <a href="/health">/health</a> · <a href="/api/version">/api/version</a> · <a href="/api/tasks">/api/tasks</a></p>
</body>
</html>`);
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.get('/api/version', (req, res) => {
    res.json(buildInfo);
  });

  app.get('/api/tasks', (req, res) => {
    res.json(store.list());
  });

  app.post('/api/tasks', (req, res) => {
    const errors = validateTask(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }
    res.status(201).json(store.add(req.body.title));
  });

  app.patch('/api/tasks/:id/toggle', (req, res) => {
    const task = store.toggle(Number(req.params.id));
    if (!task) return res.status(404).json({ error: 'task not found' });
    res.json(task);
  });

  return app;
}

module.exports = { createApp };
