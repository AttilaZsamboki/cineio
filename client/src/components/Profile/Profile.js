import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

const Profile = () => {
  const { user, getCurrentUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [loadingWatched, setLoadingWatched] = useState(false);
  const [newMovie, setNewMovie] = useState({
    title: '',
    year: '',
    director: ''
  });
  const [showAddMovie, setShowAddMovie] = useState(false);
  const [watchedMovie, setWatchedMovie] = useState({
    title: '',
    year: '',
    director: '',
    rating: 3,
    letterboxdUrl: ''
  });
  const [showAddWatched, setShowAddWatched] = useState(false);

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
      // Refresh full user to sync watched/five-star counts and lists
      await getCurrentUser();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to import movies');
    } finally {
      setLoading(false);
    }
  }, [getCurrentUser]);

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
      await getCurrentUser();
      setNewMovie({ title: '', year: '', director: '' });
      setShowAddMovie(false);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add movie');
    }
  };

  // Dropzone for generic watched import
  const onDropWatched = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file');
      return;
    }

    setLoadingWatched(true);
    const formData = new FormData();
    formData.append('csvFile', file);

    try {
      const response = await axios.post('/api/user/import-watched', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(response.data.message);
      await getCurrentUser();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to import watched movies');
    } finally {
      setLoadingWatched(false);
    }
  }, [getCurrentUser]);

  const { getRootProps: getWatchedRootProps, getInputProps: getWatchedInputProps, isDragActive: isDragActiveWatched } = useDropzone({
    onDrop: onDropWatched,
    accept: { 'text/csv': ['.csv'] },
    multiple: false
  });

  const handleAddWatched = async (e) => {
    e.preventDefault();
    if (!watchedMovie.title || !watchedMovie.year) {
      toast.error('Title and year are required');
      return;
    }
    try {
      const payload = {
        ...watchedMovie,
        year: parseInt(watchedMovie.year, 10),
        rating: parseInt(watchedMovie.rating, 10)
      };
      const res = await axios.post('/api/user/watched-movies', payload);
      toast.success(res.data.message);
      await getCurrentUser();
      setWatchedMovie({ title: '', year: '', director: '', rating: 3, letterboxdUrl: '' });
      setShowAddWatched(false);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save watched movie');
    }
  };

  return (
    <div className="profile-container">
      <div className="profile-content">
        {/* Header */}
        <div className="profile-header">
          <div className="profile-title">
            <h1>👤 Profile</h1>
            <p>{user.username} • ELO: {user.eloRating}</p>
          </div>
          <button 
            className="btn btn-secondary dashboard-btn"
            onClick={() => navigate('/dashboard')}
          >
            Back to Dashboard
          </button>
        </div>

        <div className="profile-grid">
          {/* Movie Import Section */}
          <div className="glass-card import-section">
            <h2>🎬 Import Movies</h2>
            
            {/* Letterboxd Import */}
            <div className="import-section-item">
              <h3>From Letterboxd CSV</h3>
              <div
                {...getRootProps()}
                className={`dropzone ${isDragActive ? 'active' : ''}`}
              >
                <input {...getInputProps()} />
                {loading ? (
                  <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Importing movies...</p>
                  </div>
                ) : (
                  <div className="dropzone-content">
                    <div className="dropzone-icon">📁</div>
                    {isDragActive ? (
                      <p>Drop your Letterboxd CSV file here...</p>
                    ) : (
                      <div>
                        <p className="dropzone-main">Drag & drop your Letterboxd CSV file here</p>
                        <p className="dropzone-sub">or click to select file</p>
                        <small className="dropzone-hint">
                          Export your data from Letterboxd Settings → Import & Export
                        </small>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Generic Watched Import */}
            <div className="import-section-item">
              <h3>Import Watched Movies (CSV)</h3>
              <div
                {...getWatchedRootProps()}
                className={`dropzone ${isDragActiveWatched ? 'active' : ''}`}
              >
                <input {...getWatchedInputProps()} />
                {loadingWatched ? (
                  <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Importing watched movies...</p>
                  </div>
                ) : (
                  <div className="dropzone-content">
                    <div className="dropzone-icon">📥</div>
                    {isDragActiveWatched ? (
                      <p>Drop your CSV file here...</p>
                    ) : (
                      <div>
                        <p className="dropzone-main">Drag & drop your watched CSV here</p>
                        <p className="dropzone-sub">or click to select file</p>
                        <small className="dropzone-hint">
                          Columns supported: Name/Title, Year, Rating (optional), Letterboxd URI/Url
                        </small>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Manual Movie Addition */}
            <div className="manual-add-section">
              <div className="section-header">
                <h3>Add Movie Manually</h3>
                <button 
                  className="btn dashboard-btn"
                  onClick={() => setShowAddMovie(!showAddMovie)}
                >
                  {showAddMovie ? 'Cancel' : 'Add Movie'}
                </button>
              </div>

              {showAddMovie && (
                <form onSubmit={handleAddMovie} className="manual-form">
                  <div className="form-group">
                    <label>Movie Title</label>
                    <input
                      type="text"
                      value={newMovie.title}
                      onChange={(e) => setNewMovie({...newMovie, title: e.target.value})}
                      required
                      placeholder="e.g., The Godfather"
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Year</label>
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
                      <label>Director (Optional)</label>
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

            {/* Add/Update Watched Movie Manually */}
            <div className="glass-card watched-section">
              <div className="section-header">
                <h3>Add/Update Watched Movie</h3>
                <button 
                  className="btn dashboard-btn"
                  onClick={() => setShowAddWatched(!showAddWatched)}
                >
                  {showAddWatched ? 'Cancel' : 'Add Watched Movie'}
                </button>
              </div>

              {showAddWatched && (
                <form onSubmit={handleAddWatched} className="manual-form">
                  <div className="form-group">
                    <label>Movie Title</label>
                    <input
                      type="text"
                      value={watchedMovie.title}
                      onChange={(e) => setWatchedMovie({ ...watchedMovie, title: e.target.value })}
                      required
                      placeholder="e.g., Zodiac"
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Year</label>
                      <input
                        type="number"
                        min="1900"
                        max="2030"
                        value={watchedMovie.year}
                        onChange={(e) => setWatchedMovie({ ...watchedMovie, year: e.target.value })}
                        required
                        placeholder="2007"
                      />
                    </div>
                    <div className="form-group">
                      <label>Director (Optional)</label>
                      <input
                        type="text"
                        value={watchedMovie.director}
                        onChange={(e) => setWatchedMovie({ ...watchedMovie, director: e.target.value })}
                        placeholder="David Fincher"
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Rating (1-5)</label>
                      <select
                        value={watchedMovie.rating}
                        onChange={(e) => setWatchedMovie({ ...watchedMovie, rating: e.target.value })}
                      >
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                        <option value={3}>3</option>
                        <option value={4}>4</option>
                        <option value={5}>5</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Letterboxd URL (Optional)</label>
                      <input
                        type="url"
                        value={watchedMovie.letterboxdUrl}
                        onChange={(e) => setWatchedMovie({ ...watchedMovie, letterboxdUrl: e.target.value })}
                        placeholder="https://letterboxd.com/film/zodiac/"
                      />
                    </div>
                  </div>
                  <button type="submit" className="btn">
                    Save Watched Movie
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Stats & Movies Section */}
          <div className="stats-section">
            {/* User Stats */}
            <div className="glass-card profile-stats">
              <h2>📊 Your Stats</h2>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{user.eloRating}</div>
                  <div className="stat-label">ELO Rating</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{user.gamesPlayed || 0}</div>
                  <div className="stat-label">Games Played</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{user.totalAbsorptions || 0}</div>
                  <div className="stat-label">Total Absorptions</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{user.fiveStarMovies?.length || 0}</div>
                  <div className="stat-label">5-Star Movies</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{user.watchedMovies?.length || 0}</div>
                  <div className="stat-label">Watched Movies</div>
                </div>
              </div>
            </div>

            {/* Movie List */}
            <div className="glass-card movies-list">
              <h2>🌟 Your 5-Star Movies</h2>
              
              {user.fiveStarMovies?.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">🎬</div>
                  <p>No movies imported yet</p>
                  <p className="empty-hint">
                    Import your Letterboxd data or add movies manually to start playing!
                  </p>
                </div>
              ) : (
                <div className="movies-scroll">
                  {user.fiveStarMovies?.slice(0, 50).map((movie, index) => (
                    <div key={index} className="movie-item">
                      <div className="movie-info">
                        <div className="movie-title">{movie.title}</div>
                        {movie.director && (
                          <div className="movie-director">
                            {movie.director}
                          </div>
                        )}
                      </div>
                      <div className="movie-year">
                        {movie.year}
                      </div>
                    </div>
                  ))}
                  
                  {user.fiveStarMovies?.length > 50 && (
                    <div className="movies-more">
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
