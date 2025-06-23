const express = require("express");
const bodyParser = require("body-parser");
const app = express();
require('dotenv').config();
const mysql = require("mysql2");
const cors = require("cors");
const corsOptions = {
  origin: ["http://localhost:5173"], // only accept requests from our frontend server
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

connection.connect((err) => {
  if (err) {
    throw err;
  }
  console.log('DB connection was successful');

});

app.post("/api/log-workout", (req, res) => {
  //console.log(req.body); //req received from client  example benchpress : {set 1:[reps, weight], set 2:[reps, weight], set3........}
  const exercises = req.body;

  //iterate through exercises
  for (const [exerciseName, sets] of Object.entries(exercises)) { //exercise : array of sets/weight
    sets.forEach((set, index) => { // iterate through each exercises sets
      const reps = parseInt(set.reps, 10); // extract the reps
      const weight = parseFloat(set.weight); // extract the weight of each set

      //replace with logic to insert into database
      console.log(`Exercise: ${exerciseName}, Set ${index + 1}: ${reps} reps @ ${weight} lbs`);
    });
  }
  res.json({"message": "Workout logged successfully"}); //response that client will receive
});


app.listen(8080, () => {
  console.log("Server started on port 8080");
});


