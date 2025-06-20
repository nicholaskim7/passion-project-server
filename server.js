const express = require("express");
const app = express();
const cors = require("cors");
const corsOptions = {
  origin: ["http://localhost:5173"], // only accept requests from our frontend server
};

app.use(cors(corsOptions));

app.get("/api", (req, res) => {
  res.json({ "fruits": ["apple", "orange", "banana"] });

});


app.listen(8080, () => {
  console.log("Server started on port 8080");
});


