const express = require("express");
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bodyParser = require("body-parser");
const { DateTime } = require('luxon');
const app = express();
app.set('trust proxy', 1);
const path = require('path');

const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

// multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

require('dotenv').config();
const { Pool } = require("pg");
const cors = require("cors");
const passport = require("passport");
require("./auth.js"); //passport-google-oauth20
const corsOptions = {
  origin: ["http://localhost:5173", "https://passion-project-client.vercel.app"], // only accept requests from our frontend server or hosted server
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
};

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const db = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 5432,
});

app.use(cors(corsOptions));
app.use(session({
  store: new pgSession({
    pool: db,
    tableName: 'session'
  }),
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    httpOnly: true,
    sameSite: 'none',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 day persistence
  }
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(bodyParser.json());


//debug database connection 
app.get("/debug/db", async (req, res) => {
  const client = await db.connect();
  try {
    const dbInfo = await client.query(`
      SELECT current_database(), current_user, current_schema();
    `);
    const tables = await client.query(`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public';
    `);

    res.json({
      db: dbInfo.rows[0],
      tables: tables.rows.map(r => r.tablename)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.post("/api/log-workout", isLoggedIn, async (req, res) => {
  //req received from client  example benchpress : [index 0: {reps, weight}, index 1: {reps, weight}, index 2:........}] where the index is the set number

  const exercises = req.body;
  const userId = req.user.id; // grab user id from auth
  const workoutDate = new Date(); 

  
  const client = await db.connect();
  
  try {
     await client.query('BEGIN');

    // insert workout
    const workoutResult = await client.query(
      `INSERT INTO workouts (userid, date) VALUES ($1, $2) RETURNING id`, [userId, workoutDate]
    );
    const workoutId = workoutResult.rows[0].id;

    // loop through each exercise
    for (const [exerciseName, sets] of Object.entries(exercises)) {
      const exerciseResult = await client.query(
        // check if the exercise is already in the db
        `SELECT id FROM exercises WHERE exercisename = $1`, [exerciseName]
      );

      let exerciseId;
      if (exerciseResult.rows.length > 0) { // if exercise is already in db
        exerciseId = exerciseResult.rows[0].id; // get the id
      } else {
        //otherwise insert the new exercise
        const insertExerciseResult = await client.query(
          `INSERT INTO exercises (exercisename, Exercisecategory) VALUES ($1, $2) RETURNING id`, [exerciseName, "Strength"]
        );
        exerciseId = insertExerciseResult.rows[0].id;
      }

      // insert into workoutExercises
      const workoutExerciseResult = await client.query(
        `INSERT INTO workoutexercises (workoutid, exerciseid) VALUES ($1, $2) RETURNING id`, [workoutId, exerciseId] // linking workout session with the exercise id
      );
      const workoutExerciseId = workoutExerciseResult.rows[0].id;

      // insert each set
      for (const set of sets) {
        const reps = parseInt(set.reps, 10); // extract the reps
        const weight = parseFloat(set.weight); // extract the weight of each set

        await client.query(
          `INSERT INTO sets (workoutexerciseid, reps, weight) VALUES ($1, $2, $3)`, [workoutExerciseId, reps, weight] // linking sets to each exercise done in the workout session
        );
      }
    }
    await client.query('COMMIT');
    res.json({"message": "Workout logged successfully"}); //response that client will receive

  } catch (err) {
    console.error("Error logging workout:", err);
    await client.query('ROLLBACK');
    res.status(500).json({ error: "Failed to log workout" });
  } finally {
    client.release();
  }
});


app.post("/api/log-cardio", isLoggedIn, async (req, res) => {
  const cardioExercises = req.body;
  const userId = req.user.id; // grab id from auth
  const workoutDate = new Date();
  //console.log(cardioExercises)

  const client = await db.connect();
  
  try {
    await client.query('BEGIN');

    // insert workout
    const workoutResult = await client.query(
      `INSERT INTO workouts (userid, date) VALUES ($1, $2) RETURNING id`, [userId, workoutDate]
    );
    const workoutId = workoutResult.rows[0].id;

    // loop through each exercise
    for (const [exerciseName, entry] of Object.entries(cardioExercises)) {
      const cardioExerciseResult = await client.query(
        // check if the exercise is already in the db
        `SELECT id FROM exercises WHERE exercisename = $1`, [exerciseName]
      );

      let exerciseId;
      if (cardioExerciseResult.rows.length > 0) { // if exercise is already in db
        exerciseId = cardioExerciseResult.rows[0].id; // get the id
      } else {
        //otherwise insert the new exercise
        const insertCardioExerciseResult = await client.query(
          `INSERT INTO exercises (exercisename, Exercisecategory) VALUES ($1, $2) RETURNING id`, [exerciseName, "Cardio"]
        );
        exerciseId = insertCardioExerciseResult.rows[0].id;
      }

      // insert into workoutExercises
      const workoutExerciseResult = await client.query(
        `INSERT INTO workoutexercises (workoutid, exerciseid) VALUES ($1, $2) RETURNING id`, [workoutId, exerciseId] // linking workout session with the exercise id
      );
      const workoutExerciseId = workoutExerciseResult.rows[0].id;

      // insert duration and calories burned into cardio
      
      const duration = parseInt(entry.duration, 10); // extract the duration
      const caloriesBurned = parseFloat(entry.caloriesBurned); // extract the calories burned

        await client.query(
          `INSERT INTO cardio (workoutexerciseid, duration_minutes, calories_burned) VALUES ($1, $2, $3)`, [workoutExerciseId, duration, caloriesBurned] // linking duration and cal burned to each cardio exercise done in the workout session
        );
    }
    await client.query('COMMIT');
    res.json({"message": "Cardio Workout logged successfully"}); //response that client will receive


  } catch (err) {
    console.error("Error logging cardio workout:", err);
    await client.query('ROLLBACK');
    res.status(500).json({ error: "Failed to log cardio workout" });
  } finally {
    client.release();
  }
});


app.get("/api/fetch-workouts", isLoggedIn, async (req, res) => {
  // Get all workouts for a specific user
  const client = await db.connect();
  await client.query(`SET search_path TO public`);
  const userId = req.user.id; //grab id from auth

  // query params to filter by date range
  let { start, end } = req.query;
  let startDate = start ? new Date(start) : null;
  let endDate = end ? new Date(end) : null;

  try {
    await client.query('BEGIN');

    //replace inner loops with single join query for faster look up
    const query = `
      SELECT
        w.id AS workout_id,
        w.date,
        we.id AS workout_exercise_id,
        e.exercisename,
        e.exercisecategory,
        s.reps,
        s.weight,
        c.duration_minutes,
        c.calories_burned
      FROM workouts w
      JOIN workoutexercises we ON w.id = we.workoutid
      JOIN exercises e ON we.exerciseid = e.id
      LEFT JOIN sets s ON s.workoutexerciseid = we.id AND e.exercisecategory = 'Strength'
      LEFT JOIN cardio c ON c.workoutexerciseid = we.id AND e.exercisecategory != 'Strength'
      WHERE w.userid = $1
        AND ($2::timestamptz IS NULL OR w.date >= $2)
        AND ($3::timestamptz IS NULL OR w.date <= $3)
      ORDER BY w.date ASC, we.id ASC, s.id ASC
    `;

    const { rows } = await client.query(query, [userId, startDate, endDate]);
    
    const workoutsMap = new Map();

    // For each workout, fetch its associated workout exercises:
    for (const row of rows) {
      const workoutId = row.workout_id;

      if (!workoutsMap.has(workoutId)) {
        workoutsMap.set(workoutId, {
          workoutId,
          date: row.date,
          exercises: []
        });
      }

      const workout = workoutsMap.get(workoutId);
      
      let exercise = workout.exercises.find(e => e.name === row.exercisename && e.category === row.exercisecategory);

      if (!exercise) {
        if (row.exercisecategory === "Strength") {
          exercise = {
            name: row.exercisename,
            category: row.exercisecategory,
            sets: []
          };
        } else {
          exercise = {
            name: row.exercisename,
            category: row.exercisecategory,
            cardio: {
              duration_minutes: row.duration_minutes,
              calories_burned: row.calories_burned
            }
          };
        }
        workout.exercises.push(exercise);
      }

      if (exercise.sets && row.reps !== null) {
        exercise.sets.push({ reps: row.reps, weight: row.weight });
      }
    }
    await client.query('COMMIT');

    //console.log(JSON.stringify(finalData, null, 2));
    res.json([...workoutsMap.values()]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error executing query", err);
    res.status(500).json({ error: 'Error fetching workouts' });
  } finally {
    client.release();
  }
});


//fetch users prs for bench, squat, deadlift
app.get("/api/fetch-prs", isLoggedIn, async (req, res) => {
  const client = await db.connect();
  const userId = req.user.id; //grab id from auth
  try {
    const prRowsResult = await client.query(`
      SELECT exercisename, exercisecategory, reps, weight, date
      FROM (
        SELECT
          e.exercisename,
          e.exercisecategory,
          s.reps,
          s.weight,
          w.date,
          ROW_NUMBER() OVER (
            PARTITION BY e.exercisename            -- group by exercise name
            ORDER BY s.weight DESC, s.reps DESC    -- order by weight lifted and if tie then order by number of reps
          ) AS rn
        FROM sets s
        JOIN workoutexercises we ON s.workoutexerciseid = we.Id
        JOIN exercises e ON we.exerciseid = e.id
        JOIN workouts w ON we.workoutid = w.id
        WHERE e.exercisename IN ('Bench Press', 'Barbell Squat', 'Deadlift')
        AND w.userid = $1
      ) ranked
      WHERE rn = 1
    `, [userId]);
    
    const finalData = [];

    for (const pr of prRowsResult.rows) {
      finalData.push({
        key: pr.exercisename,
        name: pr.exercisename,
        category: pr.exercisecategory,
        reps: pr.reps,
        weight: pr.weight,
        date: pr.date
      });
    }
    // console.log(JSON.stringify(finalData, null, 2));
    res.json(finalData);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error executing query", err);
    res.status(500).json({ error: 'Error fetching workouts' });
  } finally {
    client.release();
  }
});



//fetch users running prs based on duration and calories burned
app.get("/api/fetch-cardio-prs", isLoggedIn, async (req, res) => {
  const client = await db.connect();
  const userId = req.user.id; //grab id from auth
  try {
    const cardioPrRowsResult = await client.query(`
      SELECT exercisename, exercisecategory, duration_minutes, calories_burned, date
      FROM (
        SELECT
          e.exercisename,
          e.exercisecategory,
          c.duration_minutes,
          c.calories_burned,
          w.date,
          ROW_NUMBER() OVER (
            PARTITION BY e.exercisename            -- group by exercise name
            ORDER BY c.duration_minutes DESC, c.calories_burned DESC    -- order by duration and if tie then order by calories burned
          ) AS rn
        FROM cardio c
        JOIN workoutexercises we ON c.workoutexerciseid = we.Id
        JOIN exercises e ON we.exerciseid = e.id
        JOIN workouts w ON we.workoutid = w.id
        WHERE e.exercisename IN ('Treadmill Run', 'Stairmaster', 'Running Outdoors', 'Stationary Bike', 'Outdoors Bike', 'Swimming')
        AND w.userid = $1
      ) ranked
      WHERE rn = 1
    `, [userId]);
    
    const finalCardioData = [];

    for (const pr of cardioPrRowsResult.rows) {
      finalCardioData.push({
        key: pr.exercisename,
        name: pr.exercisename,
        category: pr.exercisecategory,
        duration: pr.duration_minutes,
        calories: pr.calories_burned,
        date: pr.date
      });
    }
    res.json(finalCardioData);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error executing query", err);
    res.status(500).json({ error: 'Error fetching cardio workouts' });
  } finally {
    client.release();
  }
});


// api to fetch how many days user has worked out this week
app.post("/api/fetch-user-activity", isLoggedIn, async (req, res) => {
  const client = await db.connect();
  const userId = req.user.id; //grab id from auth
  const timeZone = req.body.timeZone || 'UTC'; //grab user timezone from client

  // use CDT timezone
  const now = DateTime.now().setZone(timeZone);

  // calculate start of week sunday
  const startOfWeek = now.startOf('week');

  // calculate end of week saturday
  const endOfWeek = startOfWeek.plus({ days: 6 }).endOf('day');

  console.log("User timezone:", timeZone);
  console.log("Start of week:", startOfWeek.toISO());
  console.log("End of week:", endOfWeek.toISO());

  try {
    // count distinct dates only without their timestamp that are between the curr week
    const result = await client.query(`SELECT COUNT(DISTINCT date::date) AS count FROM workouts WHERE userid = $1 AND date >= $2 AND date <= $3`, [userId, startOfWeek.toISO(), endOfWeek.toISO()]);
    // extract count as an int
    const daysWorkedOut = parseInt(result.rows[0].count, 10);
    res.json({ daysWorkedOut });

  } catch (err) {
    console.error("Error executing query", err);
    res.status(500).json({ error: 'Error fetching user activity' });
  } finally {
    client.release();
  }
});


// api to upload avatar pic to supabase storage and update avatar_path to it in the storage
app.post('/api/upload-avatar', isLoggedIn, upload.single('avatar'), async (req, res) => {
  const file = req.file; // get the avatar file
  const userId = req.user.id; // get user id

  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const fileExt = path.extname(file.originalname);
  // uniquely name file name with userid
  const fileName = `avatars/${userId}${fileExt}`;
  const bucketName = 'profile-pictures'; // supabase storage bucket

  try {
    // upload file to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: true, // replace existing file with the same name
      });

    if (uploadError) {
      console.error(uploadError);
      return res.status(500).json({ error: 'Error uploading to Supabase' });
    }

    // get the public URL
    const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(fileName);
    const publicUrl = publicUrlData.publicUrl;

    // update the users avatar_path in PostgreSQL db
    await db.query(
      `UPDATE users SET avatar_path = $1 WHERE id = $2`,
      [publicUrl, userId]
    );

    res.status(200).json({ message: 'Avatar uploaded successfully', avatarUrl: publicUrl });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error uploading avatar' });
  }
});


// api route that will fetch non sensitive user info for each users public profile that will be discoverable by other users
app.get('/api/public-profile/:username', isLoggedIn, async (req, res) => {
  // extract user name from url
  const username = decodeURIComponent(req.params.username);
    try {
      const result = await db.query(
        'SELECT username, avatar_path, id FROM users WHERE username = $1',
        [username]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found'});
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error fetching profile:', error);
      res.status(500).json({ error: 'Internal server error'});
    }
});



// function to check if user is logged in
function isLoggedIn(req, res, next) {
  req.user ? next() : res.sendStatus(401);
}

// tells the frontend if user is logged in => (updated to include user profile pic)
app.get('/api/auth/me', async (req, res) => {
  if (!req.user) return res.status(401).json({ user: null });

  const userId = req.user.id;

  try {
    const result = await db.query(
      'SELECT username, email, avatar_path FROM users WHERE id = $1',
      [userId]
    );

    const userProfile = result.rows[0];

    // send all fields from passport session as well as profile data from db
    res.json({ user: { ...req.user, ...userProfile } });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});


// user auth api
app.get('/api/auth', (req, res) => {
  res.send('<a href="/api/auth/google">Authenticate with Google</a>');
});

//end point /auth/google
app.get('/api/auth/google',
  passport.authenticate('google', { scope: ['email', 'profile'] })
);

app.get('/api/google/callback',
  passport.authenticate('google', {
    successRedirect: '/api/auth/success',
    failureRedirect: '/api/auth/failure',
  })
);

app.get('/api/auth/success', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'auth-success.html'));
});

app.get('/api/auth/failure', (req, res) => {
  res.send('Something went wrong..');
});

// protected route
app.get('/api/protected', isLoggedIn, (req, res) => {
  //res.send(`Hello ${req.user.displayName}`);
  res.json({ user: req.user });
});

//LOG out route
app.get('/api/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);

    req.session.destroy(err => {
      if (err) {
        console.error('Error destroying session:', err);
        return res.status(500).send('Logout failed');
      }
      res.clearCookie('connect.sid', {
        path: '/',
        sameSite: 'none',
        secure: true,
      });
      res.send('Goodbye!');
    });
  });
});


// route for pinging to keep server warm
app.get('/api/ping', (req, res) => {
  res.status(200).send('OK');
});


app.listen(8080, () => {
  console.log("Server started on port 8080");
});


