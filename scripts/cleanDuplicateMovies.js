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

async function main() {
  let deletedMovies = 0;
  let deletedRatings = 0;
  // 1. Get all movies
  const movies = await withRetry(() => prisma.movie.findMany({}));
  // 2. Group by title + year
  const map = new Map();
  for (const movie of movies) {
    const key = `${movie.title.trim().toLowerCase()}-${movie.year || ''}`;
    if (!map.has(key)) {
      map.set(key, [movie]);
    } else {
      map.get(key).push(movie);
    }
  }
  // 3. For each group, keep the one with the lowest id, delete the rest
  for (const [key, group] of map.entries()) {
    if (group.length > 1) {
      // Sort by id, keep the first
      group.sort((a, b) => a.id - b.id);
      const toDelete = group.slice(1);
      for (const movie of toDelete) {
        // Delete ratings first
        const ratings = await withRetry(() => prisma.rating.deleteMany({ where: { movieId: movie.id } }));
        deletedRatings += ratings.count;
        // Delete the movie
        await withRetry(() => prisma.movie.delete({ where: { id: movie.id } }));
        deletedMovies++;
        console.log(`Deleted duplicate movie: ${movie.title} (${movie.year || ''}) [id=${movie.id}]`);
      }
    }
  }
  await withRetry(() => prisma.$disconnect());
  console.log(`Cleanup complete! Deleted ${deletedMovies} duplicate movies and ${deletedRatings} ratings.`);
}

main().catch((e) => {
  console.error('Error cleaning duplicates:', e);
  process.exit(1);
}); 