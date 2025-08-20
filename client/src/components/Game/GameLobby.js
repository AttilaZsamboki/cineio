import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';

const GameLobby = () => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const response = await axios.get('/api/game/sessions');
      setSessions(response.data);
    } catch (error) {
      toast.error('Failed to load sessions');
    } finally {
      setLoading(false);
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
        <h2>Loading Game Lobby...</h2>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      padding: '20px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto'
      }}>
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
          <h1 style={{ color: 'white', margin: 0 }}>🎮 Game Lobby</h1>
          <button 
            className="btn btn-secondary"
            onClick={() => navigate('/dashboard')}
            style={{ width: 'auto', padding: '10px 20px' }}
          >
            Back to Dashboard
          </button>
        </div>

        <div style={{ display: 'grid', gap: '20px' }}>
          {sessions.length === 0 ? (
            <div style={{
              background: 'rgba(255,255,255,0.1)',
              padding: '60px',
              borderRadius: '15px',
              textAlign: 'center',
              color: 'white'
            }}>
              <h2>No Active Sessions</h2>
              <p>Create a new session from the dashboard to start playing!</p>
              <button 
                className="btn"
                onClick={() => navigate('/dashboard')}
                style={{ width: 'auto', padding: '12px 24px', marginTop: '20px' }}
              >
                Go to Dashboard
              </button>
            </div>
          ) : (
            sessions.map(session => (
              <div key={session.id} style={{
                background: 'rgba(255,255,255,0.1)',
                padding: '25px',
                borderRadius: '15px',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.2)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <h2 style={{ color: 'white', margin: '0 0 15px 0', fontSize: '24px' }}>
                      {session.name}
                    </h2>
                    
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '15px',
                      marginBottom: '20px'
                    }}>
                      <div style={{ color: 'rgba(255,255,255,0.9)' }}>
                        <div style={{ fontSize: '14px', opacity: 0.8 }}>Players</div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                          👥 {session.playerCount}/{session.maxPlayers}
                        </div>
                      </div>
                      
                      <div style={{ color: 'rgba(255,255,255,0.9)' }}>
                        <div style={{ fontSize: '14px', opacity: 0.8 }}>Time Remaining</div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                          ⏱️ {session.daysRemaining} days
                        </div>
                      </div>
                      
                      <div style={{ color: 'rgba(255,255,255,0.9)' }}>
                        <div style={{ fontSize: '14px', opacity: 0.8 }}>Status</div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                          <span style={{
                            background: session.status === 'active' ? '#28a745' : 
                                       session.status === 'waiting' ? '#ffc107' : '#dc3545',
                            color: 'white',
                            padding: '4px 12px',
                            borderRadius: '15px',
                            fontSize: '14px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            {session.status}
                          </span>
                        </div>
                      </div>
                      
                      <div style={{ color: 'rgba(255,255,255,0.9)' }}>
                        <div style={{ fontSize: '14px', opacity: 0.8 }}>Duration</div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                          📅 {session.duration} days
                        </div>
                      </div>
                    </div>

                    <div style={{ 
                      background: 'rgba(0,0,0,0.2)', 
                      padding: '15px', 
                      borderRadius: '10px',
                      marginBottom: '15px'
                    }}>
                      <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', marginBottom: '5px' }}>
                        Session Info
                      </div>
                      <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '14px', lineHeight: '1.5' }}>
                        Long-running cinephile battle where players absorb others by having seen all their 5-star movies. 
                        Use strategy, build your watchlist, and climb the ELO ladder!
                      </div>
                    </div>
                  </div>

                  <div style={{ marginLeft: '20px' }}>
                    <button 
                      className="btn"
                      onClick={() => handleJoinSession(session.sessionId)}
                      disabled={session.playerCount >= session.maxPlayers}
                      style={{ 
                        width: '120px', 
                        padding: '12px 20px',
                        fontSize: '16px',
                        fontWeight: 'bold'
                      }}
                    >
                      {session.playerCount >= session.maxPlayers ? '🔒 Full' : '🚀 Join'}
                    </button>
                    
                    {session.playerCount >= session.maxPlayers && (
                      <div style={{ 
                        color: 'rgba(255,255,255,0.7)', 
                        fontSize: '12px', 
                        textAlign: 'center',
                        marginTop: '5px'
                      }}>
                        Session is full
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default GameLobby;
