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
    <div style={{ 
      minHeight: '100vh', 
      padding: '20px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '30px',
        background: 'rgba(255,255,255,0.1)',
        padding: '20px',
        borderRadius: '15px',
        backdropFilter: 'blur(10px)'
      }}>
        <div>
          <h1 style={{ color: 'white', margin: 0 }}>🎬 Cinephile Agar</h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', margin: '5px 0 0 0' }}>
            Welcome back, {user.username}!
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            className="btn btn-secondary"
            onClick={() => navigate('/profile')}
            style={{ width: 'auto', padding: '10px 20px' }}
          >
            Profile
          </button>
          <button 
            className="btn btn-danger"
            onClick={logout}
            style={{ width: 'auto', padding: '10px 20px' }}
          >
            Logout
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '30px' }}>
        {/* Game Sessions */}
        <div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px'
          }}>
            <h2 style={{ color: 'white', margin: 0 }}>Active Game Sessions</h2>
            <button 
              className="btn"
              onClick={() => setShowCreateSession(true)}
              style={{ width: 'auto', padding: '10px 20px' }}
            >
              Create Session
            </button>
          </div>

          {showCreateSession && (
            <div style={{
              background: 'rgba(255,255,255,0.95)',
              padding: '20px',
              borderRadius: '15px',
              marginBottom: '20px'
            }}>
              <h3 style={{ marginBottom: '20px', color: '#333' }}>Create New Session</h3>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
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
                <div style={{ display: 'flex', gap: '10px' }}>
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

          <div style={{ display: 'grid', gap: '15px' }}>
            {sessions.length === 0 ? (
              <div style={{
                background: 'rgba(255,255,255,0.1)',
                padding: '40px',
                borderRadius: '15px',
                textAlign: 'center',
                color: 'white'
              }}>
                <h3>No active sessions</h3>
                <p>Create a new session to start playing!</p>
              </div>
            ) : (
              sessions.map(session => (
                <div key={session.id} style={{
                  background: 'rgba(255,255,255,0.1)',
                  padding: '20px',
                  borderRadius: '15px',
                  backdropFilter: 'blur(10px)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ color: 'white', margin: '0 0 10px 0' }}>{session.name}</h3>
                      <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '14px' }}>
                        <span>👥 {session.playerCount}/{session.maxPlayers} players</span>
                        <span style={{ margin: '0 15px' }}>⏱️ {session.daysRemaining} days left</span>
                        <span style={{
                          background: session.status === 'active' ? '#28a745' : '#ffc107',
                          color: 'white',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          textTransform: 'uppercase'
                        }}>
                          {session.status}
                        </span>
                      </div>
                    </div>
                    <button 
                      className="btn"
                      onClick={() => handleJoinSession(session.sessionId)}
                      disabled={session.playerCount >= session.maxPlayers}
                      style={{ width: 'auto', padding: '10px 20px' }}
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
        <div>
          {/* User Stats */}
          <div style={{
            background: 'rgba(255,255,255,0.1)',
            padding: '20px',
            borderRadius: '15px',
            marginBottom: '20px',
            backdropFilter: 'blur(10px)'
          }}>
            <h3 style={{ color: 'white', marginBottom: '15px' }}>Your Stats</h3>
            <div style={{ color: 'rgba(255,255,255,0.9)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span>ELO Rating:</span>
                <strong>{user.eloRating}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span>Games Played:</span>
                <strong>{user.gamesPlayed || 0}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span>Total Absorptions:</span>
                <strong>{user.totalAbsorptions || 0}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span>5-Star Movies:</span>
                <strong>{user.fiveStarMovies?.length || 0}</strong>
              </div>
            </div>
          </div>

          {/* Leaderboard */}
          <div style={{
            background: 'rgba(255,255,255,0.1)',
            padding: '20px',
            borderRadius: '15px',
            backdropFilter: 'blur(10px)'
          }}>
            <h3 style={{ color: 'white', marginBottom: '15px' }}>🏆 Leaderboard</h3>
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {leaderboard.slice(0, 10).map((player, index) => (
                <div key={player._id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: index < 9 ? '1px solid rgba(255,255,255,0.1)' : 'none',
                  color: player._id === user.id ? '#ffd700' : 'rgba(255,255,255,0.9)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ 
                      minWidth: '20px',
                      fontWeight: 'bold',
                      color: index < 3 ? '#ffd700' : 'inherit'
                    }}>
                      #{index + 1}
                    </span>
                    <span>{player.username}</span>
                  </div>
                  <span style={{ fontWeight: 'bold' }}>{player.eloRating}</span>
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
