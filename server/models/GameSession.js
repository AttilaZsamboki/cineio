const mongoose = require('mongoose');

// Movie orb schema for consumable items
const movieOrbSchema = new mongoose.Schema({
  id: { type: String, required: true },
  position: {
    x: { type: Number, required: true },
    y: { type: Number, required: true }
  },
  type: { 
    type: String, 
    enum: ['single', 'bundle', 'list', 'boss'], 
    default: 'single' 
  },
  movies: [{
    title: { type: String, required: true },
    year: { type: Number, required: true },
    director: { type: String },
    letterboxdUrl: { type: String },
    watchCount: { type: Number, default: 0 } // For boss movies
  }],
  pointValue: { type: Number, default: 5 },
  size: { type: Number, default: 8 },
  color: { type: String, default: '#f39c12' },
  spawnedAt: { type: Date, default: Date.now }
});

const playerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: { type: String, required: true },
  socketId: { type: String },
  position: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 }
  },
  size: { type: Number, default: 20 },
  color: { type: String, default: '#3498db' },
  isAlive: { type: Boolean, default: true },
  joinedAt: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now },
  absorptions: { type: Number, default: 0 },
  points: { type: Number, default: 100 }, // Points gained/lost through interactions
  survivalTime: { type: Number, default: 0 },
  // During this window after spawning, player cannot be absorbed nor absorb others
  spawnProtectedUntil: { type: Date },
  // Battle handling
  battleHaltUntil: { type: Date },
  battleCooldownUntil: { type: Date }
});

const gameSessionSchema = new mongoose.Schema({
  sessionId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  name: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['waiting', 'active', 'ended'],
    default: 'waiting'
  },
  maxPlayers: {
    type: Number,
    default: 50
  },
  worldSize: {
    width: { type: Number, default: 1000 },
    height: { type: Number, default: 1000 }
  },
  players: [playerSchema],
  movieOrbs: [movieOrbSchema],
  startTime: { type: Date },
  endTime: { type: Date },
  duration: {
    type: Number, // Duration in days
    default: 7
  },
  winner: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: { type: String },
    finalSize: { type: Number },
    totalAbsorptions: { type: Number }
  },
  settings: {
    absorptionCooldown: { type: Number, default: 5000 }, // 5 seconds
    movementSpeed: { type: Number, default: 2 },
    sizeGrowthRate: { type: Number, default: 1.2 },
    respawnEnabled: { type: Boolean, default: true },
    respawnCooldown: { type: Number, default: 300000 }, // 5 minutes
    // New: Spawn protection and safe spawn parameters
    spawnProtectionMs: { type: Number, default: 5000 }, // 5 seconds invulnerability after spawn
    safeSpawnMinDistance: { type: Number, default: 120 }, // min distance from other players on spawn
    maxSpawnAttempts: { type: Number, default: 25 },
    // Battle settings
    battleHaltMs: { type: Number, default: 600 },
    battleCooldownMs: { type: Number, default: 2000 },
    // Point system
    absorptionPointGain: { type: Number, default: 20 },
    absorptionPointLoss: { type: Number, default: 10 },
    // Movie orb settings
    maxMovieOrbs: { type: Number, default: 50 },
    orbSpawnRate: { type: Number, default: 30000 }, // 30 seconds
    singleOrbPoints: { type: Number, default: 5 },
    bundleOrbPoints: { type: Number, default: 15 },
    listOrbPoints: { type: Number, default: 40 },
    bossOrbPoints: { type: Number, default: 100 }
  }
}, {
  timestamps: true
});

// Add player to session
gameSessionSchema.methods.addPlayer = function(userId, username, socketId) {
  // Check if player already exists
  const existingPlayer = this.players.find(p => p.userId.toString() === userId.toString());
  if (existingPlayer) {
    existingPlayer.socketId = socketId;
    existingPlayer.isAlive = true;
    existingPlayer.lastActive = new Date();
    return existingPlayer;
  }

  // Add new player at random position
  // Try to find a safe spawn position away from existing active players
  const activePlayers = this.players.filter(p => p.isAlive && p.socketId);
  const minDist = this.settings.safeSpawnMinDistance;
  const maxAttempts = this.settings.maxSpawnAttempts || 25;

  let spawnX = 0;
  let spawnY = 0;
  let attempts = 0;
  const width = this.worldSize.width;
  const height = this.worldSize.height;

  const isSafe = (x, y) => {
    for (const p of activePlayers) {
      const dx = p.position.x - x;
      const dy = p.position.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) return false;
    }
    return true;
  };

  do {
    spawnX = Math.random() * width;
    spawnY = Math.random() * height;
    attempts++;
  } while (!isSafe(spawnX, spawnY) && attempts < maxAttempts);

  const newPlayer = {
    userId,
    username,
    socketId,
    position: { x: spawnX, y: spawnY },
    color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
    spawnProtectedUntil: new Date(Date.now() + (this.settings.spawnProtectionMs || 0))
  };

  this.players.push(newPlayer);
  return newPlayer;
};

// Remove player from session
gameSessionSchema.methods.removePlayer = function(socketId) {
  const playerIndex = this.players.findIndex(p => p.socketId === socketId);
  if (playerIndex > -1) {
    this.players[playerIndex].socketId = null;
    this.players[playerIndex].lastActive = new Date();
  }
};

// Handle player absorption
gameSessionSchema.methods.absorb = function(absorberSocketId, victimSocketId) {
  const absorber = this.players.find(p => p.socketId === absorberSocketId);
  const victim = this.players.find(p => p.socketId === victimSocketId);
  
  if (!absorber || !victim || !victim.isAlive) {
    return false;
  }
  
  // Point-based interaction instead of elimination
  const pointGain = this.settings.absorptionPointGain || 20;
  const pointLoss = this.settings.absorptionPointLoss || 10;
  
  absorber.points += pointGain;
  absorber.size += Math.floor(pointGain * 0.5); // Smaller size increase
  absorber.absorptions += 1;
  
  victim.points = Math.max(0, victim.points - pointLoss);
  victim.size = Math.max(15, victim.size - Math.floor(pointLoss * 0.3)); // Minimum size
  
  // Victim stays alive and active!
  victim.survivalTime = Date.now() - victim.joinedAt.getTime();
  
  return true;
};

// Get active players
gameSessionSchema.methods.getActivePlayers = function() {
  return this.players.filter(p => p.isAlive && p.socketId);
};

// Spawn movie orbs
gameSessionSchema.methods.spawnMovieOrb = function(type = 'single', movies = [], customPosition = null) {
  if (this.movieOrbs.length >= this.settings.maxMovieOrbs) {
    return null;
  }

  const orbId = `orb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const position = customPosition || {
    x: Math.random() * this.worldSize.width,
    y: Math.random() * this.worldSize.height
  };

  const orbConfig = {
    single: { pointValue: this.settings.singleOrbPoints, size: 8, color: '#f39c12' },
    bundle: { pointValue: this.settings.bundleOrbPoints, size: 12, color: '#e74c3c' },
    list: { pointValue: this.settings.listOrbPoints, size: 16, color: '#9b59b6' },
    boss: { pointValue: this.settings.bossOrbPoints, size: 20, color: '#2c3e50' }
  };

  const config = orbConfig[type] || orbConfig.single;
  
  const orb = {
    id: orbId,
    position,
    type,
    movies: movies || [],
    pointValue: config.pointValue,
    size: config.size,
    color: config.color,
    spawnedAt: new Date()
  };

  this.movieOrbs.push(orb);
  return orb;
};

// Consume movie orb
gameSessionSchema.methods.consumeMovieOrb = function(playerId, orbId) {
  const orbIndex = this.movieOrbs.findIndex(orb => orb.id === orbId);
  if (orbIndex === -1) return null;

  const orb = this.movieOrbs[orbIndex];
  const player = this.players.find(p => p._id.toString() === playerId || p.socketId === playerId);
  
  if (!player) return null;

  // Award points and size
  player.points += orb.pointValue;
  player.size += Math.floor(orb.pointValue * 0.3);

  // Remove orb
  this.movieOrbs.splice(orbIndex, 1);
  
  return { orb, player };
};

// Check if session should end (time-based only)
gameSessionSchema.methods.shouldEnd = function() {
  if (this.status !== 'active') return false;
  
  const now = Date.now();
  const sessionDuration = this.duration * 24 * 60 * 60 * 1000; // Convert days to milliseconds
  const hasExpired = now - this.startTime.getTime() > sessionDuration;
  
  // Only end when time expires, not based on player count
  return hasExpired;
};

// End session and determine winner
gameSessionSchema.methods.endSession = function() {
  this.status = 'ended';
  this.endTime = new Date();

  const activePlayers = this.getActivePlayers();
  if (activePlayers.length > 0) {
    // Winner is the largest player
    const winner = activePlayers.reduce((prev, current) => 
      (prev.size > current.size) ? prev : current
    );

    this.winner = {
      userId: winner.userId,
      username: winner.username,
      finalSize: winner.size,
      totalAbsorptions: winner.absorptions
    };
  }
};

module.exports = mongoose.model('GameSession', gameSessionSchema);
