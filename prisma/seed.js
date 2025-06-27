const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.movie.createMany({
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
    });
    console.log('Seeded database with movies');
  } catch (error) {
    console.error('Seeding failed:', error);
  }
}

main()
  .catch((e) => {
    console.error('Error in main:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });