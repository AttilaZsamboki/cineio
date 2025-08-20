import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const Register = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    letterboxdUsername: ''
  });
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      return;
    }

    setLoading(true);

    const result = await register({
      username: formData.username,
      email: formData.email,
      password: formData.password,
      letterboxdUsername: formData.letterboxdUsername
    });
    
    if (result.success) {
      navigate('/dashboard');
    }
    
    setLoading(false);
  };

  return (
    <div className="loading-screen">
      <div className="form-container">
        <h1 style={{ textAlign: 'center', marginBottom: '30px', color: '#333' }}>
          🎬 Cinephile Agar
        </h1>
        <h2 style={{ textAlign: 'center', marginBottom: '30px', color: '#666' }}>
          Create Account
        </h2>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              required
              minLength="3"
              maxLength="20"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="letterboxdUsername">Letterboxd Username (Optional)</label>
            <input
              type="text"
              id="letterboxdUsername"
              name="letterboxdUsername"
              value={formData.letterboxdUsername}
              onChange={handleChange}
              disabled={loading}
              placeholder="Your Letterboxd username"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              minLength="6"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              disabled={loading}
              style={{
                borderColor: formData.password && formData.confirmPassword && 
                           formData.password !== formData.confirmPassword ? '#dc3545' : '#ddd'
              }}
            />
            {formData.password && formData.confirmPassword && 
             formData.password !== formData.confirmPassword && (
              <small style={{ color: '#dc3545' }}>Passwords do not match</small>
            )}
          </div>

          <button 
            type="submit" 
            className="btn"
            disabled={loading || (formData.password && formData.confirmPassword && 
                     formData.password !== formData.confirmPassword)}
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '20px', color: '#666' }}>
          Already have an account?{' '}
          <Link 
            to="/login" 
            style={{ color: '#667eea', textDecoration: 'none', fontWeight: '600' }}
          >
            Login
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
