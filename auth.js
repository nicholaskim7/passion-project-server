const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
require('dotenv').config();
const { Pool } = require('pg');

const db = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 5432,
});

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://passion-project-server.onrender.com/api/google/callback",
  },
  async function(accessToken, refreshToken, profile, cb) {
    const client = await db.connect();
    try {
      const googleId = profile.id;
      const email = profile.emails[0].value;
      const username = profile.displayName;

      // see if user already exists
      const {rows} = await client.query('SELECT * FROM users WHERE google_id = $1 OR email= $2', [googleId, email]);

      if (rows.length > 0) {
        // found user in db
        return cb(null, rows[0]);
      }

      // otherwise create new user
      const insertQuery = `
      INSERT INTO users (username, email, google_id)
      VALUES ($1, $2, $3)
      RETURNING *;
      `;
      const insertValues = [username, email, googleId];
      const {rows: newUserRows } = await client.query(insertQuery, insertValues);

      return cb(null, newUserRows[0]);
    } catch(err) {
      return cb(err, null);
    } finally {
      client.release();
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    console.log('deserializeUser result:', rows[0]);
    done(null, rows[0]);
  } catch (err) {
    console.error('deserializeUser error:', err);
    done(err, null);
  }
});


