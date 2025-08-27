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
    movieOrbs: [],
    worldSize: { width: 1000, height: 1000 },
    settings: {}
  });
  const [battleHaltUntilTs, setBattleHaltUntilTs] = useState(0);
  const shownToastKeysRef = React.useRef(new Map()); // key -> expiryTs
  // Touch-to-absorb: no client-side absorption attempt state needed

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io('/', {
      // Force WebSocket to avoid excessive HTTP long-polling requests behind proxies
      transports: ['websocket'],
      withCredentials: true,
      // keep default path '/socket.io' which matches server
    }); // same-origin
    
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
      setGameState(prev => ({
        ...prev,
        sessionId: data.sessionId,
        currentPlayer: data.player,
        movieOrbs: data.movieOrbs || [],
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
        players: data.players,
        movieOrbs: data.movieOrbs || prev.movieOrbs
      }));
    });

    newSocket.on('player-absorbed', (data) => {
      setGameState(prev => ({
        ...prev,
        players: prev.players.map(player => {
          if (player.id === data.absorber.id) {
            return { ...player, size: data.absorber.newSize, points: data.absorber.newPoints, absorptions: data.absorber.absorptions };
          }
          if (player.id === data.victim.id) {
            return { ...player, size: data.victim.newSize, points: data.victim.newPoints };
          }
          return player;
        })
      }));
    });

    newSocket.on('you-were-absorbed', (data) => {
      toast.error(`You lost points to ${data.absorber}! Keep playing!`);
      // Player stays alive, just loses points
    });

    newSocket.on('absorption-successful', (data) => {
      toast.success(`Gained points from ${data.victim}! Size: ${data.newSize}, Points: ${data.newPoints}`);
      setGameState(prev => ({
        ...prev,
        currentPlayer: prev.currentPlayer ? { ...prev.currentPlayer, size: data.newSize, points: data.newPoints } : null
      }));
    });

    // Battle start: briefly halt local movement display
    const showToastOnce = (key, render, options = {}, ttlMs = 3000) => {
      const now = Date.now();
      // cleanup expired
      for (const [k, exp] of shownToastKeysRef.current.entries()) {
        if (exp <= now) shownToastKeysRef.current.delete(k);
      }
      if (shownToastKeysRef.current.has(key)) return;
      shownToastKeysRef.current.set(key, now + ttlMs);
      return typeof render === 'function' ? toast(render, options) : toast(render, options);
    };

    newSocket.on('battle-start', (data) => {
      setBattleHaltUntilTs(data.haltUntil || Date.now() + 600);
      const key = `battle-start:${data.opponent}`;
      showToastOnce(key, `Battle started vs ${data.opponent}`, { icon: '⚔️', duration: 800 }, 2000);
    });

    // Battle encounter where neither can absorb: show missing movies
    newSocket.on('battle-missing', (data) => {
      const titles = (data.missingMovies || []).map((m) => {
        if (typeof m === 'string') return m;
        if (!m) return '';
        const title = m.title || m.Name || m.name || '[Unknown]';
        const year = m.year || m.Year || m.released_year;
        return year ? `${title} (${year})` : title;
      }).filter(Boolean);
      const key = `battle-missing:${data.opponent}:${titles.join('|')}`;
      showToastOnce(key, () => (
        <div>
          <div><strong>Battle stalemate with {data.opponent}</strong></div>
          <div style={{ maxWidth: 360 }}>Missing 5-star movies: {titles.length ? titles.join(', ') : 'None'}</div>
        </div>
      ), { duration: 5000 }, 5000);
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

    // Movie orb events
    newSocket.on('orb-spawned', (orb) => {
      setGameState(prev => ({
        ...prev,
        movieOrbs: [...prev.movieOrbs, orb]
      }));
    });

    newSocket.on('orb-consumed', (data) => {
      // Only show toast for current player to avoid duplicates
      if (gameState.currentPlayer && data.playerId === gameState.currentPlayer.id) {
        toast.success(`Consumed ${data.orb.type} orb! +${data.orb.pointValue} points`);
      }
      setGameState(prev => ({
        ...prev,
        currentPlayer: prev.currentPlayer ? {
          ...prev.currentPlayer,
          points: data.newPoints,
          size: data.newSize
        } : null
      }));
    });

    newSocket.on('orb-removed', (data) => {
      setGameState(prev => ({
        ...prev,
        movieOrbs: prev.movieOrbs.filter(orb => orb.id !== data.orbId)
      }));
    });

    newSocket.on('orb-consumption-failed', (data) => {
      const titles = (data.missingMovies || []).map((m) => {
        if (typeof m === 'string') return m;
        if (!m) return '';
        const title = m.title || m.Name || m.name || '[Unknown]';
        const year = m.year || m.Year || m.released_year;
        return year ? `${title} (${year})` : title;
      }).filter(Boolean);
      const key = `orb-fail:${data.orb?.id || 'unknown'}:${titles.join('|')}`;
      showToastOnce(key, (
        <div>
          <div><strong>Can't consume orb!</strong></div>
          <div style={{ maxWidth: 320, fontSize: '12px', marginTop: '4px' }}>
            Missing: {titles.join(', ')}
          </div>
        </div>
      ), { duration: 4000 }, 3500);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [gameState.currentPlayer]);

  const joinGame = (sessionId, userId, username) => {
    if (socket) {
      socket.emit('join-game', { sessionId, userId, username });
    }
  };

  const movePlayer = (x, y) => {
    if (socket && gameState.currentPlayer) {
      socket.emit('player-move', { x, y });
      // Suppress optimistic movement during server-declared battle halt window
      if (Date.now() >= battleHaltUntilTs) {
        // Update local state immediately for smooth movement
        setGameState(prev => ({
          ...prev,
          currentPlayer: {
            ...prev.currentPlayer,
            position: { x, y }
          }
        }));
      }
    }
  };

  // Click-to-absorb removed; absorption happens automatically on touch (server-side)

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
    joinGame,
    movePlayer,
    leaveGame
  };

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
};
