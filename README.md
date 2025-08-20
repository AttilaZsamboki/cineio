# 🎬 Cinephile Agar

A multiplayer agar.io-style game for movie enthusiasts where players absorb others based on their Letterboxd movie knowledge.

## 🎮 Game Concept

**Cinephile Agar** combines the addictive gameplay of agar.io with movie culture. Players can only absorb other players if they've seen ALL of their opponent's 5-star rated movies. This creates a strategic layer where movie knowledge becomes your weapon.

### Key Features

1. **Long-running Sessions (Days to Weeks)**
   - Sessions last 7-30 days, giving players time to strategically watch movies
   - Encourages community building and strategic planning

2. **5-Star Movie Battles**
   - Only 5-star rated movies count for absorption mechanics
   - Reduces data complexity and creates focused movie lists
   - Incentivizes discovering and watching others' favorite films

3. **ELO Rating System**
   - Competitive ranking based on absorptions and survival time
   - Separates casual viewers from serious cinephiles
   - Adds long-term progression and stakes

4. **Player Tracking & Watchlists**
   - Track target players and their missing movies
   - Build strategic watchlists to prepare for future absorptions
   - Re-absorption mechanics after initial absorption

## 🚀 Getting Started

### Prerequisites

- Node.js (v16 or higher)
- MongoDB (local or cloud instance)
- npm or yarn

### Installation

1. **Clone and install dependencies:**
   ```bash
   npm install
   cd client && npm install
   ```

2. **Set up MongoDB:**
   - Install MongoDB locally or use MongoDB Atlas
   - Default connection: `mongodb://localhost:27017/cinephile-agar`

3. **Environment Variables (Optional):**
   Create a `.env` file in the server directory:
   ```
   JWT_SECRET=your-secret-key-here
   MONGODB_URI=mongodb://localhost:27017/cinephile-agar
   PORT=5000
   ```

4. **Start the application:**
   ```bash
   # Start server (from root directory)
   npm run dev

   # Start client (in new terminal)
   npm run client
   ```

5. **Access the game:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000

## 📊 How to Play

### 1. Account Setup
- Register with username, email, and optional Letterboxd username
- Import your 5-star movies from Letterboxd CSV export
- Or manually add your favorite movies

### 2. Join a Game Session
- Browse active sessions in the dashboard
- Create new sessions with custom duration and player limits
- Join sessions that match your skill level

### 3. Gameplay
- Move your circle around the game world using mouse movement
- Click on other players to attempt absorption
- You can only absorb players whose 5-star movies you've ALL seen
- Grow larger with each successful absorption
- Survive as long as possible and climb the leaderboard

### 4. Strategy
- Use the watchlist feature to track players you want to absorb
- Watch their favorite movies to prepare for future encounters
- Balance aggressive play with strategic movie watching
- Monitor the ELO leaderboard to find worthy opponents

## 🎯 Game Mechanics

### Absorption Rules
- **Movie Compatibility**: You must have seen ALL of the target player's 5-star movies
- **Proximity**: Players must be close enough for collision detection
- **Cooldown**: 5-second cooldown between absorption attempts
- **Size Growth**: Successful absorptions increase your size by 20%

### ELO System
- Start at 1200 ELO rating
- Gain/lose points based on opponent's rating and game outcome
- Higher rated players gain fewer points from lower rated opponents
- Separate casual players from hardcore cinephiles

### Session Types
- **Duration**: 1-30 days per session
- **Players**: 10-100 players per session
- **Respawn**: Optional respawn with cooldown period
- **Victory**: Last player standing or highest score when time expires

## 📁 Project Structure

```
cinephile-agar/
├── server/                 # Node.js backend
│   ├── game/              # Game logic and real-time management
│   ├── models/            # MongoDB schemas
│   ├── routes/            # API endpoints
│   ├── middleware/        # Authentication and validation
│   └── index.js           # Server entry point
├── client/                # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── contexts/      # React contexts for state
│   │   └── App.js         # Main app component
│   └── package.json
└── package.json           # Root package.json
```

## 🎬 Letterboxd Integration

### Exporting Your Data
1. Go to Letterboxd Settings → Import & Export
2. Click "Export your data"
3. Download the ZIP file and extract `ratings.csv`
4. Upload the CSV file in your profile page

### CSV Format Expected
```csv
Name,Year,Letterboxd URI,Rating
The Godfather,1972,https://letterboxd.com/film/the-godfather/,5
Citizen Kane,1941,https://letterboxd.com/film/citizen-kane/,5
```

## 🛠️ Technical Stack

**Backend:**
- Node.js with Express
- Socket.io for real-time communication
- MongoDB with Mongoose
- JWT authentication
- Multer for file uploads

**Frontend:**
- React 18 with hooks
- Socket.io client
- React Router for navigation
- Styled components and CSS
- React Hot Toast for notifications

## 🎮 API Endpoints

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

### User Management
- `POST /api/user/import-letterboxd` - Import CSV data
- `POST /api/user/movies` - Add movie manually
- `GET /api/user/compatibility/:userId` - Check movie compatibility
- `GET /api/user/leaderboard` - Get ELO rankings

### Game Sessions
- `POST /api/game/create-session` - Create new session
- `GET /api/game/sessions` - List active sessions
- `POST /api/game/join/:sessionId` - Join session
- `GET /api/game/session/:sessionId` - Get session details

## 🔮 Future Enhancements

- **Movie Recommendations**: AI-powered suggestions based on absorption targets
- **Tournaments**: Scheduled competitive events with prizes
- **Social Features**: Friend systems, private sessions, chat
- **Advanced Analytics**: Detailed statistics and performance tracking
- **Mobile App**: Native iOS/Android versions
- **Integration**: Direct Letterboxd API when available
- **Streaming Integration**: Link to where movies can be watched

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - feel free to use this project for learning or building your own movie-based games!

## 🎭 Credits

Inspired by the addictive gameplay of agar.io and the passionate movie community on Letterboxd. Built for cinephiles who want to turn their movie knowledge into competitive advantage.

---

**Ready to absorb the competition? Import your movies and start playing!** 🍿
