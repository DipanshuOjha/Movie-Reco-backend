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

const CSV_PATH = path.join(__dirname, '../movies.csv');

async function main() {
  let count = 0;
  let skipped = 0;
  const BATCH_SIZE = 100;
  let batch = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(CSV_PATH)
      .pipe(csv())
      .on('data', (row) => {
        try {
          const title = row.name && row.name.trim();
          const genre = row.genre && row.genre.trim() || 'Unknown';
          const releaseDate = row.released && row.released.trim();
          const imdbRating = row.score ? parseFloat(row.score) : null;
          const director = row.director && row.director.trim();
          const runtime = row.runtime ? parseInt(row.runtime) : null;
          const productionCompany = row.company && row.company.trim();

          if (!title || !releaseDate) {
            skipped++;
            return;
          }

          batch.push({
            title,
            genre,
            description: '',
            releaseDate: new Date(releaseDate),
            posterUrl: '',
            director: director || '',
            imdbRating,
            runtime,
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
        console.log(`Import complete! Movies added: ${count}, Skipped: ${skipped}`);
        resolve();
      })
      .on('error', (err) => {
        withRetry(() => prisma.$disconnect());
        reject(err);
      });
  });
}

main().catch((e) => {
  console.error('Error importing movies:', e);
  process.exit(1);
}); 