import React, { useState, useEffect, useRef } from 'react';
import './WheelOfFortune.css';

const WheelOfFortune = ({ movies, onMovieSelected, isSpinning, setIsSpinning }) => {
  const canvasRef = useRef(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [rotation, setRotation] = useState(0);

  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
  ];

  useEffect(() => {
    drawWheel();
  }, [movies, rotation]);

  const drawWheel = () => {
    const canvas = canvasRef.current;
    if (!canvas || !movies.length) return;

    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 20;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw wheel segments
    const anglePerSegment = (2 * Math.PI) / movies.length;
    
    movies.forEach((movie, index) => {
      const startAngle = index * anglePerSegment + (rotation * Math.PI / 180);
      const endAngle = (index + 1) * anglePerSegment + (rotation * Math.PI / 180);

      // Draw segment
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = colors[index % colors.length];
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Draw text
      const textAngle = startAngle + anglePerSegment / 2;
      const textX = centerX + Math.cos(textAngle) * (radius * 0.7);
      const textY = centerY + Math.sin(textAngle) * (radius * 0.7);

      ctx.save();
      ctx.translate(textX, textY);
      ctx.rotate(textAngle + Math.PI / 2);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Truncate long titles
      const title = movie.title.length > 15 ? movie.title.substring(0, 12) + '...' : movie.title;
      ctx.fillText(title, 0, 0);
      ctx.restore();
    });

    // Draw center circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, 20, 0, 2 * Math.PI);
    ctx.fillStyle = '#333';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw pointer
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - radius - 10);
    ctx.lineTo(centerX - 15, centerY - radius - 30);
    ctx.lineTo(centerX + 15, centerY - radius - 30);
    ctx.closePath();
    ctx.fillStyle = '#FF4757';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  const spinWheel = () => {
    if (isSpinning || !movies.length) return;

    setIsSpinning(true);
    
    // Random spin between 3-6 full rotations plus random angle
    const minSpins = 3;
    const maxSpins = 6;
    const spins = minSpins + Math.random() * (maxSpins - minSpins);
    const finalRotation = spins * 360 + Math.random() * 360;
    
    setRotation(prev => prev + finalRotation);

    // Calculate which movie will be selected
    const normalizedRotation = (rotation + finalRotation) % 360;
    const anglePerSegment = 360 / movies.length;
    // Pointer is at top, so we need to account for that
    const adjustedAngle = (360 - normalizedRotation + (anglePerSegment / 2)) % 360;
    const selectedIdx = Math.floor(adjustedAngle / anglePerSegment);
    
    setTimeout(() => {
      setSelectedIndex(selectedIdx);
      setIsSpinning(false);
      onMovieSelected(movies[selectedIdx], selectedIdx);
    }, 3000); // 3 second spin duration
  };

  return (
    <div className="wheel-container">
      <div className="wheel-header">
        <h3>🎰 Wheel of Fortune</h3>
        <p>Spin to select a movie for the quiz question!</p>
      </div>
      
      <div className="wheel-canvas-container">
        <canvas
          ref={canvasRef}
          width={300}
          height={300}
          className={`wheel-canvas ${isSpinning ? 'spinning' : ''}`}
          style={{ transform: `rotate(${rotation}deg)` }}
        />
      </div>

      <div className="wheel-controls">
        <button
          className={`spin-button ${isSpinning ? 'spinning' : ''}`}
          onClick={spinWheel}
          disabled={isSpinning}
        >
          {isSpinning ? '🎲 Spinning...' : '🎲 SPIN!'}
        </button>
      </div>

      {selectedIndex !== null && !isSpinning && (
        <div className="selected-movie">
          <h4>🎬 Selected Movie:</h4>
          <div className="movie-info">
            <strong>{movies[selectedIndex]?.title}</strong>
            {movies[selectedIndex]?.year && ` (${movies[selectedIndex].year})`}
            {movies[selectedIndex]?.director && (
              <div className="director">Dir. {movies[selectedIndex].director}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WheelOfFortune;
