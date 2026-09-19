// ==============================================
// BACK-END  ➜  controllers/playgroundController.js
// ==============================================
exports.runQuery = async (req, res) => {
    const { query } = req.body;
    console.log(query);
    try {
        const result = await req.db.query(query);
        console.log(result);
        // Handle non-SELECT responses (like CREATE, INSERT, etc.)
        if (!result.rows) {
            return res.json({
                message: `${result.command} executed successfully.`,
            });
        }

        return res.json({ rows: result.rows });
    } catch (err) {
        // --- NEW: clear the broken transaction ---
        await req.db.query("ROLLBACK");
        // await req.db.query("BEGIN");     // start clean for the same session
        return res.status(400).json({ error: err.message });
    }
};

exports.endSession = async (req, res) => {
    const { closeSession } = require("../config/connectionManager");
    await closeSession(req.sessionId);
    res.json({ success: true });
};
