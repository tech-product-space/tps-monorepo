const { EventEmitter } = require("events");
EventEmitter.defaultMaxListeners = 50;

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const multer = require("multer");
const dotenv = require("dotenv");

// Load env variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

const { sequelize } = require('./models');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const leadRoutes = require('./routes/lead.routes');
const productRoutes = require('./routes/product.route');
const settingRoutes = require('./routes/setting.routes');
const webhookRoutes = require('./routes/webhook.routes');
const publicOnboardingRoutes = require('./routes/publicOnboarding.routes');
const profileRoutes = require('./routes/profile.routes');
const profileSubmissionRoutes = require('./routes/profileSubmissions.routes');
const paymentRoutes = require('./routes/payment.routes');
const emailTemplateRoutes = require("./routes/emailTemplate.routes");
const whatsappTemplateRoutes = require("./routes/whatsappTemplate.routes");
const dashboardRoutes = require('./routes/dashboard.routes');
const reportRoutes = require('./routes/report.routes');
const boardRoutes = require('./routes/boards.routes');
const targetRoutes = require('./routes/target.routes');
const enrollmentRoutes = require('./routes/enrollment.routes');
const invoiceRoutes = require('./routes/invoice.routes');
const cohortRoutes = require('./routes/cohort.routes');
const pushRoutes = require('./routes/push.routes');
const integrationRoutes = require('./routes/integration.routes');
const meetingRoutes = require('./routes/meeting.routes');
const metaRoutes = require('./routes/meta.routes');

const notFound = require("./middlewares/notFound.middleware");
const errorHandler = require("./middlewares/error.middleware");

// Connect to DB via Sequelize will be added here
sequelize
  .authenticate()
  .then(() => console.log("Database connected..."))
  .catch((err) => console.log("Error: " + err));


require("./cron");

app.set('trust proxy', 1);

// Anonymous student-facing onboarding portal.
//
// Mounted BEFORE the global CORS middleware, and that ordering is load-bearing:
// `cors()` answers preflight OPTIONS itself and does not call next(), so a
// request from onboarding.theproductspace.in would be terminated by the CRM's
// allowlist — 204 with no Access-Control-Allow-Origin — and never reach this
// router's own, stricter CORS. From the student's side that looks exactly like
// the API being down.
//
// The router is self-contained: its own CORS, helmet, logging, a 32 kb body
// limit and its own rate limiters, all sized for strangers rather than for
// signed-in staff.
app.use('/api/v1/public/onboarding', publicOnboardingRoutes);

// Middleware
app.use(
  cors({
    origin: [
      "https://crm.theproductspace.in",
      "https://theproductspace.in",
      "https://www.theproductspace.in",
      "https://staging-product-space-ui.vercel.app",
      "https://api.theproductspace.in",
      "http://localhost:5173",
      "http://localhost:4000",
      "https://gradientlearnings.org",
      "https://www.gradientlearnings.org",
      // The student-facing onboarding portal. It also gets its own, stricter
      // CORS inside publicOnboarding.routes.js — this entry only makes the
      // origin reachable at all.
      "https://onboarding.theproductspace.in",
    ],
    credentials: true,
  }),
);

app.use(helmet());
app.use(morgan('tiny'));

// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 1000,
// });

// app.use("/api", limiter);

// Routes
app.use('/api/v1/webhooks', webhookRoutes);

app.set("query parser", "extended");
// Raised limit so base64 logo uploads (business settings) fit in the JSON body.
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/leads', leadRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/settings', settingRoutes);
app.use('/api/v1/profiles', profileRoutes);
app.use('/api/v1/profile-submissions', profileSubmissionRoutes);
app.use('/api/v1/payment', paymentRoutes);
app.use("/api/v1/email-templates", emailTemplateRoutes);
app.use("/api/v1/whatsapp-templates", whatsappTemplateRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/boards', boardRoutes);
app.use('/api/v1/targets', targetRoutes);
app.use('/api/v1/enrollments', enrollmentRoutes);
app.use('/api/v1/invoices', invoiceRoutes);
app.use('/api/v1/cohorts', cohortRoutes);
app.use('/api/v1/push', pushRoutes);
app.use('/api/v1/integrations', integrationRoutes);
app.use('/api/v1/meetings', meetingRoutes);
app.use('/api/v1/meta', metaRoutes);
app.get('/api/v1/settings-health', (req, res) => res.json({ status: 'Settings API Registered' }));

app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date() });
});

app.use(notFound);

// Upload errors. Without this, multer's LIMIT_FILE_SIZE / LIMIT_FILE_COUNT
// reach the generic handler and surface as an opaque 500.
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "That file is too large. Each attachment must be 10 MB or smaller."
        : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE"
          ? "Too many files. Attach at most 5."
          : err.message;

    return res.status(status).json({ success: false, message, code: err.code });
  }
  return next(err);
});

// Global Error Handler
app.use(errorHandler);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal Server Error" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
