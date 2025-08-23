import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

const Dashboard = () => {
  const [sessions, setSessions] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [newSession, setNewSession] = useState({
    name: '',
    duration: 7,
    maxPlayers: 50
  });
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [sessionsRes, leaderboardRes] = await Promise.all([
        axios.get('/api/game/sessions'),
        axios.get('/api/user/leaderboard')
      ]);
      
      setSessions(sessionsRes.data);
      setLeaderboard(leaderboardRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSession = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('/api/game/create-session', newSession);
      toast.success('Game session created!');
      setShowCreateSession(false);
      setNewSession({ name: '', duration: 7, maxPlayers: 50 });
      fetchData();
    } catch (error) {
      toast.error('Failed to create session');
    }
  };

  const handleJoinSession = async (sessionId) => {
    try {
      await axios.post(`/api/game/join/${sessionId}`);
      navigate(`/game/${sessionId}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to join session');
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <h2>Loading Dashboard...</h2>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div className="dashboard-title">
          <h1>🎬 Cinephile Agar</h1>
          <p>Welcome back, {user.username}!</p>
        </div>
        <div className="dashboard-actions">
          <button 
            className="btn btn-secondary dashboard-btn"
            onClick={() => navigate('/profile')}
          >
            Profile
          </button>
          <button 
            className="btn btn-danger dashboard-btn"
            onClick={logout}
          >
            Logout
          </button>
        </div>
      </div>

      <div className="dashboard-content">
        {/* Game Sessions */}
        <div className="sessions-section">
          <div className="section-header">
            <h2>Active Game Sessions</h2>
            <button 
              className="btn dashboard-btn"
              onClick={() => setShowCreateSession(true)}
            >
              Create Session
            </button>
          </div>

          {showCreateSession && (
            <div className="glass-card create-session-form">
              <h3>Create New Session</h3>
              <form onSubmit={handleCreateSession}>
                <div className="form-group">
                  <label>Session Name</label>
                  <input
                    type="text"
                    value={newSession.name}
                    onChange={(e) => setNewSession({...newSession, name: e.target.value})}
                    required
                    placeholder="e.g., Criterion Collection Battle"
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Duration (days)</label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={newSession.duration}
                      onChange={(e) => setNewSession({...newSession, duration: parseInt(e.target.value)})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Max Players</label>
                    <input
                      type="number"
                      min="10"
                      max="100"
                      value={newSession.maxPlayers}
                      onChange={(e) => setNewSession({...newSession, maxPlayers: parseInt(e.target.value)})}
                    />
                  </div>
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn">Create</button>
                  <button 
                    type="button" 
                    className="btn btn-secondary"
                    onClick={() => setShowCreateSession(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="sessions-grid">
            {sessions.length === 0 ? (
              <div className="glass-card empty-state">
                <h3>No active sessions</h3>
                <p>Create a new session to start playing!</p>
              </div>
            ) : (
              sessions.map(session => (
                <div key={session.id} className="glass-card session-card">
                  <div className="session-info">
                    <div className="session-details">
                      <h3>{session.name}</h3>
                      <div className="session-meta">
                        <span>👥 {session.playerCount}/{session.maxPlayers} players</span>
                        <span>⏱️ {session.daysRemaining} days left</span>
                        <span className={`status-badge ${session.status}`}>
                          {session.status}
                        </span>
                      </div>
                    </div>
                    <button 
                      className="btn dashboard-btn"
                      onClick={() => handleJoinSession(session.sessionId)}
                      disabled={session.playerCount >= session.maxPlayers}
                    >
                      {session.playerCount >= session.maxPlayers ? 'Full' : 'Join'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="sidebar">
          {/* User Stats */}
          <div className="glass-card stats-card">
            <h3>Your Stats</h3>
            <div className="stats-list">
              <div className="stat-item">
                <span>ELO Rating:</span>
                <strong>{user.eloRating}</strong>
              </div>
              <div className="stat-item">
                <span>Games Played:</span>
                <strong>{user.gamesPlayed || 0}</strong>
              </div>
              <div className="stat-item">
                <span>Total Absorptions:</span>
                <strong>{user.totalAbsorptions || 0}</strong>
              </div>
              <div className="stat-item">
                <span>5-Star Movies:</span>
                <strong>{user.fiveStarMovies?.length || 0}</strong>
              </div>
            </div>
          </div>

          {/* Leaderboard */}
          <div className="glass-card leaderboard-card">
            <h3>🏆 Leaderboard</h3>
            <div className="leaderboard-list">
              {leaderboard.slice(0, 10).map((player, index) => (
                <div 
                  key={player._id} 
                  className={`leaderboard-item ${player._id === user.id ? 'current-user' : ''}`}
                >
                  <div className="player-info">
                    <span className={`rank ${index < 3 ? 'top-three' : ''}`}>
                      #{index + 1}
                    </span>
                    <span className="username">{player.username}</span>
                  </div>
                  <span className="rating">{player.eloRating}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
