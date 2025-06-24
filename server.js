const express = require("express");
const bodyParser = require("body-parser");
const app = express();
require('dotenv').config();
const mysql = require("mysql2/promise");
const cors = require("cors");
const corsOptions = {
  origin: ["http://localhost:5173"], // only accept requests from our frontend server
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

app.post("/api/log-workout", async (req, res) => {
  //req received from client  example benchpress : [index 0: {reps, weight}, index 1: {reps, weight}, index 2:........}] where the index is the set number
  const exercises = req.body;
  const userId = 1; //hardcoded user
  const workoutDate = new Date(); 

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // insert workout
    const [workoutResult] = await conn.execute(
      `INSERT INTO workouts (userId, date) VALUES (?, ?)`, [userId, workoutDate]
    );
    const workoutId = workoutResult.insertId;

    // loop through each exercise
    for (const [exerciseName, sets] of Object.entries(exercises)) {
      const [rows] = await conn.execute(
        // check if the exercise is already in the db
        `SELECT Id FROM exercises WHERE exerciseName = ?`, [exerciseName]
      );

      let exerciseId;
      if (rows.length > 0) { // if exercise is already in db
        exerciseId = rows[0].Id; // get the id
      } else {
        //otherwise insert the new exercise
        const [insertExercise] = await conn.execute(
          `INSERT INTO exercises (exerciseName, ExerciseCategory) VALUES (?, ?)`, [exerciseName, "Uncategorized"]
        );
        exerciseId = insertExercise.insertId;
      }

      // insert into workoutExercises
      const [workExRes] = await conn.execute(
        `INSERT INTO workoutexercises (workoutId, exerciseId) VALUES (?, ?)`, [workoutId, exerciseId]
      );
      const workoutExerciseId = workExRes.insertId;

      // insert each set
      for (const set of sets) {
        const reps = parseInt(set.reps, 10); // extract the reps
        const weight = parseFloat(set.weight); // extract the weight of each set

        await conn.execute(
          `INSERT INTO sets (workoutExerciseId, reps, weight) VALUES (?, ?, ?)`, [workoutExerciseId, reps, weight]
        );
      }
    }
    await conn.commit();
    res.json({"message": "Workout logged successfully"}); //response that client will receive

  } catch (err) {
    console.error("Error logging workout:", err);
    await conn.rollback();
    res.status(500).json({ error: "Failed to log workout" });
  } finally {
    conn.release();
  }
});


app.get("/api/fetch-workouts", async (req, res) => {
  // Get all workouts for a specific user
  const conn = await db.getConnection();
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



app.listen(8080, () => {
  console.log("Server started on port 8080");
});


