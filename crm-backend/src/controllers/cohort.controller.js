const cohortService = require("../services/cohort.service");

exports.listCohorts = async (req, res) => {
  try {
    const cohorts = await cohortService.listCohorts({
      courseId: req.query.course_id || null,
      includeInactive: req.query.include_inactive === "true",
    });
    res.json({ success: true, data: cohorts });
  } catch (error) {
    console.error("List cohorts error:", error);
    res.status(500).json({ success: false, message: "Failed to load cohorts" });
  }
};

exports.createCohort = async (req, res) => {
  try {
    const { courseId, name, startDate, endDate } = req.body;

    const cohort = await cohortService.createCohort({
      courseId,
      name,
      startDate,
      endDate,
      userId: req.user.id,
    });

    res.status(201).json({ success: true, data: cohort });
  } catch (error) {
    console.error("Create cohort error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to create cohort",
    });
  }
};

exports.updateCohort = async (req, res) => {
  try {
    const { courseId, name, startDate, endDate, isActive } = req.body;

    const cohort = await cohortService.updateCohort({
      id: req.params.id,
      courseId,
      name,
      startDate,
      endDate,
      isActive,
      userId: req.user?.id || null,
    });

    res.json({ success: true, data: cohort });
  } catch (error) {
    console.error("Update cohort error:", error);
    const status = error.message?.includes("not found") ? 404 : 400;
    res.status(status).json({
      success: false,
      message: error.message || "Failed to update cohort",
    });
  }
};

exports.deleteCohort = async (req, res) => {
  try {
    const result = await cohortService.deleteCohort(req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Delete cohort error:", error);
    const status = error.message?.includes("not found") ? 404 : 400;
    res.status(status).json({
      success: false,
      message: error.message || "Failed to delete cohort",
    });
  }
};
