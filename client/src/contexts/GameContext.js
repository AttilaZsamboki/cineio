import React, { createContext, useContext, useState, useEffect } from 'react';
import io from 'socket.io-client';
import toast from 'react-hot-toast';

const GameContext = createContext();

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
};

export const GameProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [gameState, setGameState] = useState({
    connected: false,
    sessionId: null,
    players: [],
    currentPlayer: null,
    worldSize: { width: 2000, height: 2000 },
    settings: {}
  });
  const [absorptionAttempt, setAbsorptionAttempt] = useState(null);

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io('http://localhost:5000');
    
    newSocket.on('connect', () => {
      setGameState(prev => ({ ...prev, connected: true }));
      console.log('Connected to game server');
    });

    newSocket.on('disconnect', () => {
      setGameState(prev => ({ ...prev, connected: false }));
      console.log('Disconnected from game server');
    });

    // Game event listeners
    newSocket.on('game-joined', (data) => {
      console.log("game-joined", data)
      setGameState(prev => ({
        ...prev,
        sessionId: data.sessionId,
        currentPlayer: data.player,
        worldSize: data.worldSize,
        settings: data.settings
      }));
      toast.success('Joined game session!');
    });

    newSocket.on('player-joined', (data) => {
      setGameState(prev => ({
        ...prev,
        players: [...prev.players.filter(p => p.id !== data.player.id), data.player]
      }));
    });

    newSocket.on('player-moved', (data) => {
      setGameState(prev => ({
        ...prev,
        players: prev.players.map(player =>
          player.id === data.playerId
            ? { ...player, position: data.position }
            : player
        )
      }));
    });

    newSocket.on('game-state', (data) => {
      setGameState(prev => ({
        ...prev,
        players: data.players
      }));
    });

    newSocket.on('player-absorbed', (data) => {
      setGameState(prev => ({
        ...prev,
        players: prev.players.map(player => {
          if (player.id === data.absorber.id) {
            return { ...player, size: data.absorber.newSize, absorptions: data.absorber.absorptions };
          }
          return player;
        }).filter(player => player.id !== data.victim.id)
      }));
      
      toast.success(`${data.absorber.username} absorbed ${data.victim.username}!`);
    });

    newSocket.on('you-were-absorbed', (data) => {
      toast.error(`You were absorbed by ${data.absorber}! Survival time: ${Math.round(data.survivalTime / 1000)}s`);
      setGameState(prev => ({ ...prev, currentPlayer: null }));
    });

    newSocket.on('absorption-successful', (data) => {
      toast.success(`Successfully absorbed ${data.victim}! New size: ${data.newSize}`);
      setGameState(prev => ({
        ...prev,
        currentPlayer: prev.currentPlayer ? { ...prev.currentPlayer, size: data.newSize } : null
      }));
    });

    newSocket.on('absorption-failed', (data) => {
      toast.error(data.message);
      if (data.missingMovies) {
        console.log('Missing movies:', data.missingMovies);
      }
      setAbsorptionAttempt(null);
    });

    newSocket.on('player-disconnected', (data) => {
      setGameState(prev => ({
        ...prev,
        players: prev.players.filter(player => player.socketId !== data.socketId)
      }));
    });

    newSocket.on('session-ended', (data) => {
      toast.success(`Game ended! Winner: ${data.winner?.username || 'No winner'}`);
      console.log('Final stats:', data.finalStats);
    });

    newSocket.on('error', (data) => {
      toast.error(data.message);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  const joinGame = (sessionId, userId, username) => {
    if (socket) {
      socket.emit('join-game', { sessionId, userId, username });
    }
  };

  const movePlayer = (x, y) => {
    if (socket && gameState.currentPlayer) {
      socket.emit('player-move', { x, y });
      // Update local state immediately for smooth movement
      setGameState(prev => ({
        ...prev,
        currentPlayer: {
          ...prev.currentPlayer,
          position: { x, y }
        }
      }));
    }
  };

  const attemptAbsorption = (targetPlayerId) => {
    if (socket && !absorptionAttempt) {
      setAbsorptionAttempt(targetPlayerId);
      socket.emit('attempt-absorption', { targetPlayerId });
      
      // Clear attempt after timeout
      setTimeout(() => {
        setAbsorptionAttempt(null);
      }, 3000);
    }
  };

  const leaveGame = () => {
    if (socket) {
      socket.disconnect();
      socket.connect();
    }
    setGameState({
      connected: gameState.connected,
      sessionId: null,
      players: [],
      currentPlayer: null,
      worldSize: { width: 2000, height: 2000 },
      settings: {}
    });
  };

  const value = {
    socket,
    gameState,
    absorptionAttempt,
    joinGame,
    movePlayer,
    attemptAbsorption,
    leaveGame
  };

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
};
