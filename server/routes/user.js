const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Import Letterboxd Watchlist from CSV
router.post('/import-letterboxd-watchlist', auth, upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No CSV file uploaded' });
    }

    const allWatched = [];
    const filePath = req.file.path;

    // Parse CSV file (Letterboxd watchlist export typically includes: Name, Year, Letterboxd URI)
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        const title = row.Name || row.Title || row.name || row.title;
        const year = parseInt(row.Year || row.year || row.Released_Year || row.released_year);
        const uri = row['Letterboxd URI'] || row['Letterboxd Url'] || row.letterboxdUrl || row.url;
        if (title && year) {
          allWatched.push({
            title,
            year,
            letterboxdUrl: uri || undefined,
            rating: 1
          });
        }
      })
      .on('end', async () => {
        try {
          const user = await User.findById(req.userId);

          // Deduplicate by title-year and replace existing watchlistMovies
          const seen = new Set();
          const deduped = [];
          for (const m of allWatched) {
            const key = `${m.title}-${m.year}`;
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push(m);
          }

          user.watchlistMovies = deduped;
          await user.save();

          fs.unlinkSync(filePath);

          res.json({
            message: `Successfully imported ${deduped.length} watchlist movies`,
            movieCount: deduped.length,
            movies: deduped.slice(0, 10)
          });
        } catch (error) {
          console.error('Database update error (watchlist import):', error);
          fs.unlinkSync(filePath);
          res.status(500).json({ message: 'Error updating user watchlist' });
        }
      })
      .on('error', (error) => {
        console.error('CSV parsing error (watchlist):', error);
        fs.unlinkSync(filePath);
        res.status(400).json({ message: 'Error parsing CSV file' });
      });
  } catch (error) {
    console.error('Import watchlist error:', error);
    res.status(500).json({ message: 'Server error during watchlist import' });
  }
});

// Import Letterboxd data from CSV (ratings/diary export)
router.post('/import-letterboxd', auth, upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No CSV file uploaded' });
    }

    const allWatched = [];
    const filePath = req.file.path;

    // Parse CSV file
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        // Letterboxd CSV format commonly includes: Name, Year, Letterboxd URI, Rating (may be empty)
        const title = row.Name || row.Title || row.name || row.title;
        const year = parseInt(row.Year || row.year || row.Released_Year || row.released_year);
        const uri = row['Letterboxd URI'] || row['Letterboxd Url'] || row.letterboxdUrl || row.url;
        // Normalize rating to 1..5, default to 1 when missing/unrated so we still keep as watched
        let ratingNum = parseFloat(row.Rating || row.rating);
        if (!(ratingNum >= 1 && ratingNum <= 5)) ratingNum = 1;
        if (title && year) {
          allWatched.push({
            title,
            year,
            letterboxdUrl: uri || undefined,
            rating: Math.round(ratingNum)
          });
        }
      })
      .on('end', async () => {
        try {
          // Deduplicate by title-year for watched
          const seen = new Set();
          const dedupedWatched = [];
          for (const m of allWatched) {
            const key = `${m.title}-${m.year}`;
            if (seen.has(key)) continue;
            seen.add(key);
            dedupedWatched.push(m);
          }

          // Derive fiveStar subset
          const fiveStar = dedupedWatched.filter(m => m.rating === 5);

          // Update user's movies
          const user = await User.findById(req.userId);
          user.watchedMovies = dedupedWatched;
          user.fiveStarMovies = fiveStar;
          await user.save();

          // Clean up uploaded file
          fs.unlinkSync(filePath);

          res.json({
            message: `Imported ${dedupedWatched.length} watched movies (${fiveStar.length} five-star)`,
            watchedCount: dedupedWatched.length,
            fiveStarCount: fiveStar.length,
            sample: dedupedWatched.slice(0, 10)
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

// Add movie to watchlist
router.post('/watchlist-movies', auth, async (req, res) => {
  try {
    const { title, year, director } = req.body;

    const user = await User.findById(req.userId);
    
    // Check if movie already exists in watchlist
    const existingMovie = user.watchlistMovies.find(
      movie => movie.title === title && movie.year === year
    );

    if (existingMovie) {
      return res.status(400).json({ message: 'Movie already in your watchlist' });
    }

    user.watchlistMovies.push({
      title,
      year,
      director,
      rating: 1 // Default rating for watchlist movies
    });

    await user.save();

    res.json({
      message: 'Movie added to watchlist successfully',
      movie: { title, year, director },
      totalWatchlistMovies: user.watchlistMovies.length
    });
  } catch (error) {
    console.error('Add watchlist movie error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's watchlist movies
router.get('/watchlist-movies', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    res.json(user.watchlistMovies || []);
  } catch (error) {
    console.error('Get watchlist movies error:', error);
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
