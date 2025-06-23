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
  console.log(req.body); //req received from client  example benchpress : {set 1:[reps, weight], set 2:[reps, weight], set3........}
  let {exercises} = req.body; 
  res.json({"message": "Form Submitted"}); //response that client will receive
});


app.listen(8080, () => {
  console.log("Server started on port 8080");
});


