const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const movieSchema = new mongoose.Schema({
  title: { type: String, required: true },
  year: { type: Number, required: true },
  director: { type: String },
  tmdbId: { type: String },
  letterboxdUrl: { type: String },
  rating: { type: Number, required: true, min: 1, max: 5 }
});

const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 20
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true
  },
  password: { 
    type: String, 
    required: true,
    minlength: 6
  },
  letterboxdUsername: {
    type: String,
    trim: true
  },
  fiveStarMovies: [movieSchema],
  watchedMovies: [movieSchema], // All movies the user has watched (any rating)
  watchlistMovies: [movieSchema], // Movies user wants to watch
  eloRating: {
    type: Number,
    default: 1200
  },
  gamesPlayed: {
    type: Number,
    default: 0
  },
  totalAbsorptions: {
    type: Number,
    default: 0
  },
  totalAbsorbed: {
    type: Number,
    default: 0
  },
  longestSurvival: {
    type: Number,
    default: 0
  },
  watchlist: [{
    targetPlayer: { type: String },
    missingMovies: [movieSchema],
    priority: { type: Number, default: 1 }
  }],
  isOnline: {
    type: Boolean,
    default: false
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  // Fighting system: reduced movie pool (10 random 5-star movies)
  fightMoviePool: [movieSchema],
  fightMoviePoolGeneratedAt: { type: Date }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Calculate absorption compatibility (now checks reduced movie pool)
userSchema.methods.canAbsorb = function(targetUser) {
  // Player only needs to have SEEN opponent's 5-star movies; they do not need to be 5-star themselves
  const seenArray = [...(this.watchedMovies || []), ...(this.fiveStarMovies || [])];
  const mySeen = new Set(seenArray.map(m => `${m.title}-${m.year}`));
  
  // Use reduced movie pool (10 random movies) if available, otherwise use all 5-star movies
  const targetMovies = targetUser.fightMoviePool && targetUser.fightMoviePool.length > 0 
    ? targetUser.fightMoviePool 
    : (targetUser.fiveStarMovies || []);
  
  const targetMovieKeys = targetMovies.map(m => `${m.title}-${m.year}`);
  return targetMovieKeys.every(movie => mySeen.has(movie));
};

// Check if user can challenge another user (has watched all their movies)
userSchema.methods.canChallenge = function(targetUser) {
  return this.canAbsorb(targetUser);
};

// Get missing movies for absorption
userSchema.methods.getMissingMovies = function(targetUser) {
  const seenArray = [...(this.watchedMovies || []), ...(this.fiveStarMovies || [])];
  const mySeen = new Set(seenArray.map(m => `${m.title}-${m.year}`));
  return (targetUser.fiveStarMovies || []).filter(movie => 
    !mySeen.has(`${movie.title}-${movie.year}`)
  );
};

// Update ELO rating
userSchema.methods.updateElo = function(opponentElo, won, kFactor = 32) {
  const expectedScore = 1 / (1 + Math.pow(10, (opponentElo - this.eloRating) / 400));
  const actualScore = won ? 1 : 0;
  
  this.eloRating = Math.round(this.eloRating + kFactor * (actualScore - expectedScore));
  this.eloRating = Math.max(100, this.eloRating); // Minimum ELO of 100
};

// Generate fight movie pool (10 random 5-star movies)
userSchema.methods.generateFightMoviePool = function() {
  if (!this.fiveStarMovies || this.fiveStarMovies.length === 0) {
    this.fightMoviePool = [];
    return this.fightMoviePool;
  }
  
  // Shuffle and take 10 random movies
  const shuffled = [...this.fiveStarMovies].sort(() => 0.5 - Math.random());
  this.fightMoviePool = shuffled.slice(0, Math.min(10, shuffled.length));
  this.fightMoviePoolGeneratedAt = new Date();
  
  return this.fightMoviePool;
};

// Check if fight movie pool needs regeneration (e.g., every 24 hours or when 5-star movies change)
userSchema.methods.shouldRegenerateFightPool = function() {
  if (!this.fightMoviePoolGeneratedAt) return true;
  
  const hoursSinceGeneration = (Date.now() - this.fightMoviePoolGeneratedAt.getTime()) / (1000 * 60 * 60);
  return hoursSinceGeneration > 24; // Regenerate every 24 hours
};

module.exports = mongoose.model('User', userSchema);
