const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { PrismaClient } = require('../generated/prisma/client');
const prisma = new PrismaClient();

// Utility: Retry async function up to 3 times with 2s delay
async function withRetry(fn, retries = 3, delay = 2000) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < retries - 1) {
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }
  throw lastError;
}

const CSV_PATH = path.join(__dirname, '../netflix_titles.csv');

async function main() {
  let count = 0;
  let skipped = 0;
  const BATCH_SIZE = 50;
  let batch = [];

  // Get all existing movies (title + year) for fast lookup
  const existingMovies = await withRetry(() => prisma.movie.findMany({ select: { title: true, year: true } }));
  const existingSet = new Set(existingMovies.map(m => `${m.title.trim().toLowerCase()}-${m.year || ''}`));

  return new Promise((resolve, reject) => {
    fs.createReadStream(CSV_PATH)
      .pipe(csv())
      .on('data', (row) => {
        try {
          if (row.type !== 'Movie') return;
          const title = row.title && row.title.trim();
          const year = row.release_year ? parseInt(row.release_year) : null;
          const director = row.director && row.director.trim();
          const description = row.description && row.description.trim();
          const genre = row.listed_in && row.listed_in.trim();

          if (!title || !year) {
            skipped++;
            return;
          }

          const key = `${title.toLowerCase()}-${year}`;
          if (existingSet.has(key)) {
            skipped++;
            return;
          }
          existingSet.add(key);

          batch.push({
            title,
            year,
            director: director || '',
            description: description || '',
            genre: genre || '',
            releaseDate: new Date(year, 0, 1),
            posterUrl: '',
          });

          if (batch.length >= BATCH_SIZE) {
            withRetry(() => prisma.movie.createMany({ data: batch, skipDuplicates: true }))
              .then(() => { count += batch.length; batch = []; })
              .catch(() => { skipped += batch.length; batch = []; });
          }
        } catch (e) {
          skipped++;
        }
      })
      .on('end', async () => {
        if (batch.length > 0) {
          try {
            await withRetry(() => prisma.movie.createMany({ data: batch, skipDuplicates: true }));
            count += batch.length;
          } catch {
            skipped += batch.length;
          }
        }
        await withRetry(() => prisma.$disconnect());
        console.log(`Netflix import complete! Movies added: ${count}, Skipped: ${skipped}`);
        resolve();
      })
      .on('error', (err) => {
        withRetry(() => prisma.$disconnect());
        reject(err);
      });
  });
}

main().catch((e) => {
  console.error('Error importing Netflix movies:', e);
  process.exit(1);
}); 