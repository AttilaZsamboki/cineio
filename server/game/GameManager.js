const GameSession = require('../models/GameSession');
const User = require('../models/User');

class GameManager {
  constructor(io) {
    this.io = io;
    this.sessions = new Map();
    this.playerSessions = new Map();
    this.absorptionCooldowns = new Map();
    this.orbSpawnTimers = new Map();
    // Performance and UX controls
    this.orbCheckThrottle = new Map(); // socketId -> last check ts
    this.orbFailToastCooldown = new Map(); // `${socketId}:${orbId}` -> last ts
    this.userSeenCache = new Map(); // userId -> { ts, set }
    this.orbCheckInFlight = new Map(); // socketId -> boolean
    
    // Start cleanup interval
    setInterval(() => {
      this.cleanupSessions();
    }, 60000); // Check every minute
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

      if (gameSession.status === 'ended') {
        socket.emit('error', { message: 'Game session has ended' });
        return;
      }

      // Add player to session
      const player = gameSession.addPlayer(userId, username, socket.id);
      // Ensure session is active on first join
      if (gameSession.status === 'waiting') {
        gameSession.status = 'active';
        gameSession.startTime = new Date();
      }
      await gameSession.save();

      // Store session mapping
      this.playerSessions.set(socket.id, sessionId);
      
      // Join socket room
      socket.join(sessionId);

      // Start orb spawning for this session if not already started
      this.startOrbSpawning(sessionId);

      // Notify clients
      socket.emit('game-joined', {
        sessionId,
        player: {
          id: player._id,
          username: player.username,
          position: player.position,
          size: player.size,
          color: player.color,
          points: player.points,
          spawnProtectedUntil: player.spawnProtectedUntil
        },
        worldSize: gameSession.worldSize,
        settings: gameSession.settings,
        movieOrbs: gameSession.movieOrbs
      });
      // if (gameSession.shouldEnd() && gameSession.status !== 'ended') {
      //   gameSession.endSession();
      //   await gameSession.save();
      // }

      // Broadcast to other players
      socket.to(sessionId).emit('player-joined', {
        player: {
          id: player._id,
          username: player.username,
          position: player.position,
          size: player.size,
          color: player.color,
          points: player.points
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

      // If player is halted due to battle, ignore movement
      const nowTs0 = Date.now();
      if (player.battleHaltUntil && player.battleHaltUntil.getTime() > nowTs0) {
        return;
      }

      // Validate movement bounds
      const maxX = gameSession.worldSize.width;
      const maxY = gameSession.worldSize.height;
      
      player.position.x = Math.max(0, Math.min(maxX, x));
      player.position.y = Math.max(0, Math.min(maxY, y));
      player.lastActive = new Date();

      // Atomic update to avoid VersionError from frequent saves
      await GameSession.updateOne(
        { sessionId, 'players.socketId': socket.id },
        {
          $set: {
            'players.$.position': player.position,
            'players.$.lastActive': player.lastActive
          }
        }
      );

      // After movement, check for touch-based absorption against nearby players
      try {
        // Skip if absorber under spawn protection
        const nowTs = Date.now();
        const absorberProtected = player.spawnProtectedUntil && player.spawnProtectedUntil.getTime() > nowTs;
        if (!absorberProtected) {
          // Find the first target in range
          const candidates = gameSession.players.filter(p => p.isAlive && p.socketId && p.socketId !== socket.id);
          for (const target of candidates) {
            // Spawn protection check
            const targetProtected = target.spawnProtectedUntil && target.spawnProtectedUntil.getTime() > nowTs;
            if (targetProtected) continue;

            // Respect ongoing halts/cooldowns
            const eitherHalted = (target.battleHaltUntil && target.battleHaltUntil.getTime() > nowTs) ||
                                 (player.battleHaltUntil && player.battleHaltUntil.getTime() > nowTs);
            if (eitherHalted) continue;
            const eitherCooldown = (target.battleCooldownUntil && target.battleCooldownUntil.getTime() > nowTs) ||
                                   (player.battleCooldownUntil && player.battleCooldownUntil.getTime() > nowTs);
            // Cooldown prevents triggering a new battle immediately, but doesn't block movement broadcasting below
            if (eitherCooldown) continue;

            const dx = player.position.x - target.position.x;
            const dy = player.position.y - target.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const minDistance = (player.size + target.size) / 2;
            if (distance <= minDistance) {
              // Start battle halt window
              const haltMs = gameSession.settings.battleHaltMs || 600;
              const cooldownMs = gameSession.settings.battleCooldownMs || 2000;
              const haltUntil = new Date(nowTs + haltMs);
              player.battleHaltUntil = haltUntil;
              target.battleHaltUntil = haltUntil;

              // Persist halt timers for both players atomically
              await GameSession.updateOne(
                { sessionId },
                {
                  $set: {
                    'players.$[p1].battleHaltUntil': haltUntil,
                    'players.$[p2].battleHaltUntil': haltUntil
                  }
                },
                {
                  arrayFilters: [
                    { 'p1._id': player._id },
                    { 'p2._id': target._id }
                  ]
                }
              );

              // Notify both clients that a battle has started (halt)
              if (player.socketId) {
                this.io.to(player.socketId).emit('battle-start', {
                  opponent: target.username,
                  haltUntil: haltUntil.getTime()
                });
              }
              if (target.socketId) {
                this.io.to(target.socketId).emit('battle-start', {
                  opponent: player.username,
                  haltUntil: haltUntil.getTime()
                });
              }

              // Determine outcome using movie compatibility
              const moverUser = await User.findById(player.userId);
              const targetUser = await User.findById(target.userId);
              if (!moverUser || !targetUser) break;

              const moverCanAbsorb = moverUser.canAbsorb(targetUser);
              const targetCanAbsorb = targetUser.canAbsorb(moverUser);

              // If neither can absorb: inform both of missing movies and apply cooldowns
              if (!moverCanAbsorb && !targetCanAbsorb) {
                const moverMissing = moverUser.getMissingMovies(targetUser).slice(0, 5);
                const targetMissing = targetUser.getMissingMovies(moverUser).slice(0, 5);

                player.battleCooldownUntil = new Date(nowTs + cooldownMs);
                target.battleCooldownUntil = new Date(nowTs + cooldownMs);
                await GameSession.updateOne(
                  { sessionId },
                  {
                    $set: {
                      'players.$[p1].battleCooldownUntil': player.battleCooldownUntil,
                      'players.$[p2].battleCooldownUntil': target.battleCooldownUntil
                    }
                  },
                  {
                    arrayFilters: [
                      { 'p1._id': player._id },
                      { 'p2._id': target._id }
                    ]
                  }
                );

                // Notify both clients
                if (player.socketId) {
                  this.io.to(player.socketId).emit('battle-missing', {
                    opponent: target.username,
                    missingMovies: moverMissing
                  });
                }
                if (target.socketId) {
                  this.io.to(target.socketId).emit('battle-missing', {
                    opponent: player.username,
                    missingMovies: targetMissing
                  });
                }
                break;
              }

              // Cooldown check for absorption attempts (per-absorber)
              const cooldownKey = `${player.userId}-${sessionId}`;
              const lastAbsorption = this.absorptionCooldowns.get(cooldownKey);
              const now = Date.now();
              if (lastAbsorption && (now - lastAbsorption) < gameSession.settings.absorptionCooldown) {
                break;
              }

              // Resolve winner: if both can absorb, initiator (player) wins; else the one who can
              const winnerSocketId = moverCanAbsorb ? socket.id : (targetCanAbsorb ? target.socketId : null);
              const loserSocketId = winnerSocketId === socket.id ? target.socketId : socket.id;

              if (!winnerSocketId || !loserSocketId) break;

              const absorbed = gameSession.absorb(winnerSocketId, loserSocketId);
              if (!absorbed) break;

              // Stats and ELO
              const winner = winnerSocketId === socket.id ? player : target;
              const loser = winnerSocketId === socket.id ? target : player;
              const winnerUser = winnerSocketId === socket.id ? moverUser : targetUser;
              const loserUser = winnerSocketId === socket.id ? targetUser : moverUser;

              const winnerElo = winnerUser.eloRating;
              const loserElo = loserUser.eloRating;
              winnerUser.totalAbsorptions += 1;
              loserUser.totalAbsorbed += 1;
              winnerUser.updateElo(loserElo, true);
              loserUser.updateElo(winnerElo, false);

              // Persist updated player stats atomically to avoid version conflicts
              await Promise.all([
                winnerUser.save(),
                loserUser.save(),
                GameSession.updateOne(
                  { sessionId },
                  {
                    $set: {
                      'players.$[w].points': winner.points,
                      'players.$[w].size': winner.size,
                      'players.$[w].absorptions': winner.absorptions,
                      'players.$[l].points': loser.points,
                      'players.$[l].size': loser.size,
                      'players.$[l].survivalTime': loser.survivalTime
                    }
                  },
                  {
                    arrayFilters: [
                      { 'w._id': winner._id },
                      { 'l._id': loser._id }
                    ]
                  }
                )
              ]);

              this.absorptionCooldowns.set(`${winner.userId}-${sessionId}`, now);

              // Notify room
              this.io.to(sessionId).emit('player-absorbed', {
                absorber: {
                  id: winner._id,
                  username: winner.username,
                  newSize: winner.size,
                  newPoints: winner.points,
                  absorptions: winner.absorptions
                },
                victim: {
                  id: loser._id,
                  username: loser.username,
                  newSize: loser.size,
                  newPoints: loser.points
                }
              });

              // Notify absorbed player
              if (loser.socketId) {
                this.io.to(loser.socketId).emit('you-were-absorbed', {
                  absorber: winner.username,
                  survivalTime: loser.survivalTime,
                  eloChange: loserUser.eloRating - loserElo
                });
              }

              // Notify absorber
              if (winnerSocketId === socket.id) {
                socket.emit('absorption-successful', {
                  victim: loser.username,
                  newSize: winner.size,
                  newPoints: winner.points,
                  eloChange: winnerUser.eloRating - winnerElo
                });
              }

              // Optionally end session if criteria met
              if (gameSession.shouldEnd()) {
                await this.endSession(sessionId);
              }

              break; // Battle resolved
            }
          }
        }
      } catch (err) {
        console.error('Error during touch absorption check:', err);
      }

      // Check for movie orb consumption
      this.checkOrbConsumption(gameSession, player, socket);

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
      const sessions = await GameSession.find({ status: 'active' });
      
      for (const session of sessions) {
        if (session.shouldEnd()) {
          await this.endSession(session.sessionId);
        }
      }
    } catch (error) {
      console.error('Error cleaning up sessions:', error);
    }
  }

  // Start orb spawning for a session
  startOrbSpawning(sessionId) {
    if (this.orbSpawnTimers.has(sessionId)) return;

    const spawnOrbs = async () => {
      try {
        const gameSession = await GameSession.findOne({ sessionId });
        if (!gameSession || gameSession.status !== 'active') return;

        // Spawn different types of orbs
        const rand = Math.random();
        let orbType = 'single';
        if (rand < 0.05) orbType = 'boss';
        else if (rand < 0.15) orbType = 'list';
        else if (rand < 0.35) orbType = 'bundle';

        // Build movies payload from current session players' 5-star movies
        const activePlayers = gameSession.players.filter(p => p.userId);
        const userIds = [...new Set(activePlayers.map(p => p.userId.toString()))];
        let movies = [];
        if (userIds.length > 0) {
          const users = await User.find({ _id: { $in: userIds } }).select('fiveStarMovies watchlistMovies username');
          // Flatten movies with minimal fields and dedupe by title-year
          const seen = new Set();
          const all = [];
          for (const u of users) {
            // Mix 5-star movies and watchlist movies
            const allUserMovies = [...(u.fiveStarMovies || []), ...(u.watchlistMovies || [])];
            for (const m of allUserMovies) {
              const key = `${m.title}-${m.year}`;
              if (seen.has(key)) continue;
              seen.add(key);
              all.push({ title: m.title, year: m.year, director: m.director, letterboxdUrl: m.letterboxdUrl });
            }
          }

          // Helper to sample k random unique movies
          const sampleK = (arr, k) => {
            const res = [];
            const n = Math.min(k, arr.length);
            for (let i = 0; i < n; i++) {
              const idx = Math.floor(Math.random() * arr.length);
              res.push(arr[idx]);
              arr.splice(idx, 1);
            }
            return res;
          };

          if (orbType === 'single') {
            movies = sampleK([...all], 1);
          } else if (orbType === 'bundle') {
            movies = sampleK([...all], 3 + Math.floor(Math.random() * 3)); // 3-5
          } else if (orbType === 'list') {
            movies = sampleK([...all], 8 + Math.floor(Math.random() * 5)); // 8-12
          } else if (orbType === 'boss') {
            // Choose a popular movie among players (by frequency)
            const freq = new Map();
            for (const u of users) {
              const allUserMovies = [...(u.fiveStarMovies || []), ...(u.watchlistMovies || [])];
              for (const m of allUserMovies) {
                const key = `${m.title}-${m.year}`;
                freq.set(key, (freq.get(key) || 0) + 1);
              }
            }
            let bestKey = null, bestCount = 0, bestMovie = null;
            for (const u of users) {
              const allUserMovies = [...(u.fiveStarMovies || []), ...(u.watchlistMovies || [])];
              for (const m of allUserMovies) {
                const key = `${m.title}-${m.year}`;
                const count = freq.get(key) || 0;
                if (count > bestCount) {
                  bestCount = count;
                  bestKey = key;
                  bestMovie = { title: m.title, year: m.year, director: m.director, letterboxdUrl: m.letterboxdUrl, watchCount: count };
                }
              }
            }
            if (bestMovie) movies = [bestMovie];
            else movies = sampleK([...all], 1);
          }
        }

        const orb = gameSession.spawnMovieOrb(orbType, movies);
        if (orb) {
          await gameSession.save();
          this.io.to(sessionId).emit('orb-spawned', orb);
        }
      } catch (error) {
        console.error('Error spawning orb:', error);
      }
    };

    // Seed initial orbs to reach 10 at session start
    (async () => {
      try {
        const gameSession = await GameSession.findOne({ sessionId });
        if (!gameSession || gameSession.status !== 'active') return;

        const needed = Math.max(0, 10 - (gameSession.movieOrbs?.length || 0));
        if (needed === 0) return;

        const activePlayers = gameSession.players.filter(p => p.userId);
        const userIds = [...new Set(activePlayers.map(p => p.userId.toString()))];
        let users = [];
        if (userIds.length > 0) {
          users = await User.find({ _id: { $in: userIds } }).select('fiveStarMovies watchlistMovies username');
        }

        const sampleK = (arr, k) => {
          const res = [];
          const n = Math.min(k, arr.length);
          for (let i = 0; i < n; i++) {
            const idx = Math.floor(Math.random() * arr.length);
            res.push(arr[idx]);
            arr.splice(idx, 1);
          }
          return res;
        };

        const created = [];
        for (let i = 0; i < needed; i++) {
          // Decide orb type per same distribution
          const r = Math.random();
          let orbType = 'single';
          if (r < 0.05) orbType = 'boss';
          else if (r < 0.15) orbType = 'list';
          else if (r < 0.35) orbType = 'bundle';

          let movies = [];
          if (users.length > 0) {
            const seen = new Set();
            const all = [];
            for (const u of users) {
              const allUserMovies = [...(u.fiveStarMovies || []), ...(u.watchlistMovies || [])];
              for (const m of allUserMovies) {
                const key = `${m.title}-${m.year}`;
                if (seen.has(key)) continue;
                seen.add(key);
                all.push({ title: m.title, year: m.year, director: m.director, letterboxdUrl: m.letterboxdUrl });
              }
            }

            if (orbType === 'single') {
              movies = sampleK([...all], 1);
            } else if (orbType === 'bundle') {
              movies = sampleK([...all], 3 + Math.floor(Math.random() * 3));
            } else if (orbType === 'list') {
              movies = sampleK([...all], 8 + Math.floor(Math.random() * 5));
            } else if (orbType === 'boss') {
              const freq = new Map();
              for (const u of users) {
                const allUserMovies = [...(u.fiveStarMovies || []), ...(u.watchlistMovies || [])];
                for (const m of allUserMovies) {
                  const key = `${m.title}-${m.year}`;
                  freq.set(key, (freq.get(key) || 0) + 1);
                }
              }
              let bestMovie = null, bestCount = 0;
              for (const u of users) {
                const allUserMovies = [...(u.fiveStarMovies || []), ...(u.watchlistMovies || [])];
                for (const m of allUserMovies) {
                  const key = `${m.title}-${m.year}`;
                  const count = freq.get(key) || 0;
                  if (count > bestCount) {
                    bestCount = count;
                    bestMovie = { title: m.title, year: m.year, director: m.director, letterboxdUrl: m.letterboxdUrl, watchCount: count };
                  }
                }
              }
              movies = bestMovie ? [bestMovie] : sampleK([...all], 1);
            }
          }

          const orb = gameSession.spawnMovieOrb(orbType, movies);
          if (orb) created.push(orb);
        }

        if (created.length > 0) {
          await gameSession.save();
          for (const orb of created) {
            this.io.to(sessionId).emit('orb-spawned', orb);
          }
        }
      } catch (e) {
        console.error('Error seeding initial orbs:', e);
      }
    })();

    const timer = setInterval(spawnOrbs, 30000); // Spawn every 30 seconds
    this.orbSpawnTimers.set(sessionId, timer);
  }

  // Check orb consumption
  async checkOrbConsumption(gameSession, player, socket) {
    // Prevent overlapping async checks per player
    if (this.orbCheckInFlight.get(player.socketId)) return;
    this.orbCheckInFlight.set(player.socketId, true);
    try {
      const nowTsThrottle = Date.now();
      const lastCheck = this.orbCheckThrottle.get(player.socketId);
      if (lastCheck && (nowTsThrottle - lastCheck) < 200) {
        return; // throttle per-player orb checks to ~5/sec
      }
      this.orbCheckThrottle.set(player.socketId, nowTsThrottle);

    // Fetch player's seen set with short-lived cache
    const getSeenSet = async (userId) => {
      const cache = this.userSeenCache.get(String(userId));
      const now = Date.now();
      if (cache && (now - cache.ts) < 10000) { // 10s TTL
        return cache.set;
      }
      const user = await User.findById(userId).select('watchedMovies fiveStarMovies');
      if (!user) return new Set();
      const normalizeTitle = (t) => (t || '')
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
      const movieKeyCandidates = (m) => {
        const url = (m.letterboxdUrl || m.letterboxdURL || m.url || '')
          .toString()
          .toLowerCase()
          .trim();
        const title = normalizeTitle(m.title || m.Name || m.name);
        const yearNum = Number(m.year || m.Year);
        const keys = [];
        if (url) keys.push(`url:${url}`);
        if (title && yearNum) keys.push(`ty:${title}-${yearNum}`);
        if (title) keys.push(`t:${title}`);
        return keys;
      };
      const seen = new Set();
      const arr = [...(user.watchedMovies || []), ...(user.fiveStarMovies || [])];
      for (const wm of arr) {
        for (const k of movieKeyCandidates(wm)) seen.add(k);
      }
      this.userSeenCache.set(String(userId), { ts: now, set: seen });
      return seen;
    };

      const seenSet = await getSeenSet(player.userId);

      for (const orb of gameSession.movieOrbs) {
        const dx = player.position.x - orb.position.x;
        const dy = player.position.y - orb.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance <= (player.size / 2 + orb.size / 2)) {
        // Validate that player has watched all movies in the orb (robust matching)
        const normalizeTitle = (t) => (t || '')
          .toString()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .trim();

        const movieKeyCandidates = (m) => {
          const url = (m.letterboxdUrl || m.letterboxdURL || m.url || '')
            .toString()
            .toLowerCase()
            .trim();
          const title = normalizeTitle(m.title || m.Name || m.name);
          const yearNum = Number(m.year || m.Year);
          const keys = [];
          if (url) keys.push(`url:${url}`);
          if (title && yearNum) keys.push(`ty:${title}-${yearNum}`);
          if (title) keys.push(`t:${title}`);
          return keys;
        };

        const seenHas = (m) => movieKeyCandidates(m).some(k => seenSet.has(k));
        const hasWatchedAll = (orb.movies || []).every(seenHas);

        if (!hasWatchedAll) {
          // Player hasn't watched all movies in the orb - show missing movies
          const missingMovies = (orb.movies || []).filter(m => !seenHas(m));

          // Rate-limit failure messages per orb per player (2s)
          const failKey = `${player.socketId}:${orb.id}`;
          const lastFail = this.orbFailToastCooldown.get(failKey);
          const now = Date.now();
          if (!lastFail || (now - lastFail) >= 2000) {
            this.orbFailToastCooldown.set(failKey, now);
            socket.emit('orb-consumption-failed', {
              orb,
              missingMovies,
              message: `You need to watch ${missingMovies.length} more movie(s) to consume this orb`
            });
          }
          break; // stop after first overlapping orb
        }

        // Player has watched all movies - allow consumption
        const incPoints = orb.pointValue;
        const incSize = Math.floor(orb.pointValue * 0.3);
        const newPoints = (player.points || 0) + incPoints;
        const newSize = (player.size || 0) + incSize;

        // Atomic update: pull orb and update player stats in a single operation
        await GameSession.findOneAndUpdate(
          { sessionId: gameSession.sessionId, 'players.socketId': player.socketId },
          {
            $pull: { movieOrbs: { id: orb.id } },
            $set: { 'players.$.points': newPoints, 'players.$.size': newSize }
          }
        );

        // Update in-memory state for subsequent logic in this tick
        player.points = newPoints;
        player.size = newSize;

        // Remove orb from gameSession's in-memory array to prevent duplicate processing
        const orbIndex = gameSession.movieOrbs.findIndex(o => o.id === orb.id);
        if (orbIndex !== -1) {
          gameSession.movieOrbs.splice(orbIndex, 1);
        }

        // Notify player
        socket.emit('orb-consumed', {
          orb,
          newPoints,
          newSize,
          playerId: player._id || player.socketId
        });

        // Notify entire room (including the consumer) that orb was consumed and should disappear
        this.io.to(gameSession.sessionId).emit('orb-removed', { orbId: orb.id });
        break; // Only consume one orb per movement
      }
    }
  } finally {
    this.orbCheckInFlight.set(player.socketId, false);
  }
}
}

module.exports = GameManager;
