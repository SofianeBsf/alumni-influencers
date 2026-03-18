/**
 * Database Configuration
 * Connects to MongoDB using Mongoose.
 * Connection string is read from environment variables for security.
 */

const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Mongoose 8+ does not need these options but we keep it explicit
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    process.exit(1); // Exit process with failure if DB connection fails
  }
};

module.exports = connectDB;
