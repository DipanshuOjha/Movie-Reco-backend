const { PrismaClient }=  require('../generated/prisma/client');
const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
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

router.post('/register',async (req,res)=>{
       const {username,email,password} = req.body

       if(!username || !email || !password){
        return res.status(403).json({
            error:"Required fields are empty"
        })
       }

       try{
        const hashpassword = await bcrypt.hash(password,10);
        const user = await withRetry(() => prisma.user.create({
            data:{
                username,
                email,
                password: hashpassword
            }
        }));
        return res.status(201).json(user);
       }catch(e){
        console.log("check out error:- ",e);
         return res.status(500).json({
            error:"Resgistration failed"
         })
        }
})

router.post('/login',async (req,res)=>{
      const {email,password} = req.body;
      try {
        const user = await withRetry(() => prisma.user.findUnique({
            where:{
                email
            }
        }));
        if(!user){
            return res.status(401).json({
                error:"Invalid credential"
            })
        }
        const isMatch = await bcrypt.compare(password,user.password)
        if(!isMatch){
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({userId:user.id},process.env.JWT_SECRET,{ expiresIn: '1h' })

        res.json({token:token})
        
      } catch (e) {
         console.log("Here this is the error check out :- ",e);
         return res.status(500).json({
            error:"Login failed"
         })
      }
})

module.exports = router;