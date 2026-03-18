/**
 * Admin Routes
 * All routes require admin role.
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { requireAdmin } = require('../middleware/auth');
const { validateApiClient } = require('../middleware/validate');

router.use(requireAdmin);

router.get('/',                       adminController.getDashboard);
router.get('/clients',                adminController.getClients);
router.post('/clients/create',        validateApiClient, adminController.createClient);
router.post('/clients/:id/revoke',    adminController.revokeClient);
router.post('/clients/:id/activate',  adminController.activateClient);
router.get('/stats',                  adminController.getStats);
router.get('/logs',                   adminController.getLogs);
router.post('/events/record',         adminController.recordEventAttendance);

module.exports = router;
