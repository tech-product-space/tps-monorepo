const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth.middleware');
const dashboardController = require('../controllers/dashboard.controller');

router.use(authenticate);

router.get('/overview', dashboardController.getOverview);
router.get('/queue', dashboardController.getQueue);
router.get('/funnel', dashboardController.getFunnel);
router.get('/activity-feed', dashboardController.getActivityFeed);
router.get('/weekly-trend', dashboardController.getWeeklyTrend);
router.get('/leaderboard', dashboardController.getLeaderboard);
router.get('/workload', dashboardController.getWorkload);
router.get('/followups/heatmap', dashboardController.getFollowupHeatmap);
router.get('/unassigned', dashboardController.getUnassignedLeads);
router.get('/timeseries', dashboardController.getTimeseries);
router.get('/product-matrix', dashboardController.getProductMatrix);
router.get('/source-performance', dashboardController.getSourcePerformance);
router.get('/manager-scorecard', dashboardController.getManagerScorecard);
router.get('/manager/:id/view', dashboardController.getManagerView);
router.get('/sla', dashboardController.getSla);
router.get('/sales-cycle', dashboardController.getSalesCycle);
router.get('/time-in-stage', dashboardController.getTimeInStage);
router.get('/aging', dashboardController.getAging);
router.get('/loss-reasons', dashboardController.getLossReasons);
router.get('/forecast', dashboardController.getForecast);
router.get('/alerts', dashboardController.getAlerts);

module.exports = router;
