const express = require('express');
const router = express.Router();
const Fight = require('../models/Fight');
const User = require('../models/User');
const GameSession = require('../models/GameSession');
const auth = require('../middleware/auth');

// Challenge another player to a fight
router.post('/challenge', auth, async (req, res) => {
  try {
    const { defenderId, sessionId } = req.body;
    const challengerId = req.user.id;

    // Validate inputs
    if (!defenderId || !sessionId) {
      return res.status(400).json({ message: 'Defender ID and session ID are required' });
    }

    if (challengerId === defenderId) {
      return res.status(400).json({ message: 'Cannot challenge yourself' });
    }

    // Check if challenger has watched all defender's movies
    const challenger = await User.findById(challengerId);
    const defender = await User.findById(defenderId);

    if (!challenger || !defender) {
      return res.status(404).json({ message: 'Player not found' });
    }

    // Check movie compatibility (challenger must have seen all defender's 5-star movies)
    if (!challenger.canAbsorb(defender)) {
      const missingMovies = challenger.getMissingMovies(defender);
      return res.status(400).json({ 
        message: 'You must watch all of the defender\'s 5-star movies before challenging them',
        missingMovies: missingMovies.slice(0, 5)
      });
    }

    // Check if there's already an active fight between these players
    const existingFight = await Fight.findOne({
      $or: [
        { challengerId, defenderId, status: { $in: ['pending', 'accepted', 'in_progress'] } },
        { challengerId: defenderId, defenderId: challengerId, status: { $in: ['pending', 'accepted', 'in_progress'] } }
      ]
    });

    if (existingFight) {
      return res.status(400).json({ message: 'There is already an active fight between these players' });
    }

    // Create new fight
    const expirationTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours to respond
    
    const fight = new Fight({
      challengerId,
      defenderId,
      sessionId,
      expiresAt: expirationTime,
      mode: 'asynchronous' // Default to async mode
    });

    await fight.save();

    // TODO: Send email notification to defender
    // TODO: Send in-game notification to defender

    res.status(201).json({
      message: 'Challenge sent successfully',
      fightId: fight._id,
      expiresAt: fight.expiresAt
    });

  } catch (error) {
    console.error('Error creating fight challenge:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Accept or decline a fight challenge
router.post('/respond/:fightId', auth, async (req, res) => {
  try {
    const { fightId } = req.params;
    const { response } = req.body; // 'accept' or 'decline'
    const defenderId = req.user.id;

    const fight = await Fight.findById(fightId);
    if (!fight) {
      return res.status(404).json({ message: 'Fight not found' });
    }

    if (fight.defenderId.toString() !== defenderId) {
      return res.status(403).json({ message: 'You are not the defender of this fight' });
    }

    if (fight.status !== 'pending') {
      return res.status(400).json({ message: 'Fight is no longer pending' });
    }

    if (fight.isExpired()) {
      fight.status = 'expired';
      await fight.save();
      return res.status(400).json({ message: 'Fight challenge has expired' });
    }

    if (response === 'accept') {
      fight.status = 'accepted';
      fight.acceptedAt = new Date();
      await fight.startFight();
      await fight.save();

      res.json({
        message: 'Fight accepted and started',
        fight: {
          id: fight._id,
          moviePool: fight.moviePool,
          questions: fight.questions.map(q => ({
            movieTitle: q.movieTitle,
            movieYear: q.movieYear,
            question: q.question,
            questionType: q.questionType
          }))
        }
      });
    } else if (response === 'decline') {
      fight.status = 'declined';
      await fight.save();

      res.json({ message: 'Fight declined' });
    } else {
      res.status(400).json({ message: 'Invalid response. Use "accept" or "decline"' });
    }

  } catch (error) {
    console.error('Error responding to fight:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get pending fights for a user
router.get('/pending', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const pendingFights = await Fight.find({
      $or: [
        { challengerId: userId, status: 'pending' },
        { defenderId: userId, status: 'pending' }
      ]
    }).populate('challengerId defenderId', 'username');

    res.json(pendingFights);

  } catch (error) {
    console.error('Error fetching pending fights:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get active fights for a user
router.get('/active', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const activeFights = await Fight.find({
      $or: [
        { challengerId: userId, status: { $in: ['accepted', 'in_progress'] } },
        { defenderId: userId, status: { $in: ['accepted', 'in_progress'] } }
      ]
    }).populate('challengerId defenderId', 'username');

    res.json(activeFights);

  } catch (error) {
    console.error('Error fetching active fights:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Submit answers for a fight
router.post('/submit-answers/:fightId', auth, async (req, res) => {
  try {
    const { fightId } = req.params;
    const { answers } = req.body; // Array of { questionId, text, timeToAnswer }
    const playerId = req.user.id;

    const fight = await Fight.findById(fightId);
    if (!fight) {
      return res.status(404).json({ message: 'Fight not found' });
    }

    if (fight.status !== 'in_progress') {
      return res.status(400).json({ message: 'Fight is not in progress' });
    }

    const isChallenger = fight.challengerId.toString() === playerId;
    const isDefender = fight.defenderId.toString() === playerId;

    if (!isChallenger && !isDefender) {
      return res.status(403).json({ message: 'You are not a participant in this fight' });
    }

    // Check for duplicate submissions to prevent multiple API calls
    const existingAnswers = fight.answers.filter(a => a.playerId.toString() === playerId);
    const duplicateIndices = new Set(existingAnswers.map(a => a.questionIndex));
    
    // Filter out already submitted answers
    console.log(answers)
    const newAnswers = answers.filter(answer => !duplicateIndices.has(answer.questionIndex));
    
    if (newAnswers.length === 0) {
      return res.status(400).json({ message: 'All answers already submitted' });
    }

    let processedAnswers = [];
    if (newAnswers.length > 0) {
      try {
        const batchResults = await fight.evaluateAnswerBatch(newAnswers);
        
        // Check if the number of results matches
        if (batchResults.length !== newAnswers.length) {
          throw new Error(`Batch evaluation returned ${batchResults.length} results, expected ${newAnswers.length}`);
        }
        
        processedAnswers = newAnswers.map((answer, index) => ({
          questionIndex: answer.questionIndex,
          answer: answer.answer,
          isCorrect: batchResults[index].correct,
          explanation: batchResults[index].explanation,
          evaluationMethod: batchResults[index].evaluationMethod,
          submittedAt: new Date(),
          timeToAnswer: answer.timeToAnswer,
          playerId
        }));
      } catch (error) {
        console.error('Batch evaluation encountered an error:', error);
        // Fallback to individual processing
        for (const answer of newAnswers) {
          const question = fight.questions.find(q => q._id.equals(answer.questionId));
          if (!question) {
            return res.status(400).json({ error: `Question not found for answer: ${answer.questionId}` });
          }

          const evaluation = await fight.evaluateAnswer(
            answer.answer,  // userAnswer
            question.correctAnswer,  // expectedAnswer
            question.question,  // question text
            question.movieTitle  // movieTitle
          );

          processedAnswers.push({
            questionIndex: answer.questionIndex,
            answer: answer.answer,
            isCorrect: evaluation.correct,
            explanation: evaluation.explanation,
            evaluationMethod: evaluation.evaluationMethod,
            submittedAt: new Date(),
            timeToAnswer: answer.timeToAnswer,
            playerId
          });
        }
      }
    }

    // Add answers to the fight
    fight.answers.push(...processedAnswers);

    // Check if both players have answered all questions
    const challengerAnswers = fight.answers.filter(a => a.playerId.toString() === fight.challengerId.toString());
    const defenderAnswers = fight.answers.filter(a => a.playerId.toString() === fight.defenderId.toString());

    if (challengerAnswers.length >= fight.questions.length && defenderAnswers.length >= fight.questions.length) {
      // Both players have answered all questions, calculate results
      const results = fight.calculateResults();
      fight.status = 'completed';
      fight.completedAt = new Date();
    }

    await fight.save();

    // Return detailed feedback about answers
    const answerFeedback = processedAnswers.map(answer => ({
      questionIndex: answer.questionIndex,
      isCorrect: answer.isCorrect,
      explanation: answer.explanation,
      method: answer.evaluationMethod
    }));

    res.json({
      message: 'Answers submitted successfully',
      answersRemaining: fight.questions.length - (isChallenger ? challengerAnswers.length : defenderAnswers.length),
      feedback: answerFeedback,
      fightCompleted: fight.status === 'completed'
    });

  } catch (error) {
    console.error('Error submitting fight answers:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get fight details
router.get('/:fightId', auth, async (req, res) => {
  try {
    const { fightId } = req.params;
    const userId = req.user.id;

    const fight = await Fight.findById(fightId)
      .populate('challengerId defenderId winnerId', 'username');

    if (!fight) {
      return res.status(404).json({ message: 'Fight not found' });
    }

    const isParticipant = fight.challengerId._id.toString() === userId || 
                         fight.defenderId._id.toString() === userId;

    if (!isParticipant) {
      return res.status(403).json({ message: 'You are not a participant in this fight' });
    }

    res.json(fight);

  } catch (error) {
    console.error('Error fetching fight details:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Wheel of fortune movie selection (for real-time mode)
router.post('/wheel-select/:fightId', auth, async (req, res) => {
  try {
    const { fightId } = req.params;
    const { selectedMovieIndex } = req.body;
    const userId = req.user.id;

    const fight = await Fight.findById(fightId);
    if (!fight) {
      return res.status(404).json({ message: 'Fight not found' });
    }

    if (fight.status !== 'in_progress') {
      return res.status(400).json({ message: 'Fight is not in progress' });
    }

    const isParticipant = fight.challengerId.toString() === userId || 
                         fight.defenderId.toString() === userId;

    if (!isParticipant) {
      return res.status(403).json({ message: 'You are not a participant in this fight' });
    }

    if (selectedMovieIndex < 0 || selectedMovieIndex >= fight.moviePool.length) {
      return res.status(400).json({ message: 'Invalid movie selection' });
    }

    fight.wheelSelection = {
      selectedMovieIndex,
      selectionTime: new Date()
    };

    await fight.save();

    res.json({
      message: 'Movie selected',
      selectedMovie: fight.moviePool[selectedMovieIndex],
      question: fight.questions[selectedMovieIndex]
    });

  } catch (error) {
    console.error('Error selecting movie:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
