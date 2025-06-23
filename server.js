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
})


app.listen(8080, () => {
  console.log("Server started on port 8080");
});


