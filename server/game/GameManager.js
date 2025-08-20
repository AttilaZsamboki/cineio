const GameSession = require('../models/GameSession');
const User = require('../models/User');

class GameManager {
  constructor(io) {
    this.io = io;
    this.activeSessions = new Map(); // sessionId -> session data
    this.playerSessions = new Map(); // socketId -> sessionId
    this.absorptionCooldowns = new Map(); // playerId -> timestamp
    
    // Start cleanup interval for ended sessions
    setInterval(() => this.cleanupSessions(), 60000); // Every minute
  }

  async handlePlayerJoin(socket, data) {
    try {
      const { sessionId, userId, username } = data;
      
      // Find or load game session
      let gameSession = await GameSession.findOne({ sessionId });
      if (!gameSession) {
        socket.emit('error', { message: 'Game session not found' });
        return;
      }

      // Check if session has ended
      if (gameSession.shouldEnd() && gameSession.status !== 'ended') {
        gameSession.endSession();
        await gameSession.save();
      }

      if (gameSession.status === 'ended') {
        socket.emit('error', { message: 'Game session has ended' });
        return;
      }

      // Add player to session
      const player = gameSession.addPlayer(userId, username, socket.id);
      await gameSession.save();

      // Store session mapping
      this.playerSessions.set(socket.id, sessionId);
      
      // Join socket room
      socket.join(sessionId);

      // Send initial game state
      socket.emit('', {
        sessionId,
        player: {
          id: player._id,
          username: player.username,
          position: player.position,
          size: player.size,
          color: player.color,
          spawnProtectedUntil: player.spawnProtectedUntil
        },
        worldSize: gameSession.worldSize,
        settings: gameSession.settings
      });

      // Broadcast player join to other players
      socket.to(sessionId).emit('player-joined', {
        player: {
          id: player._id,
          username: player.username,
          position: player.position,
          size: player.size,
          color: player.color
        }
      });

      // Send current game state
      this.broadcastGameState(sessionId);

    } catch (error) {
      console.error('Error handling player join:', error);
      socket.emit('error', { message: 'Failed to join game' });
    }
  }

  async handlePlayerMove(socket, data) {
    try {
      const sessionId = this.playerSessions.get(socket.id);
      if (!sessionId) return;

      const { x, y } = data;
      
      const gameSession = await GameSession.findOne({ sessionId });
      if (!gameSession) return;

      // Find and update player position
      const player = gameSession.players.find(p => p.socketId === socket.id);
      if (!player || !player.isAlive) return;

      // Validate movement bounds
      const maxX = gameSession.worldSize.width;
      const maxY = gameSession.worldSize.height;
      
      player.position.x = Math.max(0, Math.min(maxX, x));
      player.position.y = Math.max(0, Math.min(maxY, y));
      player.lastActive = new Date();

      await gameSession.save();

      // Broadcast position update
      socket.to(sessionId).emit('player-moved', {
        playerId: player._id,
        position: player.position
      });

    } catch (error) {
      console.error('Error handling player move:', error);
    }
  }

  async handleAbsorptionAttempt(socket, data) {
    try {
      const sessionId = this.playerSessions.get(socket.id);
      if (!sessionId) return;

      const { targetPlayerId } = data;
      
      const gameSession = await GameSession.findOne({ sessionId });
      if (!gameSession) return;

      const absorber = gameSession.players.find(p => p.socketId === socket.id);
      const target = gameSession.players.find(p => p._id.toString() === targetPlayerId);

      if (!absorber || !target || !absorber.isAlive || !target.isAlive) {
        socket.emit('absorption-failed', { message: 'Invalid absorption attempt' });
        return;
      }

      // Respect spawn protection window for both players
      const nowTs = Date.now();
      const absorberProtected = absorber.spawnProtectedUntil && absorber.spawnProtectedUntil.getTime() > nowTs;
      const targetProtected = target.spawnProtectedUntil && target.spawnProtectedUntil.getTime() > nowTs;
      if (absorberProtected || targetProtected) {
        const remaining = Math.max(
          absorberProtected ? (absorber.spawnProtectedUntil.getTime() - nowTs) : 0,
          targetProtected ? (target.spawnProtectedUntil.getTime() - nowTs) : 0
        );
        socket.emit('absorption-failed', { message: 'Spawn protection active', remainingTime: remaining });
        return;
      }

      // Check absorption cooldown
      const cooldownKey = `${absorber.userId}-${sessionId}`;
      const lastAbsorption = this.absorptionCooldowns.get(cooldownKey);
      const now = Date.now();
      
      if (lastAbsorption && (now - lastAbsorption) < gameSession.settings.absorptionCooldown) {
        socket.emit('absorption-failed', { 
          message: 'Absorption on cooldown',
          remainingTime: gameSession.settings.absorptionCooldown - (now - lastAbsorption)
        });
        return;
      }

      // Check if players are close enough (collision detection)
      const distance = Math.sqrt(
        Math.pow(absorber.position.x - target.position.x, 2) +
        Math.pow(absorber.position.y - target.position.y, 2)
      );

      const minDistance = (absorber.size + target.size) / 2;
      if (distance > minDistance) {
        socket.emit('absorption-failed', { message: 'Players too far apart' });
        return;
      }

      // Check movie compatibility
      const absorberUser = await User.findById(absorber.userId);
      const targetUser = await User.findById(target.userId);

      if (!absorberUser.canAbsorb(targetUser)) {
        const missingMovies = absorberUser.getMissingMovies(targetUser);
        socket.emit('absorption-failed', { 
          message: 'Movie compatibility check failed',
          missingMovies: missingMovies.slice(0, 5) // Show first 5 missing movies
        });
        return;
      }

      // Perform absorption
      const absorbed = gameSession.absorb(socket.id, target.socketId);
      if (!absorbed) {
        socket.emit('absorption-failed', { message: 'Absorption failed' });
        return;
      }

      // Update user stats
      absorberUser.totalAbsorptions += 1;
      targetUser.totalAbsorbed += 1;
      
      // Update ELO ratings
      const absorberElo = absorberUser.eloRating;
      const targetElo = targetUser.eloRating;
      
      absorberUser.updateElo(targetElo, true); // Winner
      targetUser.updateElo(absorberElo, false); // Loser

      await Promise.all([
        absorberUser.save(),
        targetUser.save(),
        gameSession.save()
      ]);

      // Set absorption cooldown
      this.absorptionCooldowns.set(cooldownKey, now);

      // Notify players
      this.io.to(sessionId).emit('player-absorbed', {
        absorber: {
          id: absorber._id,
          username: absorber.username,
          newSize: absorber.size,
          absorptions: absorber.absorptions
        },
        victim: {
          id: target._id,
          username: target.username
        }
      });

      // Notify absorbed player
      if (target.socketId) {
        this.io.to(target.socketId).emit('you-were-absorbed', {
          absorber: absorber.username,
          survivalTime: target.survivalTime,
          eloChange: targetUser.eloRating - targetElo
        });
      }

      // Notify absorber
      socket.emit('absorption-successful', {
        victim: target.username,
        newSize: absorber.size,
        eloChange: absorberUser.eloRating - absorberElo
      });

      // Check if session should end
      if (gameSession.shouldEnd()) {
        await this.endSession(sessionId);
      }

    } catch (error) {
      console.error('Error handling absorption attempt:', error);
      socket.emit('absorption-failed', { message: 'Server error during absorption' });
    }
  }

  async handlePlayerDisconnect(socket) {
    try {
      const sessionId = this.playerSessions.get(socket.id);
      if (!sessionId) return;

      const gameSession = await GameSession.findOne({ sessionId });
      if (gameSession) {
        gameSession.removePlayer(socket.id);
        await gameSession.save();

        // Notify other players
        socket.to(sessionId).emit('player-disconnected', {
          socketId: socket.id
        });
      }

      this.playerSessions.delete(socket.id);
    } catch (error) {
      console.error('Error handling player disconnect:', error);
    }
  }

  async broadcastGameState(sessionId) {
    try {
      const gameSession = await GameSession.findOne({ sessionId });
      if (!gameSession) return;

      const activePlayers = gameSession.getActivePlayers().map(player => ({
        id: player._id,
        username: player.username,
        position: player.position,
        size: player.size,
        color: player.color,
        absorptions: player.absorptions
      }));

      this.io.to(sessionId).emit('game-state', {
        players: activePlayers,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error broadcasting game state:', error);
    }
  }

  async endSession(sessionId) {
    try {
      const gameSession = await GameSession.findOne({ sessionId });
      if (!gameSession) return;

      gameSession.endSession();
      await gameSession.save();

      // Update player stats
      const activePlayers = gameSession.getActivePlayers();
      for (const player of gameSession.players) {
        const user = await User.findById(player.userId);
        if (user) {
          user.gamesPlayed += 1;
          user.longestSurvival = Math.max(user.longestSurvival, player.survivalTime || 0);
          await user.save();
        }
      }

      // Notify all players
      this.io.to(sessionId).emit('session-ended', {
        winner: gameSession.winner,
        finalStats: activePlayers.map(p => ({
          username: p.username,
          size: p.size,
          absorptions: p.absorptions,
          survivalTime: p.survivalTime || (Date.now() - p.joinedAt.getTime())
        }))
      });

    } catch (error) {
      console.error('Error ending session:', error);
    }
  }

  async cleanupSessions() {
    try {
      const expiredSessions = await GameSession.find({
        status: 'active',
        createdAt: {
          $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days old
        }
      });

      for (const session of expiredSessions) {
        await this.endSession(session.sessionId);
      }
    } catch (error) {
      console.error('Error cleaning up sessions:', error);
    }
  }
}

module.exports = GameManager;
