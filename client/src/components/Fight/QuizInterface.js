import React, { useState, useEffect } from 'react';
import './QuizInterface.css';

const QuizInterface = ({ questions, selectedMovie, onComplete, opponent, user }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(60); // 60 seconds per question
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentQuestion = questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === questions.length - 1;

  useEffect(() => {
    setQuestionStartTime(Date.now());
    setTimeRemaining(60);
    setCurrentAnswer('');
  }, [currentQuestionIndex]);

  useEffect(() => {
    if (timeRemaining > 0) {
      const timer = setTimeout(() => {
        setTimeRemaining(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      // Time's up, auto-submit current answer
      handleSubmitAnswer();
    }
  }, [timeRemaining]);

  const handleSubmitAnswer = () => {
    if (isSubmitting) return;
    
    const timeToAnswer = Date.now() - questionStartTime;
    const newAnswer = {
      questionIndex: currentQuestionIndex,
      answer: currentAnswer.trim(),
      timeToAnswer,
      playerId: user.id,
    };

    const updatedAnswers = [...answers, newAnswer];
    setAnswers(updatedAnswers);

    if (isLastQuestion) {
      // Quiz complete
      onComplete(updatedAnswers);
    } else {
      // Move to next question
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const handleNextQuestion = () => {
    if (currentAnswer.trim()) {
      handleSubmitAnswer();
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTimeColor = () => {
    if (timeRemaining > 30) return '#4CAF50';
    if (timeRemaining > 10) return '#FF9800';
    return '#f44336';
  };

  if (!currentQuestion) {
    return (
      <div className="quiz-interface">
        <div className="loading">Loading questions...</div>
      </div>
    );
  }

  return (
    <div className="quiz-interface">
      <div className="quiz-header">
        <div className="question-progress">
          Question {currentQuestionIndex + 1} of {questions.length}
        </div>
        <div 
          className="timer"
          style={{ color: getTimeColor() }}
        >
          ⏱️ {formatTime(timeRemaining)}
        </div>
      </div>

      <div className="movie-context">
        <h3>🎬 {currentQuestion.movieTitle}</h3>
        {currentQuestion.movieYear && (
          <span className="movie-year">({currentQuestion.movieYear})</span>
        )}
      </div>

      <div className="question-card">
        <div className="question-text">
          {currentQuestion.question}
        </div>

        {currentQuestion.questionType === 'multiple_choice' && currentQuestion.options ? (
          <div className="multiple-choice-options">
            {currentQuestion.options.map((option, index) => (
              <button
                key={index}
                className={`option-button ${currentAnswer === option ? 'selected' : ''}`}
                onClick={() => setCurrentAnswer(option)}
              >
                {String.fromCharCode(65 + index)}. {option}
              </button>
            ))}
          </div>
        ) : (
          <div className="open-ended-input">
            <textarea
              value={currentAnswer}
              onChange={(e) => setCurrentAnswer(e.target.value)}
              placeholder="Type your answer here..."
              className="answer-input"
              rows={3}
              maxLength={500}
            />
            <div className="character-count">
              {currentAnswer.length}/500
            </div>
          </div>
        )}
      </div>

      <div className="quiz-actions">
        <button
          className="btn btn-primary"
          onClick={handleNextQuestion}
          disabled={!currentAnswer.trim() || isSubmitting}
        >
          {isLastQuestion ? '🏁 Finish Quiz' : '➡️ Next Question'}
        </button>
        
        <button
          className="btn btn-secondary"
          onClick={handleSubmitAnswer}
          disabled={isSubmitting}
        >
          ⏭️ Skip
        </button>
      </div>

      <div className="progress-bar">
        <div 
          className="progress-fill"
          style={{ 
            width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` 
          }}
        />
      </div>

      <div className="quiz-info">
        <p>💡 <strong>Tip:</strong> Be specific and detailed in your answers!</p>
        <p>🎯 You're competing against <strong>{opponent.username}</strong></p>
      </div>
    </div>
  );
};

export default QuizInterface;
