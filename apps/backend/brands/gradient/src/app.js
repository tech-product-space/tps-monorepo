import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import env from "./config/env.js";

import { notFoundMiddleware } from "./middlewares/notFound.middleware.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";

import blogRoutes from "./routes/blog/blog.route.js";
import fileUploadRoutes from "./routes/fileUploadRoutes.js";
import adminRoutes from "./routes/admin/admin.route.js";
import resourceRoutes from "./routes/resource/resource.route.js";
import recordingRoutes from "./routes/recording/recording.routes.js";
import projectRoutes from "./routes/project/project.routes.js";
import userRoutes from "./routes/user/user.routes.js";
import userAuthRoutes from "./routes/user/auth.routes.js";
import eventRoutes from "./routes/event/event.route.js";
import leadRoutes from "./routes/leads/lead.route.js"
import websiteRoutes from "./routes/website/website.routes.js"
import jobsRoutes from "./routes/jobs/jobs.routes.js"
import freeCoursesRoutes from "./routes/freeCourses/freeCourses.routes.js"
import courseRoutes from "./routes/course/course.routes.js"
import subscriberRoutes from "./routes/subscriber/subscriber.route.js"
import activityLogRoutes from "./routes/activityLog/activityLog.routes.js"
import leadEventRoutes from "./routes/leadEvent/leadEvent.route.js";
import workflowRoutes from "./routes/workflow/workflow.route.js";
import campaignRoutes from "./routes/campaign/campaign.routes.js"
import contactRoutes from "./routes/contact/contact.route.js"
import metaRoutes from "./routes/meta/meta.route.js";

import { activityLogger } from "./middlewares/activityLog.middleware.js";

const app = express();

app.use(cookieParser());
app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:4200",
    "https://thegradient.co.in",
    "https://www.thegradient.co.in",
    "https://admin.thegradient.co.in",
    "https://gradientlearnings.org",
    "https://www.gradientlearnings.org",
    "https://admin.gradientlearnings.org",
  ],
  credentials: true,
  // The certificate download returns the file itself, and the browser cannot
  // read the filename off a cross-origin response unless it is exposed here.
  exposedHeaders: ["Content-Disposition"],
  // Free course preview. The public site's client components send the preview
  // session token as a header rather than a cookie, so it never rides along on
  // unrelated requests — but a non-simple header has to be allowed explicitly or
  // the browser's preflight refuses it.
  allowedHeaders: ["Content-Type", "Authorization", "X-Preview-Token"],
}));

app.use(express.json({ limit: "10mb" }));

app.use(morgan("tiny"));

// Audit trail for admin actions. Mounted once, before every router — that single
// line is what gives coverage of all admin write routes without controllers
// having to opt in. Must sit after express.json() so req.body is parsed, and
// before the routers so its res.on("finish") listener is attached in time.
app.use(activityLogger);

app.use("/upload", fileUploadRoutes);
app.use("/blogs", blogRoutes);
app.use("/admins", adminRoutes);
app.use("/resources", resourceRoutes);
app.use("/recordings", recordingRoutes);
app.use("/projects", projectRoutes);
app.use("/user", userRoutes);
app.use("/auth", userAuthRoutes);
app.use("/events", eventRoutes);
app.use("/leads", leadRoutes);
app.use("/website", websiteRoutes);
app.use("/jobs", jobsRoutes);
app.use("/free-courses", freeCoursesRoutes);
app.use("/courses", courseRoutes);
app.use("/subscribers", subscriberRoutes);
app.use("/campaigns", campaignRoutes);
app.use("/contacts", contactRoutes);
app.use("/activity-logs", activityLogRoutes);
app.use("/lead-events", leadEventRoutes);
app.use("/meta", metaRoutes);
app.use("/workflows", workflowRoutes);

// Root route
app.get("/", (req, res) => {
  res.status(200).json({
    message: "The Gradient API is running 🚀",
    environment: env.APP_ENVIRONMENT,
    timestamp: new Date(),
  });
});

// Health check route
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    uptime: process.uptime(),
    timestamp: new Date(),
  });
});

// 404 handler
app.use(notFoundMiddleware);

// error handler
app.use(errorMiddleware);

export default app;
