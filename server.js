const express = require("express");
const bodyParser = require("body-parser");
const app = express();
require('dotenv').config();
//const mysql = require("mysql2/promise");
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

app.post("/api/log-workout", async (req, res) => {
  //req received from client  example benchpress : [index 0: {reps, weight}, index 1: {reps, weight}, index 2:........}] where the index is the set number
  const exercises = req.body;
  const userId = 1; //hardcoded user
  const workoutDate = new Date(); 

  // const conn = await db.getConnection();
  const client = await db.connect();

  try {
    // await conn.beginTransaction();
     await client.query('BEGIN');

    // insert workout
    const workoutResult = await client.query(
      `INSERT INTO workouts (userId, date) VALUES ($1, $2) RETURNING id`, [userId, workoutDate]
    );
    const workoutId = workoutResult.rows[0].id;

    // loop through each exercise
    for (const [exerciseName, sets] of Object.entries(exercises)) {
      const exerciseResult = await client.query(
        // check if the exercise is already in the db
        `SELECT Id FROM exercises WHERE exerciseName = $1`, [exerciseName]
      );

      let exerciseId;
      if (exerciseResult.length > 0) { // if exercise is already in db
        exerciseId = exerciseResult.rows[0].id; // get the id
      } else {
        //otherwise insert the new exercise
        const insertExerciseResult = await client.query(
          `INSERT INTO exercises (exerciseName, ExerciseCategory) VALUES ($1, $2) RETURNING id`, [exerciseName, "Uncategorized"]
        );
        exerciseId = insertExerciseResult.rows[0].id;
      }

      // insert into workoutExercises
      const workoutExerciseResult = await client.query(
        `INSERT INTO workoutexercises (workoutId, exerciseId) VALUES ($1, $2) RETURNING id`, [workoutId, exerciseId] // linking workout session with the exercise id
      );
      const workoutExerciseId = workoutExerciseResult.rows[0].id;

      // insert each set
      for (const set of sets) {
        const reps = parseInt(set.reps, 10); // extract the reps
        const weight = parseFloat(set.weight); // extract the weight of each set

        await client.query(
          `INSERT INTO sets (workoutExerciseId, reps, weight) VALUES ($1, $2, $3)`, [workoutExerciseId, reps, weight] // linking sets to each exercise done in the workout session
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


app.get("/api/fetch-workouts", async (req, res) => {
  // Get all workouts for a specific user
  // const conn = await db.getConnection();
  const userId = 1; //hardcoded user
  try {
    const [workouts] = await conn.query('SELECT * FROM workouts WHERE userId = ?', [userId]); // rows of recorded workouts with date

    const finalData = [];

    // For each workout, fetch its associated workout exercises:
    for (const workout of workouts) {
      const workoutId = workout.id;

      const [workoutExercises] = await conn.query('SELECT * FROM workoutexercises WHERE workoutId = ?', [workoutId]); // workoutExercises

      const detailedExercises = [];
      
      // For each workout exercise, fetch the exercise details:
      for (const we of workoutExercises) {
        const exerciseId = we.exerciseId;

        const [exerciseRows] = await conn.query('SELECT * FROM exercises WHERE id = ?', [exerciseId]); // exercises done in that particular workout

        const exercise = exerciseRows[0];

        // Then fetch the sets for each workoutExerciseId:
        const [setRows] = await conn.query('SELECT reps, weight FROM sets WHERE workoutExerciseId = ?', [we.Id]);

        detailedExercises.push({
          name: exercise.exerciseName,
          category: exercise.exerciseCategory,
          sets: setRows
        });
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
    console.error("Error executing query", err);
    res.status(500).json({ error: 'Error fetching workouts' });
  } finally {
    conn.release();
  }
});


//fetch users prs for bench, squat, deadlift
app.get("/api/fetch-prs", async (req, res) => {
  // const conn = await db.getConnection();
  const userId = 1; //hardcoded user
  try {
    const [prRows] = await conn.query(`
      SELECT exerciseName, exerciseCategory, reps, weight, date
      FROM (
        SELECT
          e.exerciseName,
          e.exerciseCategory,
          s.reps,
          s.weight,
          w.date,
          ROW_NUMBER() OVER (
            PARTITION BY e.exerciseName            -- group by exercise name
            ORDER BY s.weight DESC, s.reps DESC    -- order by weight lifted and if tie then order by number of reps
          ) AS rn
        FROM sets s
        JOIN workoutexercises we ON s.workoutExerciseId = we.Id
        JOIN exercises e ON we.exerciseId = e.id
        JOIN workouts w ON we.workoutId = w.id
        WHERE e.exerciseName IN ("Bench Press", "Barbell Squat", "Deadlift")
        AND w.userId = ?
      ) ranked
      WHERE rn = 1
    `, [userId]);
    
    const finalData = [];

    for (const pr of prRows) {
      finalData.push({
        key: pr.exerciseName,
        name: pr.exerciseName,
        category: pr.exerciseCategory,
        reps: pr.reps,
        weight: pr.weight,
        date: pr.date
      });
    }
    // console.log(JSON.stringify(finalData, null, 2));
    res.json(finalData);

  } catch (err) {
    console.error("Error executing query", err);
    res.status(500).json({ error: 'Error fetching workouts' });
  } finally {
    conn.release();
  }
});



app.listen(8080, () => {
  console.log("Server started on port 8080");
});


