import React, { useState, useEffect } from 'react';
import axios from '../../utils/axiosConfig';
import WheelOfFortune from './WheelOfFortune';
import QuizInterface from './QuizInterface';
import './FightModal.css';

const FightModal = ({ 
  isOpen, 
  onClose, 
  opponent, 
  sessionId, 
  user, 
  mode = 'challenge', // 'challenge', 'respond', 'active'
  fightData
}) => {
  const [currentStep, setCurrentStep] = useState('challenge'); // challenge, wheel, quiz, results
  const [fight, setFight] = useState(null);
  const [moviePool, setMoviePool] = useState([]);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && mode === 'challenge') {
      setCurrentStep('challenge');
    } else if (isOpen && mode === 'respond') {
      setCurrentStep('respond');

    } else if (isOpen && mode === 'active') {
      setCurrentStep('wheel');
    }
  }, [isOpen, mode]);

  // Normalize and hydrate fight from incoming props when modal opens
  useEffect(() => {
    if (!isOpen) return;
    if (fightData) {
      const normalized = fightData && {
        ...fightData,
        _id: fightData._id || fightData.id,
      };
      setFight(normalized);
      // If we have details, prefill relevant state
      if (normalized?.moviePool?.length) setMoviePool(normalized.moviePool);
      if (normalized?.questions?.length) setQuestions(normalized.questions);
    }
  }, [isOpen, fightData]);

  // If modal opens without fightData, try to find the relevant fight for this opponent/user
  useEffect(() => {
    const hydrateFromServer = async () => {
      if (!isOpen) return;
      if (fight || !opponent || !user) return;
      try {
        if (mode === 'respond') {
          const res = await axios.get('/api/fight/pending');
          const list = Array.isArray(res.data) ? res.data : [];
          const match = list.find(f => (
            f?.defenderId?._id === (user._id || user.id) && f?.challengerId?._id === (opponent._id || opponent.id)
          ));
          if (match) {
            const normalized = { ...match, _id: match._id || match.id };
            setFight(normalized);
          }
        } else if (mode === 'active') {
          const res = await axios.get('/api/fight/active');
          const list = Array.isArray(res.data) ? res.data : [];
          const myId = (user._id || user.id);
          const oppId = (opponent._id || opponent.id);
          const match = list.find(f => (
            (f?.challengerId?._id === myId && f?.defenderId?._id === oppId) ||
            (f?.defenderId?._id === myId && f?.challengerId?._id === oppId)
          ));
          if (match) {
            const normalized = { ...match, _id: match._id || match.id };
            setFight(normalized);
          }
        }
      } catch (e) {
        // Ignore; UI can still proceed when socket updates arrive
      }
    };
    hydrateFromServer();
  }, [isOpen, mode, fight, opponent, user]);

  // If in active mode but details are missing, try fetching full fight details
  useEffect(() => {
    const fetchDetailsIfNeeded = async () => {
      if (!isOpen) return;
      if (mode !== 'active') return;
      if (!fight?._id) return;
      const needsDetails = !moviePool.length || !questions.length;
      if (!needsDetails) return;
      try {
        const res = await axios.get(`/api/fight/${fight._id}`);
        const f = res.data || {};
        const normalized = { ...f, _id: f._id || f.id };
        setFight(normalized);
        if (Array.isArray(normalized.moviePool)) setMoviePool(normalized.moviePool);
        if (Array.isArray(normalized.questions)) setQuestions(normalized.questions);
      } catch (e) {
        // Non-fatal; user can still proceed when server pushes details
      }
    };
    fetchDetailsIfNeeded();
  }, [isOpen, mode, fight?._id, moviePool.length, questions.length]);

  const handleChallenge = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await axios.post('/api/fight/challenge', {
        defenderId: opponent.id,
        sessionId
      });
      
      // Server returns { message, fightId, expiresAt }
      setFight({ _id: response.data.fightId, expiresAt: response.data.expiresAt });
      setCurrentStep('waiting');
      onClose(); // Close modal and wait for response
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send challenge');
    } finally {
      setLoading(false);
    }
  };

  const handleResponse = async (response) => {
    setLoading(true);
    setError('');
    
    try {
      const result = await axios.post(`/api/fight/respond/${fight._id}`, {
        response
      });

      if (response === 'accept') {
        const f = result.data.fight || {};
        const normalized = { ...f, _id: f._id || f.id };
        setFight(normalized);
        setMoviePool(normalized.moviePool || []);
        setQuestions((normalized.questions || []).map(q => ({ ...q })));
        setCurrentStep('wheel');
      } else {
        onClose();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to respond to challenge');
    } finally {
      setLoading(false);
    }
  };

  const handleMovieSelected = async (movie, index) => {
    setSelectedMovie(movie);
    
    try {
      await axios.post(`/api/fight/wheel-select/${fight._id}`, {
        selectedMovieIndex: index
      });
      
      // Move to quiz after a short delay
      setTimeout(() => {
        setCurrentStep('quiz');
      }, 2000);
    } catch (err) {
      setError('Failed to select movie');
    }
  };

  const handleQuizComplete = async (userAnswers) => {
    setAnswers(userAnswers);
    setLoading(true);
    
    try {
      await axios.post(`/api/fight/submit-answers/${fight._id}`, {
        answers: userAnswers
      });
      
      setCurrentStep('results');
    } catch (err) {
      setError('Failed to submit answers');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fight-modal-overlay">
      <div className="fight-modal">
        <div className="fight-modal-header">
          <h2>🥊 Movie Fight!</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="fight-modal-content">
          {currentStep === 'challenge' && (
            <div className="challenge-step">
              <div className="opponent-info">
                <h3>Challenge {opponent.username}?</h3>
                <p>You've watched all of {opponent.username}'s favorite movies!</p>
                <p>Ready to test your knowledge in a movie quiz duel?</p>
              </div>
              
              <div className="challenge-actions">
                <button 
                  className="btn btn-primary"
                  onClick={handleChallenge}
                  disabled={loading}
                >
                  {loading ? 'Sending Challenge...' : '⚔️ Send Challenge'}
                </button>
                <button className="btn btn-secondary" onClick={onClose}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {currentStep === 'respond' && (
            <div className="respond-step">
              <div className="challenge-info">
                <h3>{opponent.username} challenges you!</h3>
                <p>They want to test their knowledge of your favorite movies.</p>
                <p>Do you accept this duel?</p>
                {timeRemaining && (
                  <div className="time-remaining">
                    Time to respond: {Math.ceil(timeRemaining / 1000 / 60)} minutes
                  </div>
                )}
              </div>
              
              <div className="response-actions">
                <button 
                  className="btn btn-primary"
                  onClick={() => handleResponse('accept')}
                  disabled={loading}
                >
                  {loading ? 'Accepting...' : '✅ Accept Challenge'}
                </button>
                <button 
                  className="btn btn-danger"
                  onClick={() => handleResponse('decline')}
                  disabled={loading}
                >
                  ❌ Decline
                </button>
              </div>
            </div>
          )}

          {currentStep === 'waiting' && (
            <div className="waiting-step">
              <div className="waiting-info">
                <h3>Challenge Sent!</h3>
                <p>Waiting for {opponent.username} to respond...</p>
                <div className="spinner"></div>
              </div>
            </div>
          )}

          {currentStep === 'wheel' && (
            <div className="wheel-step">
              <WheelOfFortune
                movies={moviePool}
                onMovieSelected={handleMovieSelected}
                isSpinning={isSpinning}
                setIsSpinning={setIsSpinning}
              />
            </div>
          )}

          {currentStep === 'quiz' && (
            <div className="quiz-step">
              <QuizInterface
              user={user}
                questions={questions}
                selectedMovie={selectedMovie}
                onComplete={handleQuizComplete}
                opponent={opponent}
              />
            </div>
          )}

          {currentStep === 'results' && (
            <div className="results-step">
              <div className="fight-results">
                <h3>🏆 Fight Results</h3>
                <div className="score-display">
                  <div className="player-score">
                    <span className="player-name">{user.username}</span>
                    <span className="score">{fight?.challengerScore || 0}</span>
                  </div>
                  <div className="vs">VS</div>
                  <div className="player-score">
                    <span className="player-name">{opponent.username}</span>
                    <span className="score">{fight?.defenderScore || 0}</span>
                  </div>
                </div>
                
                <div className="winner-announcement">
                  {fight?.winnerId === user.id ? (
                    <div className="victory">🎉 Victory! You won the fight!</div>
                  ) : fight?.winnerId === opponent.id ? (
                    <div className="defeat">😔 Defeat! Better luck next time!</div>
                  ) : (
                    <div className="tie">🤝 It's a tie! Great fight!</div>
                  )}
                </div>

                <button className="btn btn-primary" onClick={onClose}>
                  Close
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FightModal;
