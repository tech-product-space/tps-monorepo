const { runJS } = require("../service/compiler/javascriptService");
const { runPython } = require("../service/compiler/pythonService");

async function compileCode(req, res) {
  const { language, code, stdIn='' } = req.body;

  if (!language || !code) {
    return res.status(400).json({ error: "language and code required" });
  }

  try {
    let result;

    if (language === "python") result = await runPython(code, stdIn);
    else if (language === "javascript") result = await runJS(code);
    else return res.status(400).json({ error: "Invalid language" });

    res.json(result);
  } catch (err) {
    console.log("COMPILER ERROR: ", err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { compileCode };
