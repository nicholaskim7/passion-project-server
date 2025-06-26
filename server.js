const express = require("express");
const bodyParser = require("body-parser");
const app = express();
require('dotenv').config();
const { Pool } = require("pg");
const cors = require("cors");
const corsOptions = {
  origin: ["http://localhost:5173"], // only accept requests from our frontend server
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

const db = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 5432,
});

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

app.post("/api/log-workout", async (req, res) => {
  //req received from client  example benchpress : [index 0: {reps, weight}, index 1: {reps, weight}, index 2:........}] where the index is the set number

  const exercises = req.body;
  const userId = 1; //hardcoded user
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


app.post("/api/log-cardio", async (req, res) => {
  const cardioExercises = req.body;
  const userId = 1; //hardcoded user
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


app.get("/api/fetch-workouts", async (req, res) => {
  // Get all workouts for a specific user

  const client = await db.connect();
  await client.query(`SET search_path TO public`);
  const userId = 1; //hardcoded user
  try {
    await client.query('BEGIN');
    const workoutsResult = await client.query('SELECT * FROM workouts WHERE userid = $1', [userId]); // rows of recorded workouts with date

    const finalData = [];

    // For each workout, fetch its associated workout exercises:
    for (const workout of workoutsResult.rows) {
      const workoutId = workout.id;

      const workoutExercisesResult = await client.query('SELECT * FROM workoutexercises WHERE workoutid = $1', [workoutId]); // workoutExercises

      const detailedExercises = [];
      
      // For each workout exercise, fetch the exercise details:
      for (const we of workoutExercisesResult.rows) {
        const exerciseId = we.exerciseid;

        const exerciseRowsResult = await client.query('SELECT * FROM exercises WHERE id = $1', [exerciseId]); // exercises done in that particular workout

        const exercise = exerciseRowsResult.rows[0];

        // Then fetch the sets for each workoutExerciseId:
        if (exercise.exercisecategory == "Strength") { // see if we need to fetch from sets or from cardio
          const setRowsResult = await client.query('SELECT reps, weight FROM sets WHERE workoutexerciseid = $1', [we.id]);
          detailedExercises.push({
            name: exercise.exercisename,
            category: exercise.exercisecategory,
            sets: setRowsResult.rows // strength exercises we will have sets array
          });
        } else {
          const cardioRowsResult = await client.query('SELECT duration_minutes, calories_burned FROM cardio WHERE workoutexerciseid = $1', [we.id]);
            detailedExercises.push({
              name: exercise.exercisename,
              category: exercise.exercisecategory,
              cardio: cardioRowsResult.rows[0] // for cardio we will have duration and calories burned
            });
        }
      }

      finalData.push({
        workoutId,
        date: workout.date,
        exercises: detailedExercises
      });
    }

    //console.log(JSON.stringify(finalData, null, 2));
    res.json(finalData);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error executing query", err);
    res.status(500).json({ error: 'Error fetching workouts' });
  } finally {
    client.release();
  }
});


//fetch users prs for bench, squat, deadlift
app.get("/api/fetch-prs", async (req, res) => {
  const client = await db.connect();
  const userId = 1; //hardcoded user
  try {
    await client.query('BEGIN');
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


app.listen(8080, () => {
  console.log("Server started on port 8080");
});


