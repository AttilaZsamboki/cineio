const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Import Letterboxd data from CSV
router.post('/import-letterboxd', auth, upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No CSV file uploaded' });
    }

    const movies = [];
    const filePath = req.file.path;

    // Parse CSV file
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        // Letterboxd CSV format: Name, Year, Letterboxd URI, Rating
        if (row.Rating === '5') { // Only import 5-star movies
          movies.push({
            title: row.Name,
            year: parseInt(row.Year),
            letterboxdUrl: row['Letterboxd URI'],
            rating: 5
          });
        }
      })
      .on('end', async () => {
        try {
          // Update user's 5-star movies
          const user = await User.findById(req.userId);
          user.fiveStarMovies = movies;
          await user.save();

          // Clean up uploaded file
          fs.unlinkSync(filePath);

          res.json({
            message: `Successfully imported ${movies.length} five-star movies`,
            movieCount: movies.length,
            movies: movies.slice(0, 10) // Return first 10 for preview
          });
        } catch (error) {
          console.error('Database update error:', error);
          res.status(500).json({ message: 'Error updating user data' });
        }
      })
      .on('error', (error) => {
        console.error('CSV parsing error:', error);
        fs.unlinkSync(filePath);
        res.status(400).json({ message: 'Error parsing CSV file' });
      });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ message: 'Server error during import' });
  }
});

// Get user's movie compatibility with another user
router.get('/compatibility/:targetUserId', auth, async (req, res) => {
  try {
    const currentUser = await User.findById(req.userId);
    const targetUser = await User.findById(req.params.targetUserId);

    if (!targetUser) {
      return res.status(404).json({ message: 'Target user not found' });
    }

    const canAbsorb = currentUser.canAbsorb(targetUser);
    const missingMovies = currentUser.getMissingMovies(targetUser);

    res.json({
      targetUser: {
        id: targetUser._id,
        username: targetUser.username,
        movieCount: targetUser.fiveStarMovies.length
      },
      canAbsorb,
      missingMovies,
      compatibilityScore: Math.round((1 - (missingMovies.length / targetUser.fiveStarMovies.length)) * 100)
    });
  } catch (error) {
    console.error('Compatibility check error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add player to watchlist
router.post('/watchlist', auth, async (req, res) => {
  try {
    const { targetPlayerId, priority = 1 } = req.body;
    
    const currentUser = await User.findById(req.userId);
    const targetUser = await User.findById(targetPlayerId);

    if (!targetUser) {
      return res.status(404).json({ message: 'Target player not found' });
    }

    const missingMovies = currentUser.getMissingMovies(targetUser);
    
    // Remove existing watchlist entry for this player
    currentUser.watchlist = currentUser.watchlist.filter(
      item => item.targetPlayer !== targetUser.username
    );

    // Add new watchlist entry
    currentUser.watchlist.push({
      targetPlayer: targetUser.username,
      missingMovies,
      priority
    });

    await currentUser.save();

    res.json({
      message: `Added ${targetUser.username} to watchlist`,
      missingMovies,
      watchlist: currentUser.watchlist
    });
  } catch (error) {
    console.error('Watchlist error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's watchlist
router.get('/watchlist', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    res.json(user.watchlist);
  } catch (error) {
    console.error('Get watchlist error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user's movie list (manual addition)
router.post('/movies', auth, async (req, res) => {
  try {
    const { title, year, director, rating } = req.body;

    if (rating !== 5) {
      return res.status(400).json({ message: 'Only 5-star movies are allowed' });
    }

    const user = await User.findById(req.userId);
    
    // Check if movie already exists
    const existingMovie = user.fiveStarMovies.find(
      movie => movie.title === title && movie.year === year
    );

    if (existingMovie) {
      return res.status(400).json({ message: 'Movie already in your list' });
    }

    user.fiveStarMovies.push({
      title,
      year,
      director,
      rating: 5
    });

    await user.save();

    res.json({
      message: 'Movie added successfully',
      movie: { title, year, director, rating: 5 },
      totalMovies: user.fiveStarMovies.length
    });
  } catch (error) {
    console.error('Add movie error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const users = await User.find({})
      .select('username eloRating gamesPlayed totalAbsorptions')
      .sort({ eloRating: -1 })
      .limit(50);

    res.json(users);
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
