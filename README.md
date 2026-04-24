# Life Calendar - Visualize Your Time

A beautifully designed life tracking application that helps you visualize your entire life in years, months, or days, while simultaneously tracking study time across different subjects with multiple timers.

## ✨ Key Features

### 📅 Life Calendar Visualization
- **Real-time Clock**: Large, prominent clock display showing current time, date, and week number
- **Multiple View Modes**: 
  - Weeks (by year) - See all 52 weeks of a selected year
  - Months (by year) - View 12 months of a selected year
  - Years (lifetime) - Visualize your entire life expectancy
- **Visual Timeline**: Color-coded boxes showing:
  - Blue = Completed time periods
  - Green = Current period (with pulse animation)
  - Gray = Future periods
- **Interactive Navigation**: Easy arrows to navigate between years
- **Customizable Colors**: Change background and box colors to your preference

### ⏱️ Multiple Study Timers
- **Create Multiple Timers**: Track different subjects simultaneously
- **Individual Timer Controls**: Start, pause, save, and delete for each timer
- **Subject-based Tracking**: Name each timer for subjects like Physics, Math, Chemistry, etc.
- **Persistent Timers**: Timers continue running even when you switch views
- **Auto-save Sessions**: Save completed study sessions with one click

### 📊 Study Session Tracking
- **Complete Study Log**: View all past study sessions with timestamps
- **Duration Tracking**: Precise time tracking for each session
- **Session History**: Shows most recent 20 sessions
- **Subject Organization**: Sessions grouped by subject name
- **Clear Log Option**: Remove old entries when needed

### ⚙️ Comprehensive Settings
- **Birth Date Configuration**: Set your birth date to calculate life statistics
- **Life Expectancy**: Customize expected lifespan (1-120 years)
- **View Mode Selection**: Choose between weeks, months, or years
- **Color Customization**: Personalize all interface colors
- **User Account Integration**: Optional login to sync data across devices

### 📈 Life Statistics
- **Current Age**: Calculated from your birth date
- **Days Lived**: Total days you've been alive
- **Weeks Lived**: Total weeks since birth
- **Years Remaining**: Based on your life expectancy setting

### 🔐 User Authentication (Optional)
- **Secure Login/Registration**: Create account to sync data to cloud
- **MongoDB Storage**: All data saved securely
- **Works Offline**: Local storage fallback when not logged in
- **Cross-device Sync**: Access your data from any device

## Design

The application features a modern three-column layout:
- **Left Sidebar**: Study timers and study log
- **Center**: Large clock display and life calendar visualization
- **Right Sidebar**: Settings panel and life statistics

Clean, minimalist design with a dark navy theme and blue/green accent colors for optimal readability and focus.

## Tech Stack

### Frontend
- **HTML5**: Semantic markup
- **CSS3**: Custom brutalist-modernist design
- **JavaScript (ES6+)**: Vanilla JS for performance
- **Google Fonts**: 
  - Playfair Display (headers)
  - JetBrains Mono (body text)

### Backend
- **Node.js**: JavaScript runtime
- **Express.js**: Web framework
- **MongoDB**: NoSQL database
- **Mongoose**: MongoDB ODM
- **JWT**: Authentication tokens
- **bcrypt**: Password hashing

## Installation

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (local or MongoDB Atlas)
- npm or yarn

### Step 1: Clone or Download

Download all files to a directory on your computer.

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure Environment

Create a `.env` file in the root directory:

```env
MONGODB_URI=mongodb://localhost:27017/lifecalendar
JWT_SECRET=your-super-secret-jwt-key-change-this
PORT=3000
```

**For MongoDB Atlas (Cloud Database):**
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/lifecalendar
```

### Step 4: Start MongoDB (if using local)

```bash
# On macOS/Linux
mongod

# On Windows
"C:\Program Files\MongoDB\Server\6.0\bin\mongod.exe"
```

### Step 5: Start the Server

```bash
npm start
```

The server will start on `http://localhost:3000`

### Step 6: Open the Application

Open `index.html` in your web browser or serve it with a local server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js http-server
npx http-server
```

Then visit `http://localhost:8000`

## Usage Guide

### First Time Setup

1. **Open the App**: Launch index.html in your browser
2. **Set Your Birth Date**: 
   - Look at the right sidebar "Settings" panel
   - Enter your birth date in the "Birth Date" field
   - Set your life expectancy (default: 80 years)
   - Click "Apply Settings"
3. **View Your Life Calendar**: The calendar will now display in the center

### Using the Life Calendar

#### View Modes
Select from the dropdown in Settings:
- **Weeks (By Year)**: See all 52 weeks of a specific year
- **Months (By Year)**: View 12 months of a specific year  
- **Years (Lifetime)**: See your entire life expectancy in yearly boxes

#### Navigation
- Click the **← and → arrows** to navigate between years (in weeks/months mode)
- Hover over any box to see detailed information
- Blue boxes = completed periods
- Green box = current period (pulses)
- Gray boxes = future periods

### Using Study Timers

#### Creating a Timer
1. In the left sidebar, click the **+ button** next to "Study Timers"
2. Enter a subject name (e.g., "Physics", "Math", "Chemistry")
3. Click "Create Timer"

#### Using a Timer
1. Click **Start** to begin tracking time
2. The timer will count up automatically
3. Click **Pause** to pause the timer
4. Click **Start** again to resume
5. When finished, click **Save** to record the session
6. The session will appear in the Study Log below

#### Managing Timers
- **Multiple Timers**: Create as many timers as you need for different subjects
- **Simultaneous Tracking**: Run multiple timers at once
- **Delete**: Remove a timer with the Delete button
- **Sessions**: Each saved session goes to the Study Log

### Study Log

The Study Log (left sidebar, bottom panel) shows:
- Most recent 20 study sessions
- Subject name for each session
- Date and time of session
- Duration of each session
- **Clear button**: Remove all log entries

### Customizing Colors

In the Settings panel (right sidebar):
1. Click on any color input to open color picker
2. Choose your preferred colors:
   - Background Color
   - Box Color (future periods)
   - Completed Color (past periods)
   - Current Color (current period)
   - Text Color
3. Colors apply immediately
4. Settings are saved automatically

### Life Statistics

The bottom of the right sidebar shows:
- **Age**: Your current age in years
- **Days Lived**: Total days since birth
- **Weeks Lived**: Total weeks since birth  
- **Years Remaining**: Based on life expectancy

All statistics update in real-time.

### User Account (Optional)

#### Why Create an Account?
- Sync data across multiple devices
- Never lose your timers and study sessions
- Access from anywhere with internet
- Secure cloud backup

#### Register
1. Click **Login** button (top of right sidebar)
2. Click **Register** link in the modal
3. Enter name, email, and password
4. Click "Create Account"

#### Login
1. Click **Login** button
2. Enter your email and password
3. Click "Sign In"
4. Your data will sync automatically

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### User Data
- `GET /api/user/data` - Get user settings and sessions
- `POST /api/user/settings` - Update birth date and life expectancy
- `POST /api/user/sessions` - Add new study session
- `DELETE /api/user/sessions` - Clear all study sessions

### Health Check
- `GET /api/health` - Check server status

## File Structure

```
life-calendar/
├── index.html          # Main HTML file
├── styles.css          # All styles with brutalist design
├── app.js             # Frontend JavaScript logic
├── server.js          # Backend Express server
├── package.json       # Node.js dependencies
├── .env.example       # Environment variables template
└── README.md          # This file
```

## Features in Detail

### Calendar Calculations
- **Accurate age calculation** considering months and days
- **Leap year support** for day-mode visualization
- **Real-time updates** for current period highlighting
- **Flexible life expectancy** from 1-120 years

### Timer Accuracy
- **Millisecond precision** tracking
- **Background running** even when switching tabs
- **Auto-save** prevents data loss
- **Format flexibility** (hours, minutes, seconds)

### Data Storage
- **Dual storage**: Local + Cloud
- **Automatic sync** when logged in
- **Offline capable** with localStorage
- **Data export/import** ready

## Browser Compatibility

- ✅ Chrome/Edge (v90+)
- ✅ Firefox (v88+)
- ✅ Safari (v14+)
- ✅ Opera (v76+)

## Security Features

- Password hashing with bcrypt
- JWT token authentication
- CORS protection
- Environment variable configuration
- Input validation and sanitization

## Performance

- Lightweight vanilla JavaScript
- Minimal dependencies
- Optimized rendering
- Efficient data structures
- Fast database queries with indexing

## Customization

### Change Colors
Edit `styles.css` CSS variables:

```css
:root {
    --bg-primary: #0a0a0a;      /* Main background */
    --accent-primary: #00ff88;   /* Green accent */
    --accent-secondary: #ff0066; /* Pink accent */
}
```

### Change Fonts
Update Google Fonts link in `index.html`:

```html
<link href="https://fonts.googleapis.com/css2?family=YourFont&display=swap">
```

### Adjust Grid Size
Modify calendar grid in `styles.css`:

```css
.calendar-grid {
    grid-template-columns: repeat(52, 1fr); /* Change 52 */
}
```

## Troubleshooting

### Server won't start
- Check if MongoDB is running
- Verify PORT 3000 is available
- Check .env configuration

### Can't login
- Verify server is running
- Check MongoDB connection
- Clear browser cache

### Data not saving
- Check browser console for errors
- Verify localStorage is enabled
- Check server logs

### Calendar not showing
- Ensure birth date is set in Settings
- Refresh the page
- Check browser console

## Future Enhancements

- [ ] Export study data as CSV/PDF
- [ ] Dark/Light theme toggle
- [ ] Mobile app version
- [ ] Goal setting and reminders
- [ ] Data visualization charts
- [ ] Multi-language support
- [ ] Social features (compare with friends)
- [ ] Integration with calendar apps
- [ ] Pomodoro timer integration
- [ ] Study statistics dashboard

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use for personal or commercial projects.

## Support

For issues or questions:
- Open an issue on GitHub
- Check documentation
- Review troubleshooting section

## Credits

- Design: Brutalist-Modernist aesthetic
- Fonts: Google Fonts
- Icons: Custom CSS

---

**Made with ❤️ for better time management and life visualization**

Version 1.0.0
