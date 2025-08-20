@echo off
echo Installing Cinephile Agar dependencies...
echo.

echo Installing server dependencies...
call npm install

echo.
echo Installing client dependencies...
cd client
call npm install
cd ..

echo.
echo Setup complete! 
echo.
echo To start the application:
echo 1. Make sure MongoDB is running
echo 2. Run: npm run dev (for server)
echo 3. In another terminal, run: npm run client
echo.
echo The game will be available at http://localhost:3000
pause
