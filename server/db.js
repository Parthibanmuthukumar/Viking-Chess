import mongoose from 'mongoose'

const connectDB = async () => {
  const primaryUri = process.env.MONGODB_URI
  const localUri = 'mongodb://127.0.0.1:27017/leo_chess'

  try {
    if (!primaryUri) throw new Error('MONGODB_URI not set in .env')
    
    // Attempt primary connection with a shorter timeout (5s)
    const conn = await mongoose.connect(primaryUri, {
      serverSelectionTimeoutMS: 5000
    })
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`)
  } catch (err) {
    console.warn(`⚠️ MongoDB Atlas connection failed: ${err.message}`)
    console.log('Attempting local MongoDB fallback...')
    try {
      const conn = await mongoose.connect(localUri, {
        serverSelectionTimeoutMS: 3000
      })
      console.log(`✅ MongoDB Connected (Local Fallback): ${conn.connection.host}`)
    } catch (localErr) {
      console.error(`❌ Local MongoDB fallback failed: ${localErr.message}`)
      console.warn('⚠️ Running without database connection. Mongoose buffering disabled.')
      // Disable buffering so queries fail instantly instead of hanging the server
      mongoose.set('bufferCommands', false)
    }
  }
}

export default connectDB
