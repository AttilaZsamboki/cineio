const mongoose = require('mongoose');

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
  survivalTime: { type: Number, default: 0 },
  absorbedBy: { type: String }, // username of player who absorbed this one
  absorbedAt: { type: Date },
  // During this window after spawning, player cannot be absorbed nor absorb others
  spawnProtectedUntil: { type: Date }
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
    width: { type: Number, default: 2000 },
    height: { type: Number, default: 2000 }
  },
  players: [playerSchema],
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
    maxSpawnAttempts: { type: Number, default: 25 }
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
gameSessionSchema.methods.absorb = function(absorberSocketId, targetSocketId) {
  const absorber = this.players.find(p => p.socketId === absorberSocketId);
  const target = this.players.find(p => p.socketId === targetSocketId);

  if (!absorber || !target || !target.isAlive) return false;

  // Mark target as absorbed
  target.isAlive = false;
  target.absorbedBy = absorber.username;
  target.absorbedAt = new Date();
  target.survivalTime = Date.now() - target.joinedAt.getTime();

  // Grow absorber
  absorber.size = Math.round(absorber.size * this.settings.sizeGrowthRate);
  absorber.absorptions += 1;

  return true;
};

// Get active players
gameSessionSchema.methods.getActivePlayers = function() {
  return this.players.filter(p => p.isAlive && p.socketId);
};

// Check if session should end
gameSessionSchema.methods.shouldEnd = function() {
  const now = new Date();
  const sessionAge = now - this.createdAt;
  const maxDuration = this.duration * 24 * 60 * 60 * 1000; // Convert days to milliseconds

  return sessionAge >= maxDuration || this.getActivePlayers().length <= 1;
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
