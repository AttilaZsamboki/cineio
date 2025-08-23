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
  }
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

// Calculate absorption compatibility
userSchema.methods.canAbsorb = function(targetUser) {
  // Player only needs to have SEEN opponent's 5-star movies; they do not need to be 5-star themselves
  const seenArray = [...(this.watchedMovies || []), ...(this.fiveStarMovies || [])];
  const mySeen = new Set(seenArray.map(m => `${m.title}-${m.year}`));
  const targetFiveStar = (targetUser.fiveStarMovies || []).map(m => `${m.title}-${m.year}`);
  return targetFiveStar.every(movie => mySeen.has(movie));
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

module.exports = mongoose.model('User', userSchema);
