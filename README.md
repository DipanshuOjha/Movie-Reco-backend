# Movie Recommendation Platform Backend

## Overview
This is a Node.js/Express backend for a movie recommendation platform. It supports user authentication, movie import from various sources, user ratings, recommendations (content-based, collaborative, hybrid, and AI-powered), and robust data import/cleanup utilities. The backend uses Prisma ORM with a PostgreSQL database (Neon-compatible).

## Features
- User registration and login (JWT-based authentication)
- Import movies from OMDb, CSVs (Netflix, Disney+, Hulu, Amazon Prime, etc.)
- Rate movies and get personalized recommendations
- Multiple recommendation algorithms (genre-based, collaborative, hybrid, AI-powered)
- Recent activity tracking
- Robust retry logic for all database calls (handles Neon cold starts)
- Data deduplication and bulk import scripts
- Server-side search for movies

## Setup Instructions

### 1. Clone the Repository
```sh
git clone <your-repo-url>
cd movie-reco-platform/backend
```

### 2. Install Dependencies
```sh
npm install
```

### 3. Environment Variables
Create a `.env` file in the backend directory with the following:
```
DATABASE_URL=your_postgres_connection_string
JWT_SECRET=your_jwt_secret
OMDB_API_KEY=your_omdb_api_key
COHERE_API_KEY=your_cohere_api_key (optional, for AI recommendations)
```

### 4. Database Setup
Run Prisma migrations to set up the database schema:
```sh
npx prisma migrate dev --name init
```
Generate the Prisma client:
```sh
npx prisma generate
```

### 5. Run the Server
```sh
npm run dev
```
The backend will start on `http://localhost:4000` by default.

## API Endpoints

### Auth
- `POST /api/auth/register` — Register a new user
- `POST /api/auth/login` — Login and get JWT

### Movies
- `GET /api/movies` — Get paginated movies (query: `page`, `pageSize`)
- `POST /api/movies/rate` — Rate a movie
- `POST /api/movies/add` — Add a movie manually
- `POST /api/movies/import-from-omdb` — Import a movie from OMDb by title
- `GET /api/movies/search?q=...` — Search movies by title
- `GET /api/movies/recommendations` — Genre-based recommendations
- `GET /api/movies/recommendations/preferences` — User preferences
- `GET /api/movies/recommendations/content-based` — Content-based recommendations
- `GET /api/movies/recommendations/collaborative` — Collaborative filtering
- `GET /api/movies/recommendations/hybrid` — Hybrid recommendations
- `GET /api/movies/recommendations/ai` — AI-powered recommendations (Cohere)
- `GET /api/movies/recommendations/similar-users` — Find similar users
- `GET /api/movies/recent-activity` — 5 most recent ratings by the user
