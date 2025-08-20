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
  const myMovies = new Set(this.fiveStarMovies.map(m => `${m.title}-${m.year}`));
  const targetMovies = targetUser.fiveStarMovies.map(m => `${m.title}-${m.year}`);
  
  // Check if current user has seen ALL of target user's 5-star movies
  return targetMovies.every(movie => myMovies.has(movie));
};

// Get missing movies for absorption
userSchema.methods.getMissingMovies = function(targetUser) {
  const myMovies = new Set(this.fiveStarMovies.map(m => `${m.title}-${m.year}`));
  return targetUser.fiveStarMovies.filter(movie => 
    !myMovies.has(`${movie.title}-${movie.year}`)
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
