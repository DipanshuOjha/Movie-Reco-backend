const express = require('express')
const cors = require('cors')
const app = express();
const authroute = require('./route/auth')
const movieroute = require('./route/movies')

const starttime = Date.now();


const PORT = process.env.PORT || 4000;



app.use(cors());
app.use(express.json());

app.get('/',(req,res)=>{
    const currtime = Date.now();
    const uptimeMillis = currtime-starttime;

    const seconds = Math.floor(uptimeMillis / 1000) % 60;
    const minutes = Math.floor(uptimeMillis / (1000 * 60)) % 60;
    const hours = Math.floor(uptimeMillis / (1000 * 60 * 60));
    res.json({
        status:"Healthy",
        uptime: `${hours}h ${minutes}m ${seconds}s`,
    })
})

app.use('/api/auth',authroute)
app.use('/api/movies',movieroute)


app.listen(PORT,()=>{
    console.log(`Backend is up on localhost ${PORT}\n`)
})

