import express from 'express';
import { listOrders, listPayments } from '../controllers/admin/adminCommerceController.js';
import { verifySiteRequest } from '../middlewares/siteSignature.js';

/**
 * Read-only feed for the antarikshtv.com wp-admin ("LMS Orders" screen).
 * Same data as Admin > Orders / Payments, authorised by an HMAC signature
 * instead of an admin login (see middlewares/siteSignature.js).
 */
const router = express.Router();

router.use(verifySiteRequest);
router.get('/orders', listOrders);
router.get('/payments', listPayments);

export default router;
