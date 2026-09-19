const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
// ROUTES
const userAuth = require("./routes/userAuthRoutes");
const companyAuth = require("./routes/companyAuthRoutes")
const blogRoutes = require("./routes/blogRoutes")
const jobRoutes = require("./routes/jobRoutes");
const quizRoutes = require("./routes/quizRoutes");
const fileUploadRoutes = require("./routes/fileUploadRoutes");
const userResultRoutes = require('./routes/userResultRoutes');
const userProfileRoutes = require('./routes/userProfileRoutes');
const fitmentRoutes = require('./routes/fitmentRoutes');
const referralRoutes = require('./routes/referralRoutes');
const eventRoutes = require('./routes/eventRoutes');
const referralStatsRoutes = require('./routes/referralStatsRoutes');
const emailRoutes = require('./routes/emailRoutes');
const workExperienceRoutes = require('./routes/workExperienceRoutes')
const educationRoutes = require('./routes/educationRoutes');
const portfolioProjectsRoutes = require('./routes/portfolioProjectsRoutes');
const achievementRoutes = require('./routes/achievementRoutes');
const personalInfoRoutes = require('./routes/personalInfoRoutes');
const userRoutes = require('./routes/userRoutes');
const memberRoutes = require('./routes/memberRoutes')
const jobApplicationRoutes = require('./routes/jobApplicationRoutes')
const internalProjectRoutes = require('./routes/internalProjectRoutes')
const resourceRoutes = require("./routes/resourceRoutes");
const recordingRoutes = require("./routes/recordingRoutes");
const newsletterRoutes = require('./routes/newsletterRoutes');
const aiProductRoutes = require('./routes/aiProductRoutes');


const programOfferRoutes = require("./routes/programOfferRoutes");
const compilerRoutes = require("./routes/compilerRoutes");

const platformLeadRoutes = require("./routes/platformLeadRoutes");
const userAppTokenRoutes = require("./routes/userAppTokenRoutes");
const visitorRoutes = require("./routes/visitorRoutes");
const serviceRoutes = require("./routes/serviceRoutes");
const otpRoutes = require("./routes/otpRoutes");
const cohortMemberRoutes = require("./routes/cohortMemberRoutes");
const coursesRoutes = require("./routes/courseRoutes");
const courseTagsRoutes = require("./routes/courseRoutes/tagRoutes");
const integrationRoutes = require("./routes/integrationRoutes");
const externalLeadRoutes = require("./routes/externalLeadRoutes");
const campaignRoutes = require("./routes/campaignRoutes");
const contactRoutes = require("./routes/contactRoutes");
const emailUnSubscribeRoutes = require("./routes/emailUnsubscribeRoute");
const weebhookRoutes = require("./routes/webhookRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const workflowRoutes = require("./routes/workflowRoutes");
const workflowGlobalSettingsRoutes = require("./routes/workflowGlobalSettingsRoutes");
const enrollmentRoutes = require("./routes/enrollmentRoutes");
const leadConsentRoutes = require("./routes/leadConsentRoutes");
const trackingRoutes = require("./routes/trackingRoutes");
const sesWebhookRoutes = require("./routes/sesWebhookRoutes");
const supportRoutes = require("./routes/supportRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const expenseFormRoutes = require("./routes/expenseFormRoutes");
const sesAnalyticsRoutes = require("./routes/sesAnalyticsRoutes");


// MongoDB routes
const interviewRoutes = require('./routes/interviewRoutes');

// error Routes
const notFound = require("./middlewares/notFound");
const errorHandler = require("./middlewares/errorHandler");

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' })); 
app.use(express.text({ type: ['text/plain', 'text/html'] }));
app.use(morgan("tiny"));

app.get("/", (req, res) => {
    res.send("Hello, World!");
});
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/user", userAuth);
app.use("/company", companyAuth)
app.use("/blogs", blogRoutes);
app.use("/jobs", jobRoutes);
app.use("/quiz", quizRoutes);
app.use("/upload", fileUploadRoutes);
app.use('/quiz-result', userResultRoutes);
app.use('/profile', userProfileRoutes);
app.use('/fitment', fitmentRoutes);
app.use('', referralRoutes);
app.use('', eventRoutes);
app.use('/referral-stats', referralStatsRoutes);
app.use('/email', emailRoutes);
app.use('/work-experiences', workExperienceRoutes);
app.use('/educations', educationRoutes);
app.use('/portfolio-projects', portfolioProjectsRoutes);
app.use('/achievements', achievementRoutes);
app.use('/personal-info', personalInfoRoutes);
app.use('/api', userRoutes);
app.use('/members', memberRoutes);
app.use('/job-applications', jobApplicationRoutes);
app.use('/projects', internalProjectRoutes);
app.use('/resources', resourceRoutes);
app.use('/recordings', recordingRoutes);

app.use("/program-offers", programOfferRoutes);
app.use('/newsletter', newsletterRoutes);
app.use('/ai-products', aiProductRoutes);

app.use("/tokens", userAppTokenRoutes);


app.use("/leads", platformLeadRoutes);
app.use("/leads/external", externalLeadRoutes);

app.use('/interview', interviewRoutes);
app.use('/compiler', compilerRoutes)
app.use('/visitor', visitorRoutes)
app.use('/service', serviceRoutes)
app.use('/otp', otpRoutes)
app.use('/cohort-members', cohortMemberRoutes)
app.use('/courses', coursesRoutes)
app.use('/course-tags', courseTagsRoutes)
app.use('/integrations', integrationRoutes)
app.use('/campaigns', campaignRoutes)
app.use('/contacts', contactRoutes);
app.use("/unsubscribe" , emailUnSubscribeRoutes)
app.use("/webhook" , weebhookRoutes)
app.use("/booking" , bookingRoutes)
app.use("/api/v1/workflows", workflowRoutes)
app.use("/api/v1/workflow-global-settings", workflowGlobalSettingsRoutes)
app.use("/api/v1/enrollments", enrollmentRoutes)
app.use("/api/v1/leads", leadConsentRoutes)
app.use("/api/v1", trackingRoutes)
app.use("/api/v1/webhooks", sesWebhookRoutes)
app.use("/support", supportRoutes)
app.use("/expenses", expenseRoutes)
app.use("/expense-forms", expenseFormRoutes)
app.use("/api/v1/ses-analytics", sesAnalyticsRoutes)

app.use(notFound);
app.use(errorHandler);


// Exported so it can run standalone (server.js) or be mounted under /tps by the
// monorepo gateway. No DB connection, cron/jobs or listen() happens on import.
module.exports = app;
