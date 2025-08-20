import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

const Profile = () => {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [newMovie, setNewMovie] = useState({
    title: '',
    year: '',
    director: ''
  });
  const [showAddMovie, setShowAddMovie] = useState(false);

  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('csvFile', file);

    try {
      const response = await axios.post('/api/user/import-letterboxd', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      toast.success(response.data.message);
      updateUser({ fiveStarMovies: [...user.fiveStarMovies, ...response.data.movies] });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to import movies');
    } finally {
      setLoading(false);
    }
  }, [user, updateUser]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv']
    },
    multiple: false
  });

  const handleAddMovie = async (e) => {
    e.preventDefault();
    if (!newMovie.title || !newMovie.year) {
      toast.error('Title and year are required');
      return;
    }

    try {
      const response = await axios.post('/api/user/movies', {
        ...newMovie,
        year: parseInt(newMovie.year),
        rating: 5
      });

      toast.success(response.data.message);
      updateUser({ 
        fiveStarMovies: [...user.fiveStarMovies, response.data.movie] 
      });
      setNewMovie({ title: '', year: '', director: '' });
      setShowAddMovie(false);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add movie');
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      padding: '20px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
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
            <h1 style={{ color: 'white', margin: 0 }}>👤 Profile</h1>
            <p style={{ color: 'rgba(255,255,255,0.8)', margin: '5px 0 0 0' }}>
              {user.username} • ELO: {user.eloRating}
            </p>
          </div>
          <button 
            className="btn btn-secondary"
            onClick={() => navigate('/dashboard')}
            style={{ width: 'auto', padding: '10px 20px' }}
          >
            Back to Dashboard
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
          {/* Movie Import Section */}
          <div style={{
            background: 'rgba(255,255,255,0.1)',
            padding: '25px',
            borderRadius: '15px',
            backdropFilter: 'blur(10px)'
          }}>
            <h2 style={{ color: 'white', marginBottom: '20px' }}>🎬 Import Movies</h2>
            
            {/* Letterboxd Import */}
            <div style={{ marginBottom: '30px' }}>
              <h3 style={{ color: 'white', marginBottom: '15px' }}>From Letterboxd CSV</h3>
              <div
                {...getRootProps()}
                style={{
                  border: '2px dashed rgba(255,255,255,0.3)',
                  borderRadius: '10px',
                  padding: '30px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: isDragActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: 'white',
                  transition: 'all 0.3s ease'
                }}
              >
                <input {...getInputProps()} />
                {loading ? (
                  <div>
                    <div className="spinner" style={{ margin: '0 auto 15px' }}></div>
                    <p>Importing movies...</p>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '48px', marginBottom: '15px' }}>📁</div>
                    {isDragActive ? (
                      <p>Drop your Letterboxd CSV file here...</p>
                    ) : (
                      <div>
                        <p><strong>Drag & drop your Letterboxd CSV file here</strong></p>
                        <p style={{ opacity: 0.8 }}>or click to select file</p>
                        <small style={{ opacity: 0.6 }}>
                          Export your data from Letterboxd Settings → Import & Export
                        </small>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Manual Movie Addition */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ color: 'white', margin: 0 }}>Add Movie Manually</h3>
                <button 
                  className="btn"
                  onClick={() => setShowAddMovie(!showAddMovie)}
                  style={{ width: 'auto', padding: '8px 16px' }}
                >
                  {showAddMovie ? 'Cancel' : 'Add Movie'}
                </button>
              </div>

              {showAddMovie && (
                <form onSubmit={handleAddMovie} style={{
                  background: 'rgba(0,0,0,0.2)',
                  padding: '20px',
                  borderRadius: '10px'
                }}>
                  <div className="form-group">
                    <label style={{ color: 'white' }}>Movie Title</label>
                    <input
                      type="text"
                      value={newMovie.title}
                      onChange={(e) => setNewMovie({...newMovie, title: e.target.value})}
                      required
                      placeholder="e.g., The Godfather"
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    <div className="form-group">
                      <label style={{ color: 'white' }}>Year</label>
                      <input
                        type="number"
                        min="1900"
                        max="2030"
                        value={newMovie.year}
                        onChange={(e) => setNewMovie({...newMovie, year: e.target.value})}
                        required
                        placeholder="1972"
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ color: 'white' }}>Director (Optional)</label>
                      <input
                        type="text"
                        value={newMovie.director}
                        onChange={(e) => setNewMovie({...newMovie, director: e.target.value})}
                        placeholder="Francis Ford Coppola"
                      />
                    </div>
                  </div>
                  <button type="submit" className="btn">
                    Add 5-Star Movie
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Stats & Movies Section */}
          <div>
            {/* User Stats */}
            <div style={{
              background: 'rgba(255,255,255,0.1)',
              padding: '25px',
              borderRadius: '15px',
              marginBottom: '20px',
              backdropFilter: 'blur(10px)'
            }}>
              <h2 style={{ color: 'white', marginBottom: '20px' }}>📊 Your Stats</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div style={{ color: 'white' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{user.eloRating}</div>
                  <div style={{ opacity: 0.8 }}>ELO Rating</div>
                </div>
                <div style={{ color: 'white' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{user.gamesPlayed || 0}</div>
                  <div style={{ opacity: 0.8 }}>Games Played</div>
                </div>
                <div style={{ color: 'white' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{user.totalAbsorptions || 0}</div>
                  <div style={{ opacity: 0.8 }}>Total Absorptions</div>
                </div>
                <div style={{ color: 'white' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{user.fiveStarMovies?.length || 0}</div>
                  <div style={{ opacity: 0.8 }}>5-Star Movies</div>
                </div>
              </div>
            </div>

            {/* Movie List */}
            <div style={{
              background: 'rgba(255,255,255,0.1)',
              padding: '25px',
              borderRadius: '15px',
              backdropFilter: 'blur(10px)'
            }}>
              <h2 style={{ color: 'white', marginBottom: '20px' }}>🌟 Your 5-Star Movies</h2>
              
              {user.fiveStarMovies?.length === 0 ? (
                <div style={{ 
                  textAlign: 'center', 
                  color: 'rgba(255,255,255,0.7)', 
                  padding: '40px 20px' 
                }}>
                  <div style={{ fontSize: '48px', marginBottom: '15px' }}>🎬</div>
                  <p>No movies imported yet</p>
                  <p style={{ fontSize: '14px' }}>
                    Import your Letterboxd data or add movies manually to start playing!
                  </p>
                </div>
              ) : (
                <div style={{ 
                  maxHeight: '400px', 
                  overflowY: 'auto',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: '10px',
                  padding: '15px'
                }}>
                  {user.fiveStarMovies?.slice(0, 50).map((movie, index) => (
                    <div key={index} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 0',
                      borderBottom: index < Math.min(49, user.fiveStarMovies.length - 1) ? 
                                   '1px solid rgba(255,255,255,0.1)' : 'none',
                      color: 'white'
                    }}>
                      <div>
                        <div style={{ fontWeight: 'bold' }}>{movie.title}</div>
                        {movie.director && (
                          <div style={{ fontSize: '12px', opacity: 0.7 }}>
                            {movie.director}
                          </div>
                        )}
                      </div>
                      <div style={{ 
                        background: '#ffd700', 
                        color: '#000', 
                        padding: '2px 8px', 
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}>
                        {movie.year}
                      </div>
                    </div>
                  ))}
                  
                  {user.fiveStarMovies?.length > 50 && (
                    <div style={{ 
                      textAlign: 'center', 
                      color: 'rgba(255,255,255,0.7)', 
                      padding: '15px',
                      fontStyle: 'italic'
                    }}>
                      ... and {user.fiveStarMovies.length - 50} more movies
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
