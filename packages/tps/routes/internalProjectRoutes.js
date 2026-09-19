
const express = require('express');
const router = express.Router();
const { literal } = require("sequelize");
const { InternalProject } = require('../models');


router.post("/internal-projects", async (req, res) => {
    try {
        const { id, ...formData } = req.body;

        if (id) {
            const existing = await InternalProject.findByPk(id);
            if (existing) {
                await existing.update({ formData });
                return res.status(200).json({ message: "Project updated", id });
            } else {
                return res.status(404).json({ error: "Project not found" });
            }
        }

        const newProject = await InternalProject.create({ formData });
        res.status(201).json({ message: "Project created", id: newProject.id });

    } catch (err) {
        console.error("❌ InternalProject upsert error:", err);
        res.status(500).json({ error: "Internal error" });
    }
});

router.get("/internal-projects", async (req, res) => {
    try {
        const projects = await InternalProject.findAll({
            attributes: [
                "id",
                [
                    literal(`"InternalProject"."formData"->'projectName'->>'title'`),
                    "projectTitle"
                ],
                [
                    literal(`"InternalProject"."formData"->'projectName'->>'content'`),
                    "projectContent"
                ],
                [
                    literal(`"InternalProject"."formData"->'thumbnailUrl'->>'url'`),
                    "projectThumbnailUrl"
                ]
            ]
        });

        res.json(projects);
    } catch (err) {
        console.error("Error fetching project list:", err);
        res.status(500).json({ error: "Something went wrong" });
    }
});

router.get("/internal-projects/:id", async (req, res) => {
    try {
        const project = await InternalProject.findByPk(req.params.id);
        if (!project) return res.status(404).json({ error: "Not found" });
        res.json(project);
    } catch (err) {
        res.status(500).json({ error: "Something went wrong" });
    }
});

router.delete("/internal-projects/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const project = await InternalProject.findByPk(id);

        if (!project) {
            return res.status(404).json({ error: "Project not found" });
        }

        await project.destroy();
        res.status(200).json({ message: "Project deleted", id });
    } catch (err) {
        console.error("❌ Error deleting project:", err);
        res.status(500).json({ error: "Internal error" });
    }
});

module.exports = router;
