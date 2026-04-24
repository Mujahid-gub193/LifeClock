const path = require('path');
require('dotenv').config();
const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const crypto = require('crypto');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(session({ secret: process.env.JWT_SECRET || 'lifeclock-secret', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

const JWT_SECRET = process.env.JWT_SECRET || 'lifeclock-secret-change-in-prod';
const PORT = process.env.PORT || 3000;
const hasEmailConfig = Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
const useHostedDbSsl =
  process.env.DB_SSL === 'true' ||
  (process.env.DATABASE_URL && !/localhost|127\\.0\\.0\\.1/i.test(process.env.DATABASE_URL));
const sequelizeConfig = {
  dialect: 'postgres',
  logging: false,
  ...(useHostedDbSsl ? { dialectOptions: { ssl: { require: true, rejectUnauthorized: false } } } : {}),
};

// ─── Sequelize Connection ────────────────────────────────────────────────────
const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, sequelizeConfig)
  : new Sequelize(
      process.env.DB_NAME || 'lifeclock',
      process.env.DB_USER || 'postgres',
      process.env.DB_PASS || '',
      { ...sequelizeConfig, host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT || 5432 }
    );

// ─── Models ──────────────────────────────────────────────────────────────────
const User = sequelize.define('User', {
  name:          { type: DataTypes.STRING,  allowNull: false },
  email:         { type: DataTypes.STRING,  allowNull: false, unique: true },
  password:      { type: DataTypes.STRING },
  dateOfBirth:   { type: DataTypes.STRING },
  timezone:      { type: DataTypes.STRING,  defaultValue: 'UTC' },
  lifeExpectancy:{ type: DataTypes.INTEGER, defaultValue: 80 },
  theme:         { type: DataTypes.STRING,  defaultValue: 'dark' },
  avatar:        { type: DataTypes.TEXT },
  googleId:      { type: DataTypes.STRING },
  resetToken:    { type: DataTypes.STRING },
  resetExpiry:   { type: DataTypes.BIGINT },
  role:          { type: DataTypes.STRING, defaultValue: 'user' },
});

const Session = sequelize.define('Session', {
  userId:          { type: DataTypes.INTEGER, allowNull: false },
  subject:         { type: DataTypes.STRING,  allowNull: false },
  date:            { type: DataTypes.STRING },
  startTime:       { type: DataTypes.STRING },
  endTime:         { type: DataTypes.STRING },
  notes:           { type: DataTypes.TEXT },
  plannedDuration: { type: DataTypes.INTEGER },
  actualDuration:  { type: DataTypes.INTEGER },
  completed:       { type: DataTypes.BOOLEAN, defaultValue: false },
  notificationSent:{ type: DataTypes.BOOLEAN, defaultValue: false },
});

const Note = sequelize.define('Note', {
  userId:    { type: DataTypes.INTEGER, allowNull: false },
  boxId:     { type: DataTypes.STRING,  allowNull: false },
  type:      { type: DataTypes.STRING },
  content:   { type: DataTypes.TEXT },
  dateRange: { type: DataTypes.STRING },
});

const Planner = sequelize.define('Planner', {
  userId:   { type: DataTypes.INTEGER, allowNull: false },
  date:     { type: DataTypes.STRING,  allowNull: false },
  content:  { type: DataTypes.TEXT },
  viewType: { type: DataTypes.STRING,  defaultValue: 'weekly' },
});

const CalendarEvent = sequelize.define('CalendarEvent', {
  userId:           { type: DataTypes.INTEGER, allowNull: false },
  date:             { type: DataTypes.STRING,  allowNull: false },
  title:            { type: DataTypes.STRING,  allowNull: false },
  note:             { type: DataTypes.TEXT },
  color:            { type: DataTypes.STRING,  defaultValue: '#388bfd' },
  notifyTime:       { type: DataTypes.STRING },   // "HH:MM" — time to notify
  notificationSent: { type: DataTypes.BOOLEAN, defaultValue: false },
});

User.hasMany(CalendarEvent,    { foreignKey: 'userId' });
CalendarEvent.belongsTo(User,  { foreignKey: 'userId' });

const MoodEntry = sequelize.define('MoodEntry', {
  userId:  { type: DataTypes.INTEGER, allowNull: false },
  date:    { type: DataTypes.STRING,  allowNull: false },
  mood:    { type: DataTypes.INTEGER, allowNull: false }, // 1-5
  tags:    { type: DataTypes.STRING },   // comma-separated
  journal: { type: DataTypes.TEXT },
});

User.hasMany(MoodEntry,    { foreignKey: 'userId' });
MoodEntry.belongsTo(User,  { foreignKey: 'userId' });

const Habit = sequelize.define('Habit', {
  userId:   { type: DataTypes.INTEGER, allowNull: false },
  name:     { type: DataTypes.STRING,  allowNull: false },
  emoji:    { type: DataTypes.STRING,  defaultValue: 'H' },
  category: { type: DataTypes.STRING,  defaultValue: 'General' },
  target:   { type: DataTypes.INTEGER, defaultValue: 1 }, // times per day
  active:   { type: DataTypes.BOOLEAN, defaultValue: true },
});

const HabitLog = sequelize.define('HabitLog', {
  userId:  { type: DataTypes.INTEGER, allowNull: false },
  habitId: { type: DataTypes.INTEGER, allowNull: false },
  date:    { type: DataTypes.STRING,  allowNull: false },
  count:   { type: DataTypes.INTEGER, defaultValue: 1 },
});

User.hasMany(Habit,    { foreignKey: 'userId' });
Habit.belongsTo(User,  { foreignKey: 'userId' });
Habit.hasMany(HabitLog,    { foreignKey: 'habitId' });
HabitLog.belongsTo(Habit,  { foreignKey: 'habitId' });
User.hasMany(HabitLog, { foreignKey: 'userId' });
HabitLog.belongsTo(User, { foreignKey: 'userId' });

const TimeEntry = sequelize.define('TimeEntry', {
  userId:   { type: DataTypes.INTEGER, allowNull: false },
  activity: { type: DataTypes.STRING,  allowNull: false },
  category: { type: DataTypes.STRING,  defaultValue: 'Other' },
  date:     { type: DataTypes.STRING,  allowNull: false },
  start:    { type: DataTypes.STRING },
  end:      { type: DataTypes.STRING },
  duration: { type: DataTypes.FLOAT },  // hours
  notes:    { type: DataTypes.TEXT },
});

User.hasMany(TimeEntry, { foreignKey: 'userId' });
TimeEntry.belongsTo(User, { foreignKey: 'userId' });


const Milestone = sequelize.define('Milestone', {
  userId:   { type: DataTypes.INTEGER, allowNull: false },
  title:    { type: DataTypes.STRING,  allowNull: false },
  emoji:    { type: DataTypes.STRING,  defaultValue: 'M' },
  category: { type: DataTypes.STRING,  defaultValue: 'Life' },
  date:     { type: DataTypes.STRING,  allowNull: false },
  notes:    { type: DataTypes.TEXT },
});

User.hasMany(Milestone, { foreignKey: 'userId' });
Milestone.belongsTo(User, { foreignKey: 'userId' });

const Sleep = sequelize.define('Sleep', {
  userId:    { type: DataTypes.INTEGER, allowNull: false },
  date:      { type: DataTypes.STRING,  allowNull: false },
  bedtime:   { type: DataTypes.STRING },
  wakeTime:  { type: DataTypes.STRING },
  duration:  { type: DataTypes.FLOAT },   // hours
  quality:   { type: DataTypes.INTEGER }, // 1-5
  notes:     { type: DataTypes.TEXT },
});

User.hasMany(Sleep, { foreignKey: 'userId' });
Sleep.belongsTo(User, { foreignKey: 'userId' });

const Book = sequelize.define('Book', {
  userId:     { type: DataTypes.INTEGER, allowNull: false },
  title:      { type: DataTypes.STRING,  allowNull: true },
  author:     { type: DataTypes.STRING },
  genre:      { type: DataTypes.STRING,  defaultValue: 'General' },
  status:     { type: DataTypes.STRING,  defaultValue: 'want' }, // want | reading | done
  rating:     { type: DataTypes.INTEGER },                        // 1-5
  notes:      { type: DataTypes.TEXT },
  startDate:  { type: DataTypes.STRING },
  finishDate: { type: DataTypes.STRING },
  pages:      { type: DataTypes.INTEGER },
});

User.hasMany(Book, { foreignKey: 'userId' });
Book.belongsTo(User, { foreignKey: 'userId' });

const Goal = sequelize.define('Goal', {
  userId:    { type: DataTypes.INTEGER, allowNull: false },
  title:     { type: DataTypes.STRING,  allowNull: false },
  category:  { type: DataTypes.STRING,  defaultValue: 'General' },
  targetAge: { type: DataTypes.INTEGER },
  deadline:  { type: DataTypes.STRING },
  notes:     { type: DataTypes.TEXT },
  completed: { type: DataTypes.BOOLEAN, defaultValue: false },
  completedAt:{ type: DataTypes.STRING },
  progress:  { type: DataTypes.INTEGER, defaultValue: 0 },
});

User.hasMany(Goal, { foreignKey: 'userId' });
Goal.belongsTo(User, { foreignKey: 'userId' });

const Countdown = sequelize.define('Countdown', {
  userId:    { type: DataTypes.INTEGER, allowNull: false },
  name:      { type: DataTypes.STRING,  allowNull: false },
  emoji:     { type: DataTypes.STRING,  defaultValue: 'CD' },
  targetDate:{ type: DataTypes.STRING,  allowNull: false },
});

User.hasMany(Countdown, { foreignKey: 'userId' });
Countdown.belongsTo(User, { foreignKey: 'userId' });


User.hasMany(Note,     { foreignKey: 'userId' });
User.hasMany(Planner,  { foreignKey: 'userId' });
User.hasMany(Session,  { foreignKey: 'userId' });
Session.belongsTo(User, { foreignKey: 'userId' });
Note.belongsTo(User,    { foreignKey: 'userId' });
Planner.belongsTo(User, { foreignKey: 'userId' });

// ─── Auth Middleware ──────────────────────────────────────────────────────────
const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token' });
    const { userId } = jwt.verify(token, JWT_SECRET);
    req.user = await User.findByPk(userId);
    if (!req.user) return res.status(401).json({ message: 'User not found' });
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }

};
const adminAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token' });
    const { userId } = jwt.verify(token, JWT_SECRET);
    req.user = await User.findByPk(userId);
    if (!req.user) return res.status(401).json({ message: 'User not found' });
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};

app.get('/api/health', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ ok: true, database: 'connected' });
  } catch (e) {
    res.status(500).json({ ok: false, database: 'disconnected', message: e.message });
  }
});

// ─── Auth Routes ──────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, dateOfBirth } = req.body;
    if (!name || !email || !password || !dateOfBirth)
      return res.status(400).json({ message: 'All fields including date of birth are required' });
    if (await User.findOne({ where: { email } }))
      return res.status(400).json({ message: 'Email already registered' });
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed, dateOfBirth });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, user: { id: user.id, name, email, email, dateOfBirth, role: user.role, settings: { lifeExpectancy: user.lifeExpectancy, theme: user.theme }, timezone: user.timezone } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user || !await bcrypt.compare(password, user.password))
      return res.status(401).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, dateOfBirth: user.dateOfBirth, role: user.role, settings: { lifeExpectancy: user.lifeExpectancy, theme: user.theme }, timezone: user.timezone } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/auth/me', auth, (req, res) => {
  const u = req.user;
  res.json({ id: u.id, name: u.name, email: u.email, dateOfBirth: u.dateOfBirth, avatar: u.avatar, role: u.role, settings: { lifeExpectancy: u.lifeExpectancy, theme: u.theme }, timezone: u.timezone });
});

// ─── Google OAuth ─────────────────────────────────────────────────────────────
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => done(null, await User.findByPk(id)));

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback',
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ where: { googleId: profile.id } });
      if (!user) {
        const email = profile.emails?.[0]?.value;
        user = await User.findOne({ where: { email } });
        if (user) {
          await user.update({ googleId: profile.id, avatar: user.avatar || profile.photos?.[0]?.value });
        } else {
          user = await User.create({
            name: profile.displayName,
            email,
            googleId: profile.id,
            avatar: profile.photos?.[0]?.value,
          });
        }
      }
      done(null, user);
    } catch (e) { done(e); }
  }));

  app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

  app.get('/api/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/?auth=fail' }),
    (req, res) => {
      const token = jwt.sign({ userId: req.user.id }, JWT_SECRET, { expiresIn: '30d' });
      res.redirect(`/?token=${token}`);
    }
  );
}

// ─── Forgot Password ──────────────────────────────────────────────────────────
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    if (!hasEmailConfig) {
      return res.status(503).json({ message: 'Password reset email is not configured for this deployment.' });
    }
    const { email } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) return res.json({ message: 'If that email exists, a reset link was sent.' });
    const token  = crypto.randomBytes(32).toString('hex');
    const expiry = Date.now() + 3600000; // 1 hour
    await user.update({ resetToken: token, resetExpiry: expiry });
    const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password.html?token=${token}`;
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      });
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'LifeClock — Reset Your Password',
      html: `<p>Click the link below to reset your password. It expires in 1 hour.</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
    });
    res.json({ message: 'If that email exists, a reset link was sent.' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    const user = await User.findOne({ where: { resetToken: token } });
    if (!user || user.resetExpiry < Date.now())
      return res.status(400).json({ message: 'Reset link is invalid or expired.' });
    await user.update({ password: await bcrypt.hash(password, 10), resetToken: null, resetExpiry: null });
    res.json({ message: 'Password updated successfully.' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ─── Settings Routes ──────────────────────────────────────────────────────────
app.get('/api/user/settings', auth, (req, res) => {
  res.json({ settings: { lifeExpectancy: req.user.lifeExpectancy, theme: req.user.theme }, timezone: req.user.timezone });
});

app.put('/api/user/settings', auth, async (req, res) => {
  try {
    const { lifeExpectancy, theme, timezone } = req.body;
    await req.user.update({ lifeExpectancy, theme, timezone });
    res.json({ settings: { lifeExpectancy: req.user.lifeExpectancy, theme: req.user.theme }, timezone: req.user.timezone });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ─── Session Routes ───────────────────────────────────────────────────────────
app.get('/api/sessions', auth, async (req, res) => {
  res.json(await Session.findAll({ where: { userId: req.user.id }, order: [['date','ASC'],['startTime','ASC']] }));
});

app.post('/api/sessions', auth, async (req, res) => {
  try {
    res.status(201).json(await Session.create({ ...req.body, userId: req.user.id }));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/sessions/:id', auth, async (req, res) => {
  try {
    const s = await Session.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!s) return res.status(404).json({ message: 'Not found' });
    res.json(await s.update(req.body));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/sessions/:id', auth, async (req, res) => {
  await Session.destroy({ where: { id: req.params.id, userId: req.user.id } });
  res.json({ message: 'Deleted' });
});

// ─── Notes Routes ─────────────────────────────────────────────────────────────
app.get('/api/notes', auth, async (req, res) => {
  res.json(await Note.findAll({ where: { userId: req.user.id } }));
});

app.post('/api/notes', auth, async (req, res) => {
  try {
    const [note] = await Note.upsert({ ...req.body, userId: req.user.id }, { returning: true });
    res.json(note);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/notes/:id', auth, async (req, res) => {
  try {
    const n = await Note.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!n) return res.status(404).json({ message: 'Not found' });
    res.json(await n.update(req.body));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/notes/:id', auth, async (req, res) => {
  await Note.destroy({ where: { id: req.params.id, userId: req.user.id } });
  res.json({ message: 'Deleted' });
});

// ─── Planner Routes ───────────────────────────────────────────────────────────
app.get('/api/planner', auth, async (req, res) => {
  res.json(await Planner.findAll({ where: { userId: req.user.id } }));
});

app.post('/api/planner', auth, async (req, res) => {
  try {
    const { date, viewType, content } = req.body;
    const existing = await Planner.findOne({ where: { userId: req.user.id, date, viewType } });
    if (existing) return res.json(await existing.update({ content }));
    res.status(201).json(await Planner.create({ date, viewType, content, userId: req.user.id }));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/planner/:id', auth, async (req, res) => {
  try {
    const p = await Planner.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!p) return res.status(404).json({ message: 'Not found' });
    res.json(await p.update(req.body));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/planner/:id', auth, async (req, res) => {
  await Planner.destroy({ where: { id: req.params.id, userId: req.user.id } });
  res.json({ message: 'Deleted' });
});

// ─── Calendar Event Routes ────────────────────────────────────────────────────
app.get('/api/calevents', auth, async (req, res) => {
  res.json(await CalendarEvent.findAll({ where: { userId: req.user.id }, order: [['date','ASC']] }));
});

app.post('/api/calevents', auth, async (req, res) => {
  try {
    res.status(201).json(await CalendarEvent.create({ ...req.body, userId: req.user.id }));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/calevents/:id', auth, async (req, res) => {
  try {
    const ev = await CalendarEvent.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!ev) return res.status(404).json({ message: 'Not found' });
    res.json(await ev.update(req.body));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/calevents/:id', auth, async (req, res) => {
  await CalendarEvent.destroy({ where: { id: req.params.id, userId: req.user.id } });
  res.json({ message: 'Deleted' });
});

// ─── Mood Routes ──────────────────────────────────────────────────────────────
app.get('/api/mood', auth, async (req, res) => {
  res.json(await MoodEntry.findAll({ where: { userId: req.user.id }, order: [['date','DESC']] }));
});

app.post('/api/mood', auth, async (req, res) => {
  try {
    const { date, mood, tags, journal } = req.body;
    const existing = await MoodEntry.findOne({ where: { userId: req.user.id, date } });
    if (existing) return res.json(await existing.update({ mood, tags, journal }));
    res.status(201).json(await MoodEntry.create({ date, mood, tags, journal, userId: req.user.id }));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/mood/:id', auth, async (req, res) => {
  await MoodEntry.destroy({ where: { id: req.params.id, userId: req.user.id } });
  res.json({ message: 'Deleted' });
});

// ─── Habit Routes ─────────────────────────────────────────────────────────────
app.get('/api/habits', auth, async (req, res) => {
  res.json(await Habit.findAll({ where: { userId: req.user.id }, order: [['createdAt','ASC']] }));
});

app.post('/api/habits', auth, async (req, res) => {
  try {
    res.status(201).json(await Habit.create({ ...req.body, userId: req.user.id }));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/habits/:id', auth, async (req, res) => {
  try {
    const h = await Habit.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!h) return res.status(404).json({ message: 'Not found' });
    res.json(await h.update(req.body));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/habits/:id', auth, async (req, res) => {
  await HabitLog.destroy({ where: { habitId: req.params.id, userId: req.user.id } });
  await Habit.destroy({ where: { id: req.params.id, userId: req.user.id } });
  res.json({ message: 'Deleted' });
});

// HabitLog: get logs for date range
app.get('/api/habitlogs', auth, async (req, res) => {
  const { from, to } = req.query;
  const where = { userId: req.user.id };
  if (from) where.date = { ...(where.date||{}), [require('sequelize').Op.gte]: from };
  if (to)   where.date = { ...(where.date||{}), [require('sequelize').Op.lte]: to };
  res.json(await HabitLog.findAll({ where, order: [['date','ASC']] }));
});

app.post('/api/habitlogs', auth, async (req, res) => {
  try {
    const { habitId, date, count } = req.body;
    const [log] = await HabitLog.upsert({ habitId, date, count, userId: req.user.id }, { returning: true });
    res.json(log);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ─── Time Audit Routes ────────────────────────────────────────────────────────
app.get('/api/timeentries', auth, async (req, res) => {
  res.json(await TimeEntry.findAll({ where: { userId: req.user.id }, order: [['date','DESC'],['start','DESC']] }));
});

app.post('/api/timeentries', auth, async (req, res) => {
  try {
    res.status(201).json(await TimeEntry.create({ ...req.body, userId: req.user.id }));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/timeentries/:id', auth, async (req, res) => {
  try {
    const t = await TimeEntry.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!t) return res.status(404).json({ message: 'Not found' });
    res.json(await t.update(req.body));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/timeentries/:id', auth, async (req, res) => {
  await TimeEntry.destroy({ where: { id: req.params.id, userId: req.user.id } });
  res.json({ message: 'Deleted' });
});

// ─── Milestone Routes ─────────────────────────────────────────────────────────
app.get('/api/milestones', auth, async (req, res) => {
  res.json(await Milestone.findAll({ where: { userId: req.user.id }, order: [['date','DESC']] }));
});

app.post('/api/milestones', auth, async (req, res) => {
  try {
    res.status(201).json(await Milestone.create({ ...req.body, userId: req.user.id }));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/milestones/:id', auth, async (req, res) => {
  try {
    const m = await Milestone.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!m) return res.status(404).json({ message: 'Not found' });
    res.json(await m.update(req.body));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/milestones/:id', auth, async (req, res) => {
  await Milestone.destroy({ where: { id: req.params.id, userId: req.user.id } });
  res.json({ message: 'Deleted' });
});

// ─── Sleep Routes ─────────────────────────────────────────────────────────────
app.get('/api/sleep', auth, async (req, res) => {
  res.json(await Sleep.findAll({ where: { userId: req.user.id }, order: [['date','DESC']] }));
});

app.post('/api/sleep', auth, async (req, res) => {
  try {
    res.status(201).json(await Sleep.create({ ...req.body, userId: req.user.id }));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/sleep/:id', auth, async (req, res) => {
  try {
    const s = await Sleep.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!s) return res.status(404).json({ message: 'Not found' });
    res.json(await s.update(req.body));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/sleep/:id', auth, async (req, res) => {
  await Sleep.destroy({ where: { id: req.params.id, userId: req.user.id } });
  res.json({ message: 'Deleted' });
});

// ─── Book Routes ──────────────────────────────────────────────────────────────
app.get('/api/books', auth, async (req, res) => {
  res.json(await Book.findAll({ where: { userId: req.user.id }, order: [['createdAt','DESC']] }));
});

app.post('/api/books', auth, async (req, res) => {
  try {
    res.status(201).json(await Book.create({ ...req.body, userId: req.user.id }));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/books/:id', auth, async (req, res) => {
  try {
    const b = await Book.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!b) return res.status(404).json({ message: 'Not found' });
    res.json(await b.update(req.body));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/books/:id', auth, async (req, res) => {
  await Book.destroy({ where: { id: req.params.id, userId: req.user.id } });
  res.json({ message: 'Deleted' });
});

// ─── Goal Routes ──────────────────────────────────────────────────────────────
app.get('/api/goals', auth, async (req, res) => {
  res.json(await Goal.findAll({ where: { userId: req.user.id }, order: [['createdAt','ASC']] }));
});

app.post('/api/goals', auth, async (req, res) => {
  try {
    res.status(201).json(await Goal.create({ ...req.body, userId: req.user.id }));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/goals/:id', auth, async (req, res) => {
  try {
    const g = await Goal.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!g) return res.status(404).json({ message: 'Not found' });
    res.json(await g.update(req.body));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/goals/:id', auth, async (req, res) => {
  await Goal.destroy({ where: { id: req.params.id, userId: req.user.id } });
  res.json({ message: 'Deleted' });
});

// ─── Countdown Routes ─────────────────────────────────────────────────────────
app.get('/api/countdowns', auth, async (req, res) => {
  res.json(await Countdown.findAll({ where: { userId: req.user.id }, order: [['targetDate','ASC']] }));
});

app.post('/api/countdowns', auth, async (req, res) => {
  try {
    res.status(201).json(await Countdown.create({ ...req.body, userId: req.user.id }));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/countdowns/:id', auth, async (req, res) => {
  await Countdown.destroy({ where: { id: req.params.id, userId: req.user.id } });
  res.json({ message: 'Deleted' });
});

// ─── Profile Routes ───────────────────────────────────────────────────────────
app.put('/api/user/profile', auth, async (req, res) => {
  try {
    const { name, dateOfBirth, timezone, lifeExpectancy } = req.body;
    await req.user.update({ name, dateOfBirth, timezone, lifeExpectancy });
    const u = req.user;
    res.json({ id: u.id, name: u.name, email: u.email, dateOfBirth: u.dateOfBirth, avatar: u.avatar, settings: { lifeExpectancy: u.lifeExpectancy, theme: u.theme }, timezone: u.timezone });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/user/avatar', auth, async (req, res) => {
  try {
    const { avatar } = req.body;
    if (!avatar) return res.status(400).json({ message: 'No avatar data' });
    await req.user.update({ avatar });
    res.json({ avatar: req.user.avatar });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/user/password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!await bcrypt.compare(currentPassword, req.user.password))
      return res.status(400).json({ message: 'Current password is incorrect' });
    await req.user.update({ password: await bcrypt.hash(newPassword, 10) });
    res.json({ message: 'Password updated' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ─── Start ────────────────────────────────────────────────────────────────────
// --- Admin Routes ------------------------------------------------------------
app.get('/admin', (req, res) => res.redirect('/admin.html'));
app.use(express.static('.'));

app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const totalUsers    = await User.count();
    const totalSessions = await Session.count();
    const today = new Date().toISOString().slice(0,10);
    const weekAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString().slice(0,10);
    const newToday = await User.count({ where: { createdAt: { [require('sequelize').Op.gte]: new Date(today) } } });
    const newWeek  = await User.count({ where: { createdAt: { [require('sequelize').Op.gte]: new Date(weekAgo) } } });
    res.json({ totalUsers, totalSessions, newToday, newWeek });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id','name','email','role','createdAt','dateOfBirth'],
      order: [['createdAt','DESC']]
    });
    res.json(users);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/admin/users/:id', adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    if (req.user.id == id) return res.status(400).json({ message: 'Cannot delete yourself' });
    await Session.destroy({ where: { userId: id } });
    await Note.destroy({ where: { userId: id } });
    await User.destroy({ where: { id } });
    res.json({ message: 'User deleted' });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/admin/users/:id/role', adminAuth, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'Not found' });
    await user.update({ role: req.body.role });
    res.json({ message: 'Role updated' });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

sequelize.sync({ alter: true })
  .then(async () => {
    console.log('PostgreSQL connected & tables synced');

    if (hasEmailConfig) {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      });

      cron.schedule('* * * * *', async () => {
        try {
          const sessions = await Session.findAll({ where: { completed: false, notificationSent: false }, include: [{ model: User }] });
          const now = new Date();
          for (const s of sessions) {
            if (!s.date || !s.startTime || !s.User?.email) continue;
            const sessionTime = new Date(`${s.date}T${s.startTime}`);
            const nowInTz = new Date(now.toLocaleString('en-US', { timeZone: s.User.timezone || 'UTC' }));
            if (Math.abs(sessionTime - nowInTz) < 60000) {
              await transporter.sendMail({ from: process.env.EMAIL_USER, to: s.User.email, subject: `Time to study ${s.subject}!`, text: `Your ${s.subject} session starts now` }).catch(console.error);
              await s.update({ notificationSent: true });
            }
          }
        } catch (e) { console.error('Cron error:', e.message); }
      });

      cron.schedule('* * * * *', async () => {
        try {
          const now = new Date();
          const todayStr = now.toISOString().slice(0, 10);
          const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
          const evs = await CalendarEvent.findAll({ where: { date: todayStr, notifyTime: timeStr, notificationSent: false }, include: [{ model: User }] });
          for (const ev of evs) {
            if (!ev.User?.email) continue;
            await transporter.sendMail({ from: process.env.EMAIL_USER, to: ev.User.email, subject: `Reminder: ${ev.title}`, text: `Your event "${ev.title}" is now` }).catch(console.error);
            await ev.update({ notificationSent: true });
          }
        } catch (e) { console.error('Calendar cron error:', e.message); }
      });
    } else {
      console.log('Email features disabled: EMAIL_USER / EMAIL_PASS not configured');
    }

    app.get('/api/share/:userId', async (req, res) => {
      try {
        const user = await User.findByPk(req.params.userId, { attributes: ['id','name','dateOfBirth','lifeExpectancy','avatar'] });
        if (!user) return res.status(404).json({ message: 'Not found' });
        const sessions = await Session.findAll({ where: { userId: user.id }, attributes: ['subject','date','actualDuration','plannedDuration'] });
        res.json({ user: { name: user.name, dateOfBirth: user.dateOfBirth, lifeExpectancy: user.lifeExpectancy, avatar: user.avatar }, sessions });
      } catch(e) { res.status(500).json({ message: e.message }); }
    });

    app.listen(PORT, () => console.log(`LifeClock running on http://localhost:${PORT}`));
  })
  .catch(e => console.error('DB connection failed:', e.message));
