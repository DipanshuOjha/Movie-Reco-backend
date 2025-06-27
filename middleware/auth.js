const jwt = require('jsonwebtoken')

const authMiddleware = async (req,res,next) =>{
     const token = req.headers['authorization']?.replace('Bearer ','');

     if(!token){
        return res.status(401).json({error: 'No token provided'})
     }
     try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;
        next();
     } catch (e) {
        console.log("Check out error :- ",e);
        return res.status(401).json({
            error:"error here mate in authorisation"
        })
        
     }
}


module.exports = authMiddleware;