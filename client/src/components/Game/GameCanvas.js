import React, { useRef, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useGame } from '../../contexts/GameContext';
import toast from 'react-hot-toast';

const GameCanvas = () => {
  const canvasRef = useRef(null);
  const { sessionId } = useParams();
  const { user } = useAuth();
  const { gameState, joinGame, movePlayer, attemptAbsorption, leaveGame, absorptionAttempt } = useGame();
  console.log("gameState", gameState)
  const navigate = useNavigate();
  
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [showAbsorptionUI, setShowAbsorptionUI] = useState(false);
  const [targetPlayer, setTargetPlayer] = useState(null);

  useEffect(() => {
    if (user && sessionId) {
      joinGame(sessionId, user.id, user.username);
    }

    return () => {
      leaveGame();
    };
  }, [sessionId, user]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setMousePos({ x, y });

      if (gameState.currentPlayer) {
        // Convert screen coordinates to world coordinates
        const worldX = x + camera.x - canvas.width / 2;
        const worldY = y + camera.y - canvas.height / 2;
        
        // Move towards mouse position
        const dx = worldX - gameState.currentPlayer.position.x;
        const dy = worldY - gameState.currentPlayer.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 5) {
          const speed = Math.min(3, distance / 10);
          const newX = gameState.currentPlayer.position.x + (dx / distance) * speed;
          const newY = gameState.currentPlayer.position.y + (dy / distance) * speed;
          
          movePlayer(newX, newY);
        }
      }
    };

    const handleClick = (e) => {
      if (!gameState.currentPlayer) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Convert to world coordinates
      const worldX = x + camera.x - canvas.width / 2;
      const worldY = y + camera.y - canvas.height / 2;

      // Check if clicking on another player
      const clickedPlayer = gameState.players.find(player => {
        if (player.id === gameState.currentPlayer.id) return false;
        
        const dx = worldX - player.position.x;
        const dy = worldY - player.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        return distance <= player.size / 2;
      });

      if (clickedPlayer) {
        setTargetPlayer(clickedPlayer);
        setShowAbsorptionUI(true);
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleClick);
    };
  }, [gameState.currentPlayer, camera, gameState.players]);

  useEffect(() => {
    // Update camera to follow current player
    if (gameState.currentPlayer) {
      setCamera({
        x: gameState.currentPlayer.position.x,
        y: gameState.currentPlayer.position.y
      });
    }
  }, [gameState.currentPlayer?.position]);

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

    // Draw players
    gameState.players.forEach(player => {
      drawPlayer(ctx, canvas, player);
    });

    // Draw current player on top
    if (gameState.currentPlayer) {
      drawPlayer(ctx, canvas, gameState.currentPlayer, true);
    }

  }, [gameState.players, gameState.currentPlayer, camera]);

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

  const drawPlayer = (ctx, canvas, player, isCurrentPlayer = false) => {
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

    // Draw absorption count
    if (player.absorptions > 0) {
      ctx.fillStyle = '#ffd700';
      ctx.font = `bold ${Math.max(10, player.size / 6)}px Arial`;
      ctx.strokeText(`${player.absorptions}`, screenX, screenY + player.size / 3);
      ctx.fillText(`${player.absorptions}`, screenX, screenY + player.size / 3);
    }
  };

  const handleAbsorptionAttempt = () => {
    if (targetPlayer) {
      attemptAbsorption(targetPlayer.id);
      setShowAbsorptionUI(false);
      setTargetPlayer(null);
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

        {/* Absorption UI */}
        {showAbsorptionUI && targetPlayer && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0,0,0,0.9)',
            color: 'white',
            padding: '20px',
            borderRadius: '15px',
            textAlign: 'center',
            minWidth: '300px',
            zIndex: 2000
          }}>
            <h3>Absorb {targetPlayer.username}?</h3>
            <p>You need to have seen all of their 5-star movies to absorb them.</p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
              <button 
                className="btn btn-success"
                onClick={handleAbsorptionAttempt}
                disabled={absorptionAttempt}
              >
                {absorptionAttempt ? 'Attempting...' : 'Try Absorb'}
              </button>
              <button 
                className="btn btn-secondary"
                onClick={() => {
                  setShowAbsorptionUI(false);
                  setTargetPlayer(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Absorption Indicator */}
        {absorptionAttempt && (
          <div className="absorption-indicator">
            Attempting absorption...
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
          <div>• Move mouse to navigate</div>
          <div>• Click on players to attempt absorption</div>
          <div>• You can only absorb players whose 5-star movies you've all seen</div>
        </div>
      </div>
    </div>
  );
};

export default GameCanvas;
