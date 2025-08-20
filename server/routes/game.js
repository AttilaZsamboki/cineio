const express = require('express');
const GameSession = require('../models/GameSession');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Create new game session
router.post('/create-session', auth, async (req, res) => {
  try {
    const { name, duration = 7, maxPlayers = 50 } = req.body;

    const sessionId = uuidv4();
    const gameSession = new GameSession({
      sessionId,
      name,
      duration,
      maxPlayers,
      status: 'waiting'
    });

    await gameSession.save();

    res.json({
      message: 'Game session created successfully',
      session: {
        id: gameSession._id,
        sessionId: gameSession.sessionId,
        name: gameSession.name,
        status: gameSession.status,
        duration: gameSession.duration,
        maxPlayers: gameSession.maxPlayers,
        playerCount: 0
      }
    });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ message: 'Server error creating session' });
  }
});

// Get active game sessions
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await GameSession.find({ 
      status: { $in: ['waiting', 'active'] } 
    })
    .select('sessionId name status duration maxPlayers players createdAt')
    .sort({ createdAt: -1 });

    const sessionsWithPlayerCount = sessions.map(session => ({
      id: session._id,
      sessionId: session.sessionId,
      name: session.name,
      status: session.status,
      duration: session.duration,
      maxPlayers: session.maxPlayers,
      playerCount: session.getActivePlayers().length,
      createdAt: session.createdAt,
      daysRemaining: Math.max(0, session.duration - Math.floor((Date.now() - session.createdAt) / (1000 * 60 * 60 * 24)))
    }));

    res.json(sessionsWithPlayerCount);
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Join game session
router.post('/join/:sessionId', auth, async (req, res) => {
  try {
    const gameSession = await GameSession.findOne({ 
      sessionId: req.params.sessionId 
    });

    if (!gameSession) {
      return res.status(404).json({ message: 'Game session not found' });
    }

    if (gameSession.status === 'ended') {
      return res.status(400).json({ message: 'Game session has ended' });
    }

    const activePlayers = gameSession.getActivePlayers();
    if (activePlayers.length >= gameSession.maxPlayers) {
      return res.status(400).json({ message: 'Game session is full' });
    }

    const user = await User.findById(req.userId);
    const player = gameSession.addPlayer(user._id, user.username, null);

    // Start session if it's the first player and status is waiting
    if (gameSession.status === 'waiting' && activePlayers.length === 0) {
      gameSession.status = 'active';
      gameSession.startTime = new Date();
    }

    await gameSession.save();

    res.json({
      message: 'Successfully joined game session',
      session: {
        id: gameSession._id,
        sessionId: gameSession.sessionId,
        name: gameSession.name,
        status: gameSession.status,
        worldSize: gameSession.worldSize,
        settings: gameSession.settings
      },
      player: {
        id: player._id,
        position: player.position,
        size: player.size,
        color: player.color
      }
    });
  } catch (error) {
    console.error('Join session error:', error);
    res.status(500).json({ message: 'Server error joining session' });
  }
});

// Get game session details
router.get('/session/:sessionId', auth, async (req, res) => {
  try {
    const gameSession = await GameSession.findOne({ 
      sessionId: req.params.sessionId 
    }).populate('players.userId', 'username eloRating');

    if (!gameSession) {
      return res.status(404).json({ message: 'Game session not found' });
    }

    const activePlayers = gameSession.getActivePlayers();
    const playerStats = activePlayers.map(player => ({
      username: player.username,
      size: player.size,
      absorptions: player.absorptions,
      survivalTime: Date.now() - player.joinedAt.getTime(),
      eloRating: player.userId?.eloRating || 1200
    }));

    res.json({
      session: {
        id: gameSession._id,
        sessionId: gameSession.sessionId,
        name: gameSession.name,
        status: gameSession.status,
        duration: gameSession.duration,
        startTime: gameSession.startTime,
        worldSize: gameSession.worldSize,
        settings: gameSession.settings
      },
      players: playerStats,
      winner: gameSession.winner
    });
  } catch (error) {
    console.error('Get session details error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get absorption history for a session
router.get('/session/:sessionId/absorptions', auth, async (req, res) => {
  try {
    const gameSession = await GameSession.findOne({ 
      sessionId: req.params.sessionId 
    });

    if (!gameSession) {
      return res.status(404).json({ message: 'Game session not found' });
    }

    const absorptions = gameSession.players
      .filter(player => player.absorbedBy)
      .map(player => ({
        victim: player.username,
        absorber: player.absorbedBy,
        timestamp: player.absorbedAt,
        survivalTime: player.survivalTime
      }))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json(absorptions);
  } catch (error) {
    console.error('Get absorptions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
