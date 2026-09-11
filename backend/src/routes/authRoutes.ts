import { Router } from 'express';
import { candidateLogin, adminLogin, logout, me } from '../controllers/authController';
import { validate } from '../middleware/validate';
import { candidateLoginSchema, adminLoginSchema } from '../validators/authValidators';
import { requireAuth } from '../middleware/auth';
import { candidateLoginLimiter } from '../middleware/rateLimit';

const router = Router();

router.post('/candidate/login', candidateLoginLimiter, validate(candidateLoginSchema), candidateLogin);
router.post('/admin/login', validate(adminLoginSchema), adminLogin);
router.post('/logout', logout);
router.get('/me', requireAuth, me);

export default router;