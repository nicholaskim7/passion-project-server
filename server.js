const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const cors = require("cors");
const corsOptions = {
  origin: ["http://localhost:5173"], // only accept requests from our frontend server
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

app.post("/api/log-workout", (req, res) => {
  console.log(req.body);
  let {exercises} = req.body;
  res.json({"message": "Form Submitted"});
});


app.listen(8080, () => {
  console.log("Server started on port 8080");
});


