-- AlterTable
ALTER TABLE "Movie" ADD COLUMN     "awards" TEXT[],
ADD COLUMN     "cast" TEXT[],
ADD COLUMN     "country" TEXT,
ADD COLUMN     "director" TEXT,
ADD COLUMN     "imdbRating" DOUBLE PRECISION,
ADD COLUMN     "language" TEXT,
ADD COLUMN     "runtime" INTEGER,
ADD COLUMN     "similarMovies" TEXT[],
ADD COLUMN     "tags" TEXT[],
ADD COLUMN     "year" INTEGER,
ALTER COLUMN "releaseDate" DROP NOT NULL;
