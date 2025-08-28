import React, { useRef, useEffect, useState, useCallback } from 'react';
import axios from '../../utils/axiosConfig';
import io from 'socket.io-client';
import { toast } from 'react-hot-toast';
import FightModal from '../Fight/FightModal';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useGame } from '../../contexts/GameContext';

const GameCanvas = () => {
  const canvasRef = useRef(null);
  const { sessionId } = useParams();
  const { user } = useAuth();
  const { gameState, joinGame, movePlayer, leaveGame } = useGame();
  const navigate = useNavigate();
  
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [targetPos, setTargetPos] = useState(null); // MOBA-style target position
  const [selectedOrb, setSelectedOrb] = useState(null); // Orb detail popup
  const [hudOpen, setHudOpen] = useState(false); // Mobile HUD toggle
  // Touch-to-absorb: no click UI required
  const watchlistInputRef = useRef(null);
  const fiveStarInputRef = useRef(null);
  
  // Fighting system state
  const [fightModal, setFightModal] = useState({
    isOpen: false,
    mode: 'challenge', // 'challenge', 'respond', 'active'
    opponent: null,
    fightData: null
  });
  const [pendingFights, setPendingFights] = useState([]);
  const [activeFights, setActiveFights] = useState([]);

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
      
      // Load pending and active fights
      loadFights();
    }

    return () => {
      leaveGame();
    };
  // eslint-disable-next-line
  }, [sessionId, user]);

  // Load fights data
  const loadFights = async () => {
    try {
      const [pendingRes, activeRes] = await Promise.all([
        axios.get('/api/fight/pending'),
        axios.get('/api/fight/active')
      ]);
      setPendingFights(pendingRes.data);
      setActiveFights(activeRes.data);
    } catch (error) {
      console.error('Error loading fights:', error);
    }
  };

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

    // Touch controls: tap to move, tap on orb to open details, drag to update target
    const handleTouch = (e) => {
      // prevent page scroll while controlling
      e.preventDefault();
      const touch = e.touches[0] || e.changedTouches[0];
      if (!touch) return;
      const rect = canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      const cam = cameraRef.current || camera;
      const worldX = x + cam.x - canvas.width / 2;
      const worldY = y + cam.y - canvas.height / 2;

      // If tapping on an orb, open details; otherwise set move target
      let hit = null;
      for (const orb of gameState.movieOrbs) {
        const screenX = orb.position.x - cam.x + canvas.width / 2;
        const screenY = orb.position.y - cam.y + canvas.height / 2;
        const dx = x - screenX;
        const dy = y - screenY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= orb.size) { hit = orb; break; }
      }
      if (e.type === 'touchstart') {
        if (hit) {
          setSelectedOrb(hit);
        } else {
          setSelectedOrb(null);
          setTargetPos({ x: worldX, y: worldY });
        }
      } else if (e.type === 'touchmove') {
        setTargetPos({ x: worldX, y: worldY });
      }
    };

    canvas.addEventListener('contextmenu', handleRightClick);
    canvas.addEventListener('click', handleLeftClick);
    canvas.addEventListener('touchstart', handleTouch, { passive: false });
    canvas.addEventListener('touchmove', handleTouch, { passive: false });
    // Left click removed: absorption is touch-based now

    return () => {
      canvas.removeEventListener('contextmenu', handleRightClick);
      canvas.removeEventListener('click', handleLeftClick);
      canvas.removeEventListener('touchstart', handleTouch);
      canvas.removeEventListener('touchmove', handleTouch);
    };
  }, [gameState.currentPlayer, camera, gameState.players, gameState.movieOrbs]);

  // Socket event listeners for fighting system
  useEffect(() => {
    if (!gameState.socket) return;

    const handleFightChallengeAvailable = (data) => {
      toast(`🥊 Fight available with ${data.opponent.username}!`, {
        duration: 5000,
        icon: '⚔️'
      });
    };

    const handleFightChallengeReceived = (data) => {
      toast(`${data.challenger.username} challenges you to a fight!`, {
        duration: 8000,
        icon: '🥊'
      });
      
      // Show fight modal for response
      setFightModal({
        isOpen: true,
        mode: 'respond',
        opponent: data.challenger,
        fightData: data
      });
      
      loadFights(); // Refresh fights list
    };

    const handleFightAccepted = (data) => {
      toast(`${data.defender.username} accepted your challenge!`, {
        duration: 5000,
        icon: '✅'
      });
      
      setFightModal({
        isOpen: true,
        mode: 'active',
        opponent: data.defender,
        fightData: data.fight
      });
      
      loadFights();
    };

    const handleFightCompleted = (data) => {
      const isWinner = data.winnerId === (user._id || user.id);
      toast(
        isWinner ? `🎉 You won the fight against ${data.opponent.username}!` : 
                  `😔 You lost the fight against ${data.opponent.username}`,
        { duration: 6000 }
      );
      
      loadFights();
    };

    gameState.socket.on('fight-challenge-available', handleFightChallengeAvailable);
    gameState.socket.on('fight-challenge-received', handleFightChallengeReceived);
    gameState.socket.on('fight-accepted', handleFightAccepted);
    gameState.socket.on('fight-completed', handleFightCompleted);

    return () => {
      gameState.socket.off('fight-challenge-available', handleFightChallengeAvailable);
      gameState.socket.off('fight-challenge-received', handleFightChallengeReceived);
      gameState.socket.off('fight-accepted', handleFightAccepted);
      gameState.socket.off('fight-completed', handleFightCompleted);
    };
  }, [gameState.socket, user, loadFights]);

  useEffect(() => {
    // Update camera to follow current player
    if (gameState.currentPlayer) {
      setCamera({
        x: gameState.currentPlayer.position.x,
        y: gameState.currentPlayer.position.y
      });
    }
  // eslint-disable-next-line
  }, [gameState.currentPlayer?.position]);

  const drawGrid = useCallback((ctx, canvas) => {
    const gridSize = 50;
    ctx.strokeStyle = 'rgba(31, 33, 36, 0.1)';
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
  }, [camera]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Set canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Clear canvas with light background
    ctx.fillStyle = '#f8fafc';
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

  // eslint-disable-next-line
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
    ctx.strokeStyle = 'rgba(255, 128, 0, 0.8)';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(255, 128, 0, 0.3)';
    ctx.shadowBlur = 8;
    
    ctx.beginPath();
    ctx.arc(screenX, screenY, orb.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw type indicator
    ctx.fillStyle = '#1f2124';
    ctx.font = `bold ${Math.max(8, orb.size / 2)}px Inter, Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
    ctx.shadowBlur = 2;
    
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
    ctx.strokeStyle = '#FF8000';
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 4]);
    ctx.shadowColor = 'rgba(255, 128, 0, 0.5)';
    ctx.shadowBlur = 10;
    
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

    // Draw border with glassy effect
    ctx.strokeStyle = isCurrentPlayer ? '#FF8000' : 'rgba(31, 33, 36, 0.4)';
    ctx.lineWidth = isCurrentPlayer ? 4 : 2;
    ctx.shadowColor = isCurrentPlayer ? 'rgba(255, 128, 0, 0.5)' : 'rgba(31, 33, 36, 0.2)';
    ctx.shadowBlur = isCurrentPlayer ? 15 : 5;
    ctx.stroke();
    
    // Additional inner glow for current player
    if (isCurrentPlayer) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(screenX, screenY, player.size / 2 - 2, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Draw username with better contrast
    ctx.fillStyle = '#1f2124';
    ctx.font = `bold ${Math.max(12, player.size / 4)}px Inter, Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 3;
    ctx.strokeText(player.username, screenX, screenY);
    ctx.fillText(player.username, screenX, screenY);

    // Draw points and absorption count with modern styling
    if (player.points !== undefined) {
      ctx.fillStyle = '#10b981';
      ctx.font = `bold ${Math.max(8, player.size / 8)}px Inter, Arial`;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2;
      ctx.strokeText(`${player.points}pts`, screenX, screenY - player.size / 2 - 5);
      ctx.fillText(`${player.points}pts`, screenX, screenY - player.size / 2 - 5);
    }
    
    if (player.absorptions > 0) {
      ctx.fillStyle = '#FF8000';
      ctx.font = `bold ${Math.max(10, player.size / 6)}px Inter, Arial`;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2;
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

  // Fight challenge handler
  const handleChallengePlayer = (opponent) => {
    setFightModal({
      isOpen: true,
      mode: 'challenge',
      opponent,
      fightData: null
    });
  };

  // Close fight modal
  const closeFightModal = () => {
    setFightModal({
      isOpen: false,
      mode: 'challenge',
      opponent: null,
      fightData: null
    });
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
    <div className="game-container">
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
        <div className={`top-bar ${hudOpen ? 'open' : ''}`}>
          <div className="stats-panel">
            <h3>Your Stats</h3>
            <div className="stat-item">
              <span>Size:</span>
              <strong>{gameState.currentPlayer.size}</strong>
            </div>
            <div className="stat-item">
              <span>Absorptions:</span>
              <strong>{gameState.currentPlayer.absorptions || 0}</strong>
            </div>
            <div className="stat-item">
              <span>Position:</span>
              <strong>({Math.round(gameState.currentPlayer.position.x)}, {Math.round(gameState.currentPlayer.position.y)})</strong>
            </div>
          </div>

          <div className="game-actions">
            <button
              className="btn btn-secondary dashboard-btn"
              onClick={handleClickImportFiveStar}
            >
              Import 5★ CSV
            </button>
            <button
              className="btn btn-secondary dashboard-btn"
              onClick={handleClickImportWatchlist}
            >
              Import Watchlist CSV
            </button>
            <button 
              className="btn btn-secondary dashboard-btn"
              onClick={() => navigate('/profile')}
            >
              Profile
            </button>
            <button 
              className="btn btn-danger dashboard-btn"
              onClick={handleLeaveGame}
            >
              Leave Game
            </button>
          </div>

          <div className="leaderboard">
            <h3>Players ({gameState.players.length})</h3>
            <div className="leaderboard-list">
              {gameState.players
                .sort((a, b) => b.size - a.size)
                .slice(0, 10)
                .map((player, index) => (
                  <div 
                    key={player.id} 
                    className={`leaderboard-item ${player.id === gameState.currentPlayer.id ? 'current-user' : ''}`}
                  >
                    <div className="player-info">
                      <span className={`rank ${index < 3 ? 'top-three' : ''}`}>
                        #{index + 1}
                      </span>
                      <span className="username">{player.username}</span>
                      {player.id !== gameState.currentPlayer.id && (
                        <button
                          className="challenge-btn"
                          onClick={() => handleChallengePlayer({
                            id: player.userId,
                            username: player.username
                          })}
                          title="Challenge to fight"
                        >
                          ⚔️
                        </button>
                      )}
                    </div>
                    <span className="rating">{player.size}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Absorption UI removed: absorption occurs on touch */}

        {/* Orb detail popup */}
        {selectedOrb && (
          <div className="orb-detail-popup">
            <div className="popup-header">
              <div className="popup-title">
                Orb Details {selectedOrb.type === 'boss' ? '👑' : selectedOrb.type === 'list' ? '📋' : selectedOrb.type === 'bundle' ? '📦' : '🎬'}
              </div>
              <button className="btn btn-secondary dashboard-btn" onClick={() => setSelectedOrb(null)}>Close</button>
            </div>
            <div className="popup-meta">
              Type: {selectedOrb.type} • Value: {selectedOrb.pointValue} pts • Size: {selectedOrb.size}
            </div>
            <div className="popup-content">
              {(selectedOrb.movies || []).length === 0 ? (
                <div className="empty-movies">No movies attached.</div>
              ) : (
                <ul className="movie-list">
                  {selectedOrb.movies.map((m, idx) => (
                    <li key={`${m.title}-${m.year}-${idx}`} className="movie-list-item">
                      <div className="movie-title">
                        {m.title} {m.year ? `(${m.year})` : ''} {m.watchCount ? `• x${m.watchCount}` : ''}
                      </div>
                      {m.director && <div className="movie-director">Dir. {m.director}</div>}
                      {m.letterboxdUrl && (
                        <a href={m.letterboxdUrl} target="_blank" rel="noreferrer" className="letterboxd-link">Letterboxd</a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="popup-actions">
              <button
                className="btn"
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
        <div className="game-instructions">
          <div className="instructions-title">Controls:</div>
          <div>• Right-click or tap to move</div>
          <div>• Touch or overlap players to attempt absorption</div>
          <div>• Collect movie orbs for points</div>
          <div>• You can only absorb players whose 5-star movies you've all seen</div>
        </div>

        {/* Mobile HUD toggle */}
        <button
          className="hud-toggle"
          aria-label="Toggle HUD"
          onClick={() => setHudOpen((v) => !v)}
        >
          {hudOpen ? 'Hide HUD' : 'Show HUD'}
        </button>

        {/* Fight notifications */}
        {pendingFights.length > 0 && (
          <div className="fight-notifications">
            <h4>⚔️ Pending Fights ({pendingFights.length})</h4>
            {pendingFights.slice(0, 3).map(fight => (
              <div key={fight._id} className="fight-notification">
                <span>
                  {fight.challengerId._id === (user._id || user.id) 
                    ? `Challenge sent to ${fight.defenderId.username}`
                    : `${fight.challengerId.username} challenges you`
                  }
                </span>
                {fight.defenderId._id === (user._id || user.id) && (
                  <button
                    className="respond-btn"
                    onClick={() => setFightModal({
                      isOpen: true,
                      mode: 'respond',
                      opponent: fight.challengerId,
                      fightData: fight
                    })}
                  >
                    Respond
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Active fights */}
        {activeFights.length > 0 && (
          <div className="active-fights">
            <h4>🥊 Active Fights ({activeFights.length})</h4>
            {activeFights.slice(0, 2).map(fight => (
              <div key={fight._id} className="active-fight">
                <span>
                  vs {fight.challengerId === (user._id || user.id) 
                    ? fight.defenderId.username 
                    : fight.challengerId.username
                  }
                </span>
                <button
                  className="continue-btn"
                  onClick={() => setFightModal({
                    isOpen: true,
                    mode: 'active',
                    opponent: fight.challengerId === (user._id || user.id) 
                      ? fight.defenderId 
                      : fight.challengerId,
                    fightData: fight
                  })}
                >
                  Continue
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fight Modal */}
      <FightModal
        isOpen={fightModal.isOpen}
        onClose={closeFightModal}
        opponent={fightModal.opponent}
        sessionId={sessionId}
        user={user}
        mode={fightModal.mode}
        fightData={fightModal.fightData}
      />
    </div>
  );
};

export default GameCanvas;
