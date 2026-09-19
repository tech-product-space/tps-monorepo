import express from "express";
import { getHomePageData } from "../../controllers/website/homepage.controller.js";

const router = express.Router();

//BASE URL -> /website

router.get("/home", getHomePageData);

export default router;
