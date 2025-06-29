const { PrismaClient }=  require('../generated/prisma/client');
const express = require('express')
const authMiddleware = require('../middleware/auth')
const axios = require('axios')
const router = express.Router()

const prisma = new PrismaClient()

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

// Get all movies with user ratings (paginated)
router.get('/', authMiddleware, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 50;
  const skip = (page - 1) * pageSize;

  try {
    const [movies, total] = await Promise.all([
      withRetry(() => prisma.movie.findMany({
        skip,
        take: pageSize,
        include: {
          rating: {
            where: { userId: req.userId },
            select: { score: true },
          },
        },
      })),
      withRetry(() => prisma.movie.count()),
    ]);
    const moviesWithRatings = movies.map((movie) => ({
      ...movie,
      userRating: movie.rating?.length > 0 ? movie.rating[0].score : null,
    }));
    res.json({ movies: moviesWithRatings, total });
  } catch (error) {
    console.error('Error fetching movies:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Rate a movie
router.post('/rate', authMiddleware, async (req, res) => {
  const { movieId, score } = req.body;
  if (!movieId || !score || score < 1 || score > 5) {
    return res.status(400).json({ error: 'Invalid input' });
  }
  try {
    const existingRating = await withRetry(() => prisma.rating.findFirst({
      where: { userId: req.userId, movieId },
    }));
    if (existingRating) {
      await withRetry(() => prisma.rating.update({
        where: { id: existingRating.id },
        data: { score },
      }));
    } else {
      await withRetry(() => prisma.rating.create({
        data: { userId: req.userId, movieId, score },
      }));
    }
    res.status(201).json({ message: 'Rating saved' });
  } catch (error) {
    console.error('Rating error:', error);
    res.status(400).json({ error: 'Error creating rating' });
  }
});

// Add a movie (for testing)
router.post('/add', async (req, res) => {
  const { title, genre, description, releaseDate, posterUrl } = req.body;
  if (!title || !genre) {
    return res.status(400).json({ error: 'Title and genre are required' });
  }
  try {
    const movie = await withRetry(() => prisma.movie.create({
      data: {
        title,
        genre,
        description: description || '',
        releaseDate: releaseDate ? new Date(releaseDate) : null,
        posterUrl: posterUrl || '',
      },
    }));
    res.status(201).json({ message: 'Movie added successfully', movie });
  } catch (error) {
    console.error('Error adding movie:', error);
    res.status(400).json({ error: 'Error adding movie' });
  }
});

// Import from OMDb API
router.post('/import-from-omdb', async (req, res) => {
  const { title } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Movie title is required' });
  }

  try {
    const OMDB_API_KEY = process.env.OMDB_API_KEY || 'demo'; // Use 'demo' for testing
    const response = await axios.get(`http://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${OMDB_API_KEY}`);
    
    if (response.data.Response === 'False') {
      return res.status(404).json({ error: 'Movie not found' });
    }

    const movieData = response.data;
    
    // Check if movie already exists
    const existingMovie = await withRetry(() => prisma.movie.findFirst({
      where: { title: movieData.Title }
    }));

    if (existingMovie) {
      return res.status(400).json({ error: 'Movie already exists in database' });
    }

    // Create movie from OMDb data
    const movie = await withRetry(() => prisma.movie.create({
      data: {
        title: movieData.Title,
        genre: movieData.Genre ? movieData.Genre.split(', ')[0] : 'Unknown',
        description: movieData.Plot || '',
        releaseDate: movieData.Year ? new Date(movieData.Year, 0, 1) : null,
        posterUrl: movieData.Poster !== 'N/A' ? movieData.Poster : '',
        director: movieData.Director || '',
        year: parseInt(movieData.Year) || null,
        imdbRating: movieData.imdbRating ? parseFloat(movieData.imdbRating) : null,
        runtime: movieData.Runtime ? parseInt(movieData.Runtime) : null,
        language: movieData.Language || '',
        country: movieData.Country || '',
      },
    }));

    res.status(201).json({ 
      message: 'Movie imported successfully', 
      movie: {
        id: movie.id.toString(),
        title: movie.title,
        genre: movie.genre,
        description: movie.description,
        releaseDate: movie.releaseDate ? movie.releaseDate.toISOString() : '',
        posterUrl: movie.posterUrl,
        director: movie.director,
        year: movie.year,
        rating: movie.rating,
        runtime: movie.runtime,
        language: movie.language,
        country: movie.country,
      }
    });
  } catch (error) {
    console.error('OMDb import error:', error);
    res.status(500).json({ error: 'Failed to import movie from OMDb' });
  }
});

// Get user preferences and behavior analysis
router.get('/recommendations/preferences', authMiddleware, async (req, res) => {
  try {
    const ratings = await prisma.rating.findMany({
      where: { userId: req.userId },
      include: { movie: true },
    });

    if (ratings.length === 0) {
      return res.json({
        favoriteGenres: [],
        favoriteDirectors: [],
        favoriteActors: [],
        preferredYears: [],
        preferredRuntime: [],
        ratingThreshold: 3,
        watchHistory: [],
        dislikedGenres: [],
        preferredLanguages: []
      });
    }

    // Analyze user preferences
    const highRatedMovies = ratings.filter(r => r.score >= 4);
    const lowRatedMovies = ratings.filter(r => r.score <= 2);

    // Favorite genres (from highly rated movies)
    const favoriteGenres = [...new Set(highRatedMovies.map(r => r.movie.genre))];
    
    // Disliked genres (from low rated movies)
    const dislikedGenres = [...new Set(lowRatedMovies.map(r => r.movie.genre))];
    
    // Preferred years (from highly rated movies)
    const preferredYears = [...new Set(highRatedMovies.map(r => 
      r.movie.releaseDate ? new Date(r.movie.releaseDate).getFullYear() : null
    ).filter(Boolean))];

    // Watch history
    const watchHistory = ratings.map(r => r.movie.title);

    res.json({
      favoriteGenres,
      favoriteDirectors: [], // Add when you have director data
      favoriteActors: [], // Add when you have cast data
      preferredYears,
      preferredRuntime: [], // Add when you have runtime data
      ratingThreshold: 3,
      watchHistory,
      dislikedGenres,
      preferredLanguages: [] // Add when you have language data
    });
  } catch (error) {
    console.error('Error getting preferences:', error);
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

// Content-based recommendations
router.get('/recommendations/content-based', authMiddleware, async (req, res) => {
  try {
    const ratings = await prisma.rating.findMany({
      where: { userId: req.userId },
      include: { movie: true },
    });

    if (ratings.length === 0) {
      return res.json({ recommendations: [] });
    }

    // Get user's favorite genres from highly rated movies
    const highRatedGenres = ratings
      .filter(r => r.score >= 4)
      .map(r => r.movie.genre);

    // Find movies in favorite genres that user hasn't rated
    const recommendations = await prisma.movie.findMany({
      where: {
        genre: { in: highRatedGenres },
        id: { notIn: ratings.map(r => r.movieId) },
      },
      take: 10,
    });

    const recommendationsWithScores = recommendations.map(movie => ({
      movie: {
        id: movie.id.toString(),
        title: movie.title,
        genre: movie.genre,
        description: movie.description,
        releaseDate: movie.releaseDate ? movie.releaseDate.toISOString() : '',
        posterUrl: movie.posterUrl,
      },
      score: 0.8, // High score for content-based
      reason: `Based on your love for ${movie.genre} movies`,
      algorithm: 'content-based',
      confidence: 0.8
    }));

    res.json({ recommendations: recommendationsWithScores });
  } catch (error) {
    console.error('Content-based recommendation error:', error);
    res.status(500).json({ error: 'Failed to generate content-based recommendations' });
  }
});

// Collaborative filtering recommendations
router.get('/recommendations/collaborative', authMiddleware, async (req, res) => {
  try {
    // Get all users' ratings
    const allRatings = await prisma.rating.findMany({
      include: { movie: true, user: true },
    });

    // Find similar users (users who rated the same movies similarly)
    const userRatings = allRatings.filter(r => r.userId === req.userId);
    const otherUsers = [...new Set(allRatings.map(r => r.userId).filter(id => id !== req.userId))];

    let similarUsers = [];
    for (const otherUserId of otherUsers) {
      const otherUserRatings = allRatings.filter(r => r.userId === otherUserId);
      
      // Find common movies
      const commonMovies = userRatings.filter(ur => 
        otherUserRatings.some(or => or.movieId === ur.movieId)
      );

      if (commonMovies.length >= 2) {
        // Calculate similarity (simple correlation)
        let similarity = 0;
        let count = 0;
        
        for (const ur of commonMovies) {
          const or = otherUserRatings.find(r => r.movieId === ur.movieId);
          if (or) {
            similarity += (5 - Math.abs(ur.score - or.score)) / 5;
            count++;
          }
        }
        
        if (count > 0) {
          similarity = similarity / count;
          if (similarity > 0.6) { // Only consider similar users
            similarUsers.push({
              userId: otherUserId,
              similarity,
              ratings: otherUserRatings
            });
          }
        }
      }
    }

    // Sort by similarity
    similarUsers.sort((a, b) => b.similarity - a.similarity);

    // Get recommendations from similar users
    const recommendedMovies = new Map();
    const userRatedMovies = new Set(userRatings.map(r => r.movieId));

    for (const similarUser of similarUsers.slice(0, 5)) {
      for (const rating of similarUser.ratings) {
        if (rating.score >= 4 && !userRatedMovies.has(rating.movieId)) {
          const movie = rating.movie;
          if (!recommendedMovies.has(movie.id)) {
            recommendedMovies.set(movie.id, {
              movie: {
                id: movie.id.toString(),
                title: movie.title,
                genre: movie.genre,
                description: movie.description,
                releaseDate: movie.releaseDate ? movie.releaseDate.toISOString() : '',
                posterUrl: movie.posterUrl,
              },
              score: similarUser.similarity,
              reason: `Liked by users similar to you (${Math.round(similarUser.similarity * 100)}% similar)`,
              algorithm: 'collaborative',
              confidence: similarUser.similarity
            });
          }
        }
      }
    }

    res.json({ 
      recommendations: Array.from(recommendedMovies.values()).slice(0, 10)
    });
  } catch (error) {
    console.error('Collaborative recommendation error:', error);
    res.status(500).json({ error: 'Failed to generate collaborative recommendations' });
  }
});

// Hybrid recommendations (combines content-based and collaborative)
router.get('/recommendations/hybrid', authMiddleware, async (req, res) => {
  try {
    // Get both content-based and collaborative recommendations
    const [contentBased, collaborative] = await Promise.all([
      prisma.rating.findMany({
        where: { userId: req.userId },
        include: { movie: true },
      }),
      prisma.rating.findMany({
        include: { movie: true, user: true },
      })
    ]);

    if (contentBased.length === 0) {
      return res.json({ recommendations: [] });
    }

    // Content-based part
    const highRatedGenres = contentBased
      .filter(r => r.score >= 4)
      .map(r => r.movie.genre);

    const contentMovies = await prisma.movie.findMany({
      where: {
        genre: { in: highRatedGenres },
        id: { notIn: contentBased.map(r => r.movieId) },
      },
      take: 15,
    });

    // Collaborative part (simplified)
    const otherUsers = [...new Set(collaborative.map(r => r.userId).filter(id => id !== req.userId))];
    const collaborativeMovies = new Map();

    for (const otherUserId of otherUsers.slice(0, 10)) {
      const otherUserRatings = collaborative.filter(r => r.userId === otherUserId);
      const commonMovies = contentBased.filter(ur => 
        otherUserRatings.some(or => or.movieId === ur.movieId)
      );

      if (commonMovies.length >= 2) {
        let similarity = 0;
        let count = 0;
        
        for (const ur of commonMovies) {
          const or = otherUserRatings.find(r => r.movieId === ur.movieId);
          if (or) {
            similarity += (5 - Math.abs(ur.score - or.score)) / 5;
            count++;
          }
        }
        
        if (count > 0) {
          similarity = similarity / count;
          if (similarity > 0.5) {
            for (const rating of otherUserRatings) {
              if (rating.score >= 4 && !contentBased.some(r => r.movieId === rating.movieId)) {
                const movie = rating.movie;
                if (!collaborativeMovies.has(movie.id)) {
                  collaborativeMovies.set(movie.id, {
                    movie: {
                      id: movie.id.toString(),
                      title: movie.title,
                      genre: movie.genre,
                      description: movie.description,
                      releaseDate: movie.releaseDate ? movie.releaseDate.toISOString() : '',
                      posterUrl: movie.posterUrl,
                    },
                    score: similarity * 0.8,
                    reason: `Hybrid: Similar users love this ${movie.genre} movie`,
                    algorithm: 'hybrid',
                    confidence: similarity
                  });
                }
              }
            }
          }
        }
      }
    }

    // Merge content-based and collaborative recommendations
    const hybridRecommendations = [
      ...contentMovies.map(movie => ({
        movie: {
          id: movie.id.toString(),
          title: movie.title,
          genre: movie.genre,
          description: movie.description,
          releaseDate: movie.releaseDate ? movie.releaseDate.toISOString() : '',
          posterUrl: movie.posterUrl,
        },
        score: 0.7,
        reason: `You like ${movie.genre} movies`,
        algorithm: 'hybrid',
        confidence: 0.7
      })),
      ...Array.from(collaborativeMovies.values())
    ];

    // Remove duplicates by movie id
    const uniqueRecommendations = [];
    const seen = new Set();
    for (const rec of hybridRecommendations) {
      if (!seen.has(rec.movie.id)) {
        uniqueRecommendations.push(rec);
        seen.add(rec.movie.id);
      }
    }

    res.json({ recommendations: uniqueRecommendations.slice(0, 10) });
  } catch (error) {
    console.error('Hybrid recommendation error:', error);
    res.status(500).json({ error: 'Failed to generate hybrid recommendations' });
  }
});

// Similar users endpoint (for collaborative tab)
router.get('/recommendations/similar-users', authMiddleware, async (req, res) => {
  try {
    const allRatings = await prisma.rating.findMany({
      include: { movie: true, user: true },
    });

    const userRatings = allRatings.filter(r => r.userId === req.userId);
    const otherUsers = [...new Set(allRatings.map(r => r.userId).filter(id => id !== req.userId))];

    let similarUsers = [];
    for (const otherUserId of otherUsers) {
      const otherUserRatings = allRatings.filter(r => r.userId === otherUserId);
      const commonMovies = userRatings.filter(ur => 
        otherUserRatings.some(or => or.movieId === ur.movieId)
      );

      if (commonMovies.length >= 2) {
        let similarity = 0;
        let count = 0;
        for (const ur of commonMovies) {
          const or = otherUserRatings.find(r => r.movieId === ur.movieId);
          if (or) {
            similarity += (5 - Math.abs(ur.score - or.score)) / 5;
            count++;
          }
        }
        if (count > 0) {
          similarity = similarity / count;
          if (similarity > 0.6) {
            similarUsers.push({
              id: otherUserId,
              username: otherUserRatings[0]?.user?.username || 'User',
              similarity,
              commonMovies: commonMovies.map(m => m.movie.title),
              recommendedMovies: otherUserRatings.filter(r => r.score >= 4).map(r => r.movie.title)
            });
          }
        }
      }
    }

    similarUsers.sort((a, b) => b.similarity - a.similarity);

    res.json(similarUsers.slice(0, 5));
  } catch (error) {
    console.error('Similar users error:', error);
    res.status(500).json({ error: 'Failed to find similar users' });
  }
});

// AI-powered movie recommendations
router.get('/recommendations/ai', authMiddleware, async (req, res) => {
  try {
    // 1. Get user ratings and all movies
    const ratings = await prisma.rating.findMany({
      where: { userId: req.userId },
      include: { movie: true },
    });
    const movies = await prisma.movie.findMany();

    // 2. Build user profile summary
    const liked = ratings.filter(r => r.score >= 4).map(r => r.movie.title);
    const disliked = ratings.filter(r => r.score <= 2).map(r => r.movie.title);

    // 3. Prepare prompt for Cohere (limit to 50 movies for reliability)
    const prompt = `
You are a movie recommendation AI.
User likes: ${liked.length ? liked.join(', ') : 'none'}
User dislikes: ${disliked.length ? disliked.join(', ') : 'none'}
Here is a list of movies: ${movies.slice(0, 50).map(m => m.title).join(', ')}
Recommend 10 movies from the list above that best match the user's taste. Return only a JSON array of movie titles.
`;

    // 4. Call Cohere API
    const cohereResponse = await axios.post(
      'https://api.cohere.ai/v1/generate',
      {
        model: 'command',
        prompt,
        max_tokens: 256,
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.COHERE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    // 5. Parse and return recommendations
    let recommendedTitles = [];
    try {
      const text = cohereResponse.data.generations[0].text;
      const match = text.match(/\[.*\]/s);
      if (match) {
        recommendedTitles = JSON.parse(match[0]);
      } else {
        throw new Error('No JSON array found in AI response');
      }
    } catch (e) {
      return res.status(500).json({ error: 'AI response parsing failed', details: cohereResponse.data });
    }

    // 6. Map titles to movie objects, but only unique titles
    const seen = new Set();
    const recommendedMovies = [];
    for (const m of movies) {
      if (recommendedTitles.includes(m.title) && !seen.has(m.title)) {
        recommendedMovies.push(m);
        seen.add(m.title);
      }
    }
    res.json({ recommendations: recommendedMovies });
  } catch (error) {
    console.error('Cohere AI error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to generate AI recommendations' });
  }
});

// Server-side search endpoint
router.get('/search', authMiddleware, async (req, res) => {
  const q = req.query.q ? req.query.q.trim() : '';
  if (!q) {
    return res.json({ movies: [], total: 0 });
  }
  try {
    const [movies, total] = await Promise.all([
      withRetry(() => prisma.movie.findMany({
        where: {
          title: {
            contains: q,
            mode: 'insensitive',
          },
        },
        take: 50,
      })),
      withRetry(() => prisma.movie.count({
        where: {
          title: {
            contains: q,
            mode: 'insensitive',
          },
        },
      })),
    ]);
    res.json({ movies, total });
  } catch (error) {
    console.error('Error searching movies:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Recent activity endpoint
router.get('/recent-activity', authMiddleware, async (req, res) => {
  try {
    const ratings = await withRetry(() => prisma.rating.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { movie: { select: { title: true } } },
    }));
    const activity = ratings.map(r => ({
      movie: r.movie.title,
      rating: r.score,
      date: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    }));
    res.json(activity);
  } catch (error) {
    console.error('Error fetching recent activity:', error);
    res.status(500).json([]);
  }
});

module.exports = router;