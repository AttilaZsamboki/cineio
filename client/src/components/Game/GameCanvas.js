import React, { useRef, useEffect, useState } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useGame } from '../../contexts/GameContext';
import toast from 'react-hot-toast';

const GameCanvas = () => {
  const canvasRef = useRef(null);
  const { sessionId } = useParams();
  const { user } = useAuth();
  const { gameState, joinGame, movePlayer, leaveGame } = useGame();
  const navigate = useNavigate();
  
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [targetPos, setTargetPos] = useState(null); // MOBA-style target position
  const [selectedOrb, setSelectedOrb] = useState(null); // Orb detail popup
  // Touch-to-absorb: no click UI required
  const watchlistInputRef = useRef(null);
  const fiveStarInputRef = useRef(null);

  // Refs to avoid stale closures inside RAF loop
  const targetPosRef = useRef(targetPos);
  const cameraRef = useRef(camera);
  const playerRef = useRef(gameState.currentPlayer);
  const settingsRef = useRef(gameState.settings);

  useEffect(() => { targetPosRef.current = targetPos; }, [targetPos]);
  useEffect(() => { cameraRef.current = camera; }, [camera]);
  useEffect(() => { playerRef.current = gameState.currentPlayer; }, [gameState.currentPlayer]);
  useEffect(() => { settingsRef.current = gameState.settings; }, [gameState.settings]);

  useEffect(() => {
    if (user && sessionId) {
      joinGame(sessionId, user._id || user.id, user.username);
    }

    return () => {
      leaveGame();
    };
  }, [sessionId, user]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleRightClick = (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Convert to world coordinates
      const cam = cameraRef.current || camera;
      const worldX = x + cam.x - canvas.width / 2;
      const worldY = y + cam.y - canvas.height / 2;
      
      setTargetPos({ x: worldX, y: worldY });
    };

    const handleLeftClick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cam = cameraRef.current || camera;
      // Find first orb under cursor
      let hit = null;
      for (const orb of gameState.movieOrbs) {
        const screenX = orb.position.x - cam.x + canvas.width / 2;
        const screenY = orb.position.y - cam.y + canvas.height / 2;
        const dx = x - screenX;
        const dy = y - screenY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= orb.size) { hit = orb; break; }
      }
      setSelectedOrb(hit);
    };

    canvas.addEventListener('contextmenu', handleRightClick);
    canvas.addEventListener('click', handleLeftClick);
    // Left click removed: absorption is touch-based now

    return () => {
      canvas.removeEventListener('contextmenu', handleRightClick);
      canvas.removeEventListener('click', handleLeftClick);
    };
  }, [gameState.currentPlayer, camera, gameState.players, gameState.movieOrbs]);

  useEffect(() => {
    // Update camera to follow current player
    if (gameState.currentPlayer) {
      setCamera({
        x: gameState.currentPlayer.position.x,
        y: gameState.currentPlayer.position.y
      });
    }
  }, [gameState.currentPlayer?.position]);
  console.log(gameState.movieOrbs)

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Set canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    drawGrid(ctx, canvas);

    // Draw movie orbs
    gameState.movieOrbs.forEach(orb => {
      drawMovieOrb(ctx, orb, camera, canvas);
    });

    // Draw players
    gameState.players.forEach(player => {
      drawPlayer(ctx, player, camera, canvas);
    });

    // Draw target indicator
    if (targetPos) {
      drawTargetIndicator(ctx, targetPos, camera, canvas);
    }

    // Draw current player on top
    if (gameState.currentPlayer) {
      drawPlayer(ctx, gameState.currentPlayer, camera, canvas, true);
    }

  }, [gameState.players, gameState.currentPlayer, camera, targetPos, gameState.movieOrbs]);

  // MOBA-style movement loop
  useEffect(() => {
    if (!gameState.currentPlayer) return;

    let animationId;
    let lastMoveTime = 0;
    const moveThrottle = 1000 / 30; // ~30 FPS

    const animate = (currentTime) => {
      const player = playerRef.current;
      const target = targetPosRef.current;
      const settings = settingsRef.current;

      if (!player || !target) {
        animationId = requestAnimationFrame(animate);
        return;
      }

      // Calculate direction and distance to target
      const dx = target.x - player.position.x;
      const dy = target.y - player.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Move towards target if far enough
      if (distance > 5) {
        const speed = settings.movementSpeed || 2;
        const moveX = (dx / distance) * speed;
        const moveY = (dy / distance) * speed;
        
        const newX = player.position.x + moveX;
        const newY = player.position.y + moveY;

        // Throttle server updates
        if (currentTime - lastMoveTime >= moveThrottle) {
          movePlayer(newX, newY);
          lastMoveTime = currentTime;
        }
      } else {
        // Reached target, clear it
        setTargetPos(null);
      }

      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [gameState.currentPlayer, movePlayer]);

  const drawGrid = (ctx, canvas) => {
    const gridSize = 50;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;

    const startX = -camera.x % gridSize;
    const startY = -camera.y % gridSize;

    for (let x = startX; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    for (let y = startY; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  };

  const drawMovieOrb = (ctx, orb, camera, canvas) => {
    const screenX = orb.position.x - camera.x + canvas.width / 2;
    const screenY = orb.position.y - camera.y + canvas.height / 2;

    // Skip if off screen
    if (screenX < -orb.size || screenX > canvas.width + orb.size ||
        screenY < -orb.size || screenY > canvas.height + orb.size) {
      return;
    }

    ctx.save();
    ctx.fillStyle = orb.color;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    
    ctx.beginPath();
    ctx.arc(screenX, screenY, orb.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw type indicator
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(8, orb.size / 2)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const typeSymbol = {
      single: '🎬',
      bundle: '📦',
      list: '📋',
      boss: '👑'
    }[orb.type] || '🎬';
    
    ctx.fillText(typeSymbol, screenX, screenY);
    ctx.restore();
  };

  const drawTargetIndicator = (ctx, target, camera, canvas) => {
    const screenX = target.x - camera.x + canvas.width / 2;
    const screenY = target.y - camera.y + canvas.height / 2;

    ctx.save();
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    
    ctx.beginPath();
    ctx.arc(screenX, screenY, 15, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.restore();
  };

  const drawPlayer = (ctx, player, camera, canvas, isCurrentPlayer = false) => {
    const screenX = player.position.x - camera.x + canvas.width / 2;
    const screenY = player.position.y - camera.y + canvas.height / 2;

    // Don't draw if off screen
    if (screenX < -player.size || screenX > canvas.width + player.size ||
        screenY < -player.size || screenY > canvas.height + player.size) {
      return;
    }

    // Draw player circle
    ctx.beginPath();
    ctx.arc(screenX, screenY, player.size / 2, 0, 2 * Math.PI);
    ctx.fillStyle = player.color || '#3498db';
    ctx.fill();

    // Draw border
    ctx.strokeStyle = isCurrentPlayer ? '#ffd700' : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = isCurrentPlayer ? 3 : 2;
    ctx.stroke();

    // Draw glow effect
    if (isCurrentPlayer) {
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(screenX, screenY, player.size / 2, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Draw username
    ctx.fillStyle = 'white';
    ctx.font = `bold ${Math.max(12, player.size / 4)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.strokeText(player.username, screenX, screenY);
    ctx.fillText(player.username, screenX, screenY);

    // Draw points and absorption count
    if (player.points !== undefined) {
      ctx.fillStyle = '#00ff00';
      ctx.font = `bold ${Math.max(8, player.size / 8)}px Arial`;
      ctx.strokeText(`${player.points}pts`, screenX, screenY - player.size / 2 - 5);
      ctx.fillText(`${player.points}pts`, screenX, screenY - player.size / 2 - 5);
    }
    
    if (player.absorptions > 0) {
      ctx.fillStyle = '#ffd700';
      ctx.font = `bold ${Math.max(10, player.size / 6)}px Arial`;
      ctx.strokeText(`${player.absorptions}`, screenX, screenY + player.size / 3);
      ctx.fillText(`${player.absorptions}`, screenX, screenY + player.size / 3);
    }
  };

  // Touch-to-absorb handled on server upon overlap during movement

  // --- Import hooks ---
  const handleClickImportWatchlist = () => {
    watchlistInputRef.current?.click();
  };

  const handleClickImportFiveStar = () => {
    fiveStarInputRef.current?.click();
  };

  const handleWatchlistFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('csvFile', file);
    try {
      const res = await axios.post('/api/user/import-letterboxd-watchlist', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(res.data?.message || 'Watchlist imported');
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to import watchlist';
      toast.error(msg);
    } finally {
      e.target.value = '';
    }
  };

  const handleFiveStarFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('csvFile', file);
    try {
      const res = await axios.post('/api/user/import-letterboxd', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(res.data?.message || '5-star movies imported');
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to import 5-star movies';
      toast.error(msg);
    } finally {
      e.target.value = '';
    }
  };

  const handleLeaveGame = () => {
    leaveGame();
    navigate('/dashboard');
  };

  if (!gameState.connected) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <h2>Connecting to game...</h2>
      </div>
    );
  }

  if (!gameState.currentPlayer) {
    return (
      <div className="loading-screen">
        <h2>You've been absorbed!</h2>
        <p>Watch the remaining players or return to dashboard</p>
        <button className="btn" onClick={handleLeaveGame}>
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        className="game-canvas"
        style={{ display: 'block', width: '100%', height: '100%' }}
      />

      {/* Game UI Overlay */}
      <div className="game-ui">
        {/* Hidden file inputs for imports */}
        <input
          type="file"
          accept=".csv,text/csv"
          ref={fiveStarInputRef}
          style={{ display: 'none' }}
          onChange={handleFiveStarFileChange}
        />
        <input
          type="file"
          accept=".csv,text/csv"
          ref={watchlistInputRef}
          style={{ display: 'none' }}
          onChange={handleWatchlistFileChange}
        />
        {/* Top Bar */}
        <div className="top-bar">
          <div className="stats-panel">
            <h3 style={{ margin: '0 0 10px 0' }}>Your Stats</h3>
            <div>Size: {gameState.currentPlayer.size}</div>
            <div>Absorptions: {gameState.currentPlayer.absorptions || 0}</div>
            <div>Position: ({Math.round(gameState.currentPlayer.position.x)}, {Math.round(gameState.currentPlayer.position.y)})</div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              className="btn btn-secondary"
              onClick={handleClickImportFiveStar}
              style={{ width: 'auto', padding: '8px 16px' }}
            >
              Import 5★ CSV
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleClickImportWatchlist}
              style={{ width: 'auto', padding: '8px 16px' }}
            >
              Import Watchlist CSV
            </button>
            <button 
              className="btn btn-secondary"
              onClick={() => navigate('/profile')}
              style={{ width: 'auto', padding: '8px 16px' }}
            >
              Profile
            </button>
            <button 
              className="btn btn-danger"
              onClick={handleLeaveGame}
              style={{ width: 'auto', padding: '8px 16px' }}
            >
              Leave Game
            </button>
          </div>

          <div className="leaderboard">
            <h3 style={{ margin: '0 0 10px 0' }}>Players ({gameState.players.length})</h3>
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {gameState.players
                .sort((a, b) => b.size - a.size)
                .slice(0, 10)
                .map((player, index) => (
                  <div key={player.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '4px 0',
                    color: player.id === gameState.currentPlayer.id ? '#ffd700' : 'white',
                    borderBottom: index < 9 ? '1px solid rgba(255,255,255,0.1)' : 'none'
                  }}>
                    <span>#{index + 1} {player.username}</span>
                    <span>{player.size}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Absorption UI removed: absorption occurs on touch */}

        {/* Orb detail popup */}
        {selectedOrb && (
          <div
            style={{
              position: 'absolute',
              right: 20,
              top: 80,
              width: 360,
              background: 'rgba(0,0,0,0.9)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 12,
              padding: 16,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              zIndex: 10
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 'bold', fontSize: 18 }}>
                Orb Details {selectedOrb.type === 'boss' ? '👑' : selectedOrb.type === 'list' ? '📋' : selectedOrb.type === 'bundle' ? '📦' : '🎬'}
              </div>
              <button className="btn btn-secondary" onClick={() => setSelectedOrb(null)} style={{ padding: '4px 8px' }}>Close</button>
            </div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
              Type: {selectedOrb.type} • Value: {selectedOrb.pointValue} pts • Size: {selectedOrb.size}
            </div>
            <div style={{ maxHeight: 240, overflowY: 'auto', paddingRight: 6 }}>
              {(selectedOrb.movies || []).length === 0 ? (
                <div style={{ opacity: 0.8 }}>No movies attached.</div>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {selectedOrb.movies.map((m, idx) => (
                    <li key={`${m.title}-${m.year}-${idx}`} style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ fontWeight: 600 }}>
                        {m.title} {m.year ? `(${m.year})` : ''} {m.watchCount ? `• x${m.watchCount}` : ''}
                      </div>
                      {m.director && <div style={{ fontSize: 12, opacity: 0.85 }}>Dir. {m.director}</div>}
                      {m.letterboxdUrl && (
                        <a href={m.letterboxdUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#4da3ff' }}>Letterboxd</a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setTargetPos({ x: selectedOrb.position.x, y: selectedOrb.position.y });
                  toast('Moving to orb...', { icon: '➡️', duration: 1000 });
                }}
              >
                Move to this orb
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setSelectedOrb(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Instructions */}
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '15px',
          borderRadius: '10px',
          fontSize: '14px'
        }}>
          <div><strong>Controls:</strong></div>
          <div>• Right-click to move</div>
          <div>• Touch players to attempt absorption</div>
          <div>• Collect movie orbs for points</div>
          <div>• You can only absorb players whose 5-star movies you've all seen</div>
        </div>
      </div>
    </div>
  );
};

export default GameCanvas;
