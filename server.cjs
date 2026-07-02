require("dotenv").config({ path: "./functions-renclone/.env" });

const path = require("node:path");
const fs = require("node:fs");
const express = require("express");

const projectRoot = __dirname;
process.env.REN_CLONE_AUDIO_DIR = path.join(projectRoot, "audio");

const { handleRenCloneRequest } = require("./functions-renclone/ren-clone-handler");
const { handleRenCloneLiveRequest } = require("./functions-renclone/ren-clone-live-handler");

const app = express();
app.set("strict routing", true);
app.use(express.json({ limit: "100kb" }));

const BASE_PATH = "/ddrzh";

app.get("/", (_request, response) => {
  response.redirect(`${BASE_PATH}/`);
});
app.get(BASE_PATH, (_request, response) => {
  response.redirect(`${BASE_PATH}/`);
});

app.use(`${BASE_PATH}/audio`, express.static(process.env.REN_CLONE_AUDIO_DIR));
app.all(`${BASE_PATH}/api/ren-clone`, handleRenCloneRequest);
app.all(`${BASE_PATH}/api/ren-clone-live`, handleRenCloneLiveRequest);

app.get(`${BASE_PATH}/*`, (request, response, next) => {
  const relativePath = request.params[0] || "";
  const safeRelativePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = path.join(projectRoot, safeRelativePath);

  fs.stat(filePath, (error, stats) => {
    if (error) return next();
    if (stats.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    response.sendFile(filePath, (sendError) => {
      if (sendError) next();
    });
  });
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`DDRZH server running at http://0.0.0.0:${PORT}${BASE_PATH}/`);
});
