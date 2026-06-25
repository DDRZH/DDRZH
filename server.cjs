require("dotenv").config({ path: "./functions/.env" });

const path = require("node:path");
const express = require("express");
const { handleRenCloneRequest } = require("./functions/ren-clone-handler");

const projectRoot = __dirname;
process.env.REN_CLONE_AUDIO_DIR = path.join(projectRoot, "audio");

const app = express();
app.use(express.json({ limit: "100kb" }));
app.use(express.static(projectRoot));
app.use("/audio", express.static(process.env.REN_CLONE_AUDIO_DIR));

app.all("/api/ren-clone", handleRenCloneRequest);

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, "127.0.0.1", () => {
  console.log(`DDRZH dev server running at http://127.0.0.1:${PORT}`);
});
