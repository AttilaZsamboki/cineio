const mongoose = require('mongoose');
const OpenAI = require('openai');

const questionSchema = new mongoose.Schema({
  movieTitle: { type: String, required: true },
  movieYear: { type: Number, required: true },
  question: { type: String, required: true },
  // Initially unknown; will be filled later by AI or manual review
  correctAnswer: { type: String, required: false, default: '' },
  options: [{ type: String }], // Multiple choice options (optional)
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
  questionType: { type: String, enum: ['multiple_choice', 'open_ended'], default: 'open_ended' }
});

const answerSchema = new mongoose.Schema({
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  questionIndex: { type: Number, required: true },
  answer: { type: String },
  isCorrect: { type: Boolean, required: true },
  timeToAnswer: { type: Number, required: true }, // milliseconds
  answeredAt: { type: Date, default: Date.now },
  evaluationMethod: { type: String, enum: ['ai', 'fallback'], default: 'fallback' },
  evaluationExplanation: { type: String, default: '' }
});

const fightSchema = new mongoose.Schema({
  challengerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  defenderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sessionId: { type: String, required: true },
  
  // Movie pool (10 random 5-star movies from defender)
  moviePool: [{
    title: { type: String, required: true },
    year: { type: Number, required: true },
    director: { type: String },
    letterboxdUrl: { type: String }
  }],
  
  // Fight status
  status: {
    type: String,
    enum: ['pending', 'accepted', 'in_progress', 'completed', 'expired', 'declined'],
    default: 'pending'
  },
  
  // Timing
  challengedAt: { type: Date, default: Date.now },
  acceptedAt: { type: Date },
  expiresAt: { type: Date, required: true },
  completedAt: { type: Date },
  
  // Quiz data
  questions: [questionSchema],
  answers: [answerSchema],
  
  // Scoring
  challengerScore: { type: Number, default: 0 },
  defenderScore: { type: Number, default: 0 },
  winnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Fight mode
  mode: {
    type: String,
    enum: ['real_time', 'asynchronous'],
    default: 'asynchronous'
  },
  
  // Real-time specific data
  currentQuestionIndex: { type: Number, default: 0 },
  questionStartTime: { type: Date },
  wheelSelection: {
    selectedMovieIndex: { type: Number },
    selectionTime: { type: Date }
  },
  
  // Asynchronous mode data
  challengerAnswers: [{
    questionIndex: { type: Number },
    answer: { type: String },
    timeToAnswer: { type: Number },
    answeredAt: { type: Date }
  }],
  defenderAnswers: [{
    questionIndex: { type: Number },
    answer: { type: String },
    timeToAnswer: { type: Number },
    answeredAt: { type: Date }
  }],
  
  // Notifications
  defenderNotified: { type: Boolean, default: false },
  emailSent: { type: Boolean, default: false }
}, {
  timestamps: true
});

// Generate movie pool from defender's 5-star movies
fightSchema.methods.generateMoviePool = async function() {
  const User = mongoose.model('User');
  const defender = await User.findById(this.defenderId);
  
  if (!defender || !defender.fiveStarMovies || defender.fiveStarMovies.length === 0) {
    throw new Error('Defender has no 5-star movies');
  }
  
  // Shuffle and take 10 random movies
  const shuffled = [...defender.fiveStarMovies].sort(() => 0.5 - Math.random());
  this.moviePool = shuffled.slice(0, Math.min(10, shuffled.length)).map(movie => ({
    title: movie.title,
    year: movie.year,
    director: movie.director,
    letterboxdUrl: movie.letterboxdUrl
  }));
  
  return this.moviePool;
};

// Generate AI questions for the movie pool
fightSchema.methods.generateQuestions = async function() {
  try {
    // Try AI generation first
    const aiQuestions = await this.generateAIQuestions();
    if (aiQuestions && aiQuestions.length > 0) {
      this.questions = aiQuestions;
      return this.questions;
    }
  } catch (error) {
    console.warn('AI question generation failed, falling back to templates:', error.message);
  }
  
  // Fallback to predefined question templates
  const questionTemplates = [
    {
      template: "What was the central theme explored in {title}?",
      type: "open_ended",
      difficulty: "medium"
    },
    {
      template: "What significant object or symbol appears in {title}?",
      type: "open_ended", 
      difficulty: "medium"
    },
    {
      template: "What was the main character's motivation in {title}?",
      type: "open_ended",
      difficulty: "medium"
    },
    {
      template: "What memorable quote or line is from {title}?",
      type: "open_ended",
      difficulty: "hard"
    },
    {
      template: "What was the climactic moment in {title}?",
      type: "open_ended",
      difficulty: "medium"
    }
  ];
  
  this.questions = this.moviePool.map((movie, index) => {
    const template = questionTemplates[index % questionTemplates.length];
    return {
      movieTitle: movie.title,
      movieYear: movie.year,
      question: template.template.replace('{title}', movie.title),
      correctAnswer: '', // Will be filled by AI or manual review
      questionType: template.type,
      difficulty: template.difficulty
    };
  });
  
  return this.questions;
};

// Generate AI-powered questions using OpenAI
fightSchema.methods.generateAIQuestions = async function() {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }
  
  const movieList = this.moviePool.map(m => `${m.title} (${m.year})`).join(', ');
  
  const prompt = `Create ${this.moviePool.length} challenging movie trivia questions for: ${movieList}

Generate one question per movie about themes, symbolism, or memorable scenes. Return only valid JSON:

[
  {
    "movieTitle": "Movie Title",
    "movieYear": year,
    "question": "Question text",
    "correctAnswer": "Answer",
    "difficulty": "medium",
    "questionType": "open_ended"
  }
]`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-nano",
      messages: [
        {
          role: "system",
          content: "You are a movie trivia expert. Respond with valid JSON only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
    });

    const response = completion.choices[0]?.message?.content;
    if (!response || completion.choices[0]?.finish_reason === 'length') {
      console.error('OpenAI response truncated or empty:', {
        finish_reason: completion.choices[0]?.finish_reason,
        content_length: response?.length || 0
      });
      throw new Error('OpenAI response was truncated or empty');
    }

    // Parse JSON response
    let questions;
    try {
      questions = JSON.parse(response);
    } catch (parseError) {
      // Try to extract JSON from response if it's wrapped in markdown
      const jsonMatch = response.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        questions = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error('Invalid JSON response from AI');
      }
    }

    if (!Array.isArray(questions)) {
      throw new Error('AI response is not an array');
    }

    // Validate and normalize questions
    const validQuestions = questions.filter(q => 
      q.movieTitle && q.question && q.correctAnswer
    ).map(q => ({
      movieTitle: q.movieTitle,
      movieYear: q.movieYear || new Date().getFullYear(),
      question: q.question,
      correctAnswer: q.correctAnswer,
      difficulty: q.difficulty || 'medium',
      questionType: q.questionType || 'open_ended'
    }));

    if (validQuestions.length === 0) {
      throw new Error('No valid questions generated by AI');
    }

    return validQuestions;
    
  } catch (error) {
    console.error('OpenAI API error:', error);
    throw error;
  }
};

// Batch evaluation method for multiple answers
fightSchema.methods.evaluateAnswerBatch = async function(answers) {
  const openai = new OpenAI(process.env.OPENAI_API_KEY);
  
  // Construct batch prompt
  let prompt = 'Evaluate these user answers against expected answers. The answers are open-ended, the core sentiment of the answer is what matters, partially correct answers are also accepted. Return a JSON array of results in the same order.\n\n';
  answers.forEach((answer, index) => {
    const question = this.questions[answer.questionIndex]
    if (!question) {
      throw new Error(`Question not found for answer with questionIndex: ${answer.questionIndex}`);
    }
    prompt += `Question ${index + 1}: ${question.question}\n`;
    prompt += `Expected Answer: ${question.correctAnswer}\n`;
    prompt += `User Answer: ${answer.answer}\n\n`;
  });
  
  prompt += 'Each result object should have:\n' +
            '- correct: boolean\n' +
            '- explanation: string\n' +
            'Example: [{"correct":true,"explanation":"Explanation"}, ...]';

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5-nano',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });
    
    const batchResults = JSON.parse(response.choices[0].message.content)["results"];
    // Ensure we have an array
    if (!Array.isArray(batchResults)) {
      throw new Error('Batch evaluation did not return an array');
    }
    // Add evaluation method
    return batchResults.map(result => ({
      ...result,
      evaluationMethod: 'ai'
    }));
  } catch (error) {
    console.error('Batch evaluation failed:', error);
    // Fallback to individual evaluations
    const results = [];
    for (const answer of answers) {
      const result = await this.evaluateAnswer(answer);
      results.push(result);
    }
    return results;
  }
};

// Evaluate answer using AI semantic comparison
fightSchema.methods.evaluateAnswer = async function(userAnswer, expectedAnswer, question, movieTitle) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  
  if (!process.env.OPENAI_API_KEY) {
    // Fallback to simple string comparison
    return this.fallbackAnswerEvaluation(userAnswer, expectedAnswer);
  }
  
  // Create cache key to prevent duplicate evaluations
  const cacheKey = `${movieTitle}:${question}:${userAnswer}:${expectedAnswer}`;
  if (evaluationCache.has(cacheKey)) {
    console.log('Using cached evaluation result');
    return evaluationCache.get(cacheKey);
  }
  
  // Check rate limit before making API call
  if (!rateLimiter.canMakeRequest()) {
    const waitTime = rateLimiter.getWaitTime();
    console.log(`Rate limit exceeded, falling back to keyword matching (wait: ${waitTime}ms)`);
    return this.fallbackAnswerEvaluation(userAnswer, expectedAnswer);
  }
  
  const prompt = `Evaluate if these two answers about the movie "${movieTitle}" are semantically equivalent:

Question: ${question}
Expected Answer: ${expectedAnswer}
User Answer: ${userAnswer}

Consider:
- Semantic meaning rather than exact wording
- Key concepts and themes mentioned
- Factual accuracy about the movie
- Allow for different phrasings of the same idea

Respond with only "CORRECT" or "INCORRECT" followed by a brief explanation.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-nano",
      messages: [
        {
          role: "system",
          content: "You are a movie expert evaluating quiz answers. Be fair but maintain accuracy standards."
        },
        {
          role: "user",
          content: prompt
        }
      ],
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      return this.fallbackAnswerEvaluation(userAnswer, expectedAnswer);
    }

    const isCorrect = response.toUpperCase().startsWith('CORRECT');
    const explanation = response.substring(response.indexOf(' ') + 1);
    
    const result = {
      isCorrect,
      explanation: explanation || 'AI evaluation completed',
      method: 'ai'
    };
    
    // Cache the result to prevent duplicate API calls
    evaluationCache.set(cacheKey, result);
    
    // Clear cache after 1 hour to prevent memory leaks
    setTimeout(() => evaluationCache.delete(cacheKey), 3600000);
    
    return result;
    
  } catch (error) {
    console.error('AI answer evaluation failed:', error);
    const fallbackResult = this.fallbackAnswerEvaluation(userAnswer, expectedAnswer);
    
    // Cache fallback results too
    evaluationCache.set(cacheKey, fallbackResult);
    setTimeout(() => evaluationCache.delete(cacheKey), 3600000);
    
    return fallbackResult;
  }
};

// Fallback answer evaluation using string similarity
fightSchema.methods.fallbackAnswerEvaluation = function(userAnswer, expectedAnswer) {
  const normalize = (str) => str.toLowerCase().trim().replace(/[^\w\s]/g, '');
  const userNorm = normalize(userAnswer);
  const expectedNorm = normalize(expectedAnswer);
  
  // Simple keyword matching - if user answer contains key words from expected answer
  const expectedWords = expectedNorm.split(/\s+/).filter(word => word.length > 3);
  const userWords = userNorm.split(/\s+/);
  
  const matchedWords = expectedWords.filter(word => 
    userWords.some(userWord => userWord.includes(word) || word.includes(userWord))
  );
  
  const similarity = matchedWords.length / expectedWords.length;
  const isCorrect = similarity >= 0.4; // 40% keyword overlap threshold
  
  return {
    isCorrect,
    explanation: `Keyword similarity: ${Math.round(similarity * 100)}%`,
    method: 'fallback'
  };
};

// Calculate fight results
fightSchema.methods.calculateResults = function() {
  const challengerCorrect = this.answers.filter(a => 
    a.playerId.toString() === this.challengerId.toString() && a.isCorrect
  ).length;
  
  const defenderCorrect = this.answers.filter(a => 
    a.playerId.toString() === this.defenderId.toString() && a.isCorrect
  ).length;
  console.log(defenderCorrect)
  
  this.challengerScore = challengerCorrect;
  this.defenderScore = defenderCorrect;
  
  // Determine winner
  if (challengerCorrect > defenderCorrect) {
    this.winnerId = this.challengerId;
  } else if (defenderCorrect > challengerCorrect) {
    this.winnerId = this.defenderId;
  } else {
    // Tie - need tiebreaker or consider it a draw
    this.winnerId = null;
  }
  
  return {
    challengerScore: this.challengerScore,
    defenderScore: this.defenderScore,
    winnerId: this.winnerId
  };
};

// Check if fight has expired
fightSchema.methods.isExpired = function() {
  return Date.now() > this.expiresAt.getTime();
};

// Start the fight
fightSchema.methods.startFight = async function() {
  if (this.status !== 'accepted') {
    throw new Error('Fight must be accepted before starting');
  }
  
  await this.generateMoviePool();
  await this.generateQuestions();
  
  this.status = 'in_progress';
  this.currentQuestionIndex = 0;
  
  return this;
};

// Cache for preventing duplicate evaluations
const evaluationCache = new Map();

// Simple rate limiter for OpenAI API calls
const rateLimiter = {
  requests: [],
  maxRequests: 10, // Higher limit for gpt-4o-mini
  windowMs: 60000, // 1 minute window
  
  canMakeRequest() {
    const now = Date.now();
    // Remove old requests outside the window
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    if (this.requests.length >= this.maxRequests) {
      return false;
    }
    
    this.requests.push(now);
    return true;
  },
  
  getWaitTime() {
    if (this.requests.length === 0) return 0;
    const oldestRequest = Math.min(...this.requests);
    const waitTime = this.windowMs - (Date.now() - oldestRequest);
    return Math.max(0, waitTime);
  }
};

module.exports = mongoose.model('Fight', fightSchema);
