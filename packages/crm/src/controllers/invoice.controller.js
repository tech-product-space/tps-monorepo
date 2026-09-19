const invoiceService = require("../services/invoice.service");

exports.listInvoices = async (req, res) => {
  try {
    // Multi-value filters may arrive as a single string or an array.
    const toArray = (v) =>
      v == null || v === "" ? [] : Array.isArray(v) ? v : [v];

    const rows = await invoiceService.listInvoices({
      user: req.user,
      filters: {
        from: req.query.from || null,
        to: req.query.to || null,
        courseId: req.query.course_id || null,
        agentIds: toArray(req.query.agent_id),
        q: req.query.q || null,
      },
    });
    res.json({ rows });
  } catch (error) {
    console.error("List invoices error:", error);
    res.status(500).json({ error: "Failed to load invoices" });
  }
};

exports.listInvoiceCourses = async (req, res) => {
  try {
    const rows = await invoiceService.listInvoiceCourses({ user: req.user });
    res.json({ rows });
  } catch (error) {
    console.error("List invoice courses error:", error);
    res.status(500).json({ error: "Failed to load courses" });
  }
};
