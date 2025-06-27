const { PrismaClient }=  require('../generated/prisma/client');
const express = require('express')
const authMiddleware = require('../middleware/auth')

const router = express.Router()

const prisma = new PrismaClient()


router.get('/',async(req,res)=>{
      try {
        //console.log("Attempting to connect to DB at:", process.env.DATABASE_URL);
        const movies = await prisma.movie.findMany();
        res.json(movies);
      } catch (e) {
        console.log("Check out error :- ",e);
        return res.status(500).json({
            error:"server error"
        })
        
      }
})

router.post('/rate',authMiddleware,async (req,res)=>{
       const {movieId,score} = req.body;
       if(!movieId || !score || score < 1 || score > 5){
        console.log("Error while entering movie detail:- ",e)
          return res.status(400).json({
            error:"Invalid enter in movie"
          })
       }

       try {
        
        const rating = await prisma.rating.create({
            data:{
                userId : req.userId,
                movieId,score
            },
        })

        res.status(201).json({
            rating
        })
        
       } catch (e) {
         console.log("Error check out :- ",e);
         return res.status(400).json({
             error:"Error while added rating to movie"
         })
        
       }
})


// testing movie addition
router.post('/add',async(req,res)=>{
    const { title, genre, description, releaseDate} = req.body;
  if (!title || !genre) {
    return res.status(400).json({ error: 'Title and genre are required' });
  }

  try {
    const movie = await prisma.movie.create({
      data: {
        title,
        genre,
        description: description || '',
        releaseDate: releaseDate ? new Date(releaseDate) : null,
      },
    });
    res.status(201).json({ message: 'Movie added successfully', movie });
  } catch (error) {
    console.error('Error adding movie:', error);
    res.status(400).json({ error: 'Error adding movie' });
  }
})

module.exports = router;