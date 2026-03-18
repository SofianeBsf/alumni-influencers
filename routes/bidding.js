/**
 * Bidding Routes
 */

const express = require('express');
const router = express.Router();
const biddingController = require('../controllers/biddingController');
const { requireLogin } = require('../middleware/auth');
const { validateBid } = require('../middleware/validate');

router.use(requireLogin);

router.get('/',         biddingController.getBiddingPage);
router.post('/place',   validateBid, biddingController.placeBid);
router.post('/update',  validateBid, biddingController.updateBid);
router.get('/history',  biddingController.getBidHistory);

module.exports = router;
