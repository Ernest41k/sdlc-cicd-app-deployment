// INTEGRATION tests: exercise the HTTP API end to end (without a real network).
const request = require('supertest');
const { createApp } = require('../src/app');

describe('HTTP API', () => {
  let app;

  beforeEach(() => {
    app = createApp();
  });

  test('GET / returns the home page', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('SDLC Demo');
  });

  test('GET /health reports ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('GET /api/version returns build info', async () => {
    const res = await request(app).get('/api/version');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('commit');
  });

  test('POST /api/tasks creates a task', async () => {
    const res = await request(app).post('/api/tasks').send({ title: 'Learn CI/CD' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 1, title: 'Learn CI/CD', done: false });

    const list = await request(app).get('/api/tasks');
    expect(list.body).toHaveLength(1);
  });

  test('POST /api/tasks rejects invalid input', async () => {
    const res = await request(app).post('/api/tasks').send({});
    expect(res.status).toBe(400);
    expect(res.body.errors).toContain('title is required');
  });

  test('PATCH /api/tasks/:id/toggle flips done', async () => {
    await request(app).post('/api/tasks').send({ title: 'Toggle me' });
    const res = await request(app).patch('/api/tasks/1/toggle');
    expect(res.status).toBe(200);
    expect(res.body.done).toBe(true);
  });

  test('PATCH unknown task returns 404', async () => {
    const res = await request(app).patch('/api/tasks/42/toggle');
    expect(res.status).toBe(404);
  });
});
