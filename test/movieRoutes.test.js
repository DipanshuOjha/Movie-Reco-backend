/**
 * To run these tests:
 * 1. Install Jest and supertest: npm install --save-dev jest supertest
 * 2. Add to package.json: "test": "jest"
 * 3. Set OMDB_API_KEY in your .env file
 * 4. Run: npm test
 */

const request = require('supertest');
const express = require('express');
require('dotenv').config({ path: './.env' });

const moviesRouter = require('../route/movies');

const app = express();
app.use(express.json());
// Mock auth middleware to always allow and set req.userId
app.use((req, res, next) => { req.userId = 1; next(); });
app.use('/movies', moviesRouter);

describe('Movie Routes', () => {
  it('should import a movie from OMDb', async () => {
    const res = await request(app)
      .post('/movies/import-from-omdb')
      .send({ title: 'Inception' });
    expect(res.statusCode).toBe(201);
    expect(res.body.movie).toHaveProperty('title', 'Inception');
    expect(res.body.movie).toHaveProperty('genre');
  });

  it('should return recommendations (empty if no ratings)', async () => {
    const res = await request(app)
      .get('/movies/recommendations');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('recommendations');
    expect(Array.isArray(res.body.recommendations)).toBe(true);
  });
}); 