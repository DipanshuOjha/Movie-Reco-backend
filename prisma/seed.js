const { PrismaClient } = require('@prisma/client');

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
  try {
    await withRetry(() => prisma.movie.createMany({
      data: [
        {
          title: 'The Matrix',
          genre: 'Sci-Fi',
          description: 'A hacker discovers reality is a simulation.',
          releaseDate: new Date('1999-03-31'),
        },
        {
          title: 'Inception',
          genre: 'Sci-Fi',
          description: 'A thief enters dreams to steal secrets.',
          releaseDate: new Date('2010-07-16'),
        },
      ],
    }));
    console.log('Seeded database with movies');
  } catch (error) {
    console.error('Seeding failed:', error);
  }
  await withRetry(() => prisma.$disconnect());
}

main()
  .catch((e) => {
    console.error('Error in main:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });