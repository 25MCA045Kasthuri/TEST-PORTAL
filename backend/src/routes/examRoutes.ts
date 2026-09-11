import { Router } from 'express';
import { z } from 'zod';
import {
  examStatus,
  startExam,
  getQuestions,
  getAttempt,
  saveAnswer,
  markForReview,
  savePosition,
  recordViolation,
  submitExam,
} from '../controllers/examController';
import { validate } from '../middleware/validate';
import { answerSchema, violationSchema, submitSchema } from '../validators/examValidators';
import { requireCandidate } from '../middleware/auth';

const router = Router();

const reviewSchema = z.object({ questionId: z.string().min(1), marked: z.boolean().optional() });
const positionSchema = z.object({ questionNumber: z.number().int().min(1) });

router.use(requireCandidate);

router.get('/status', examStatus);
router.post('/start', startExam);
router.get('/questions', getQuestions);
router.get('/attempt', getAttempt);
router.put('/answer', validate(answerSchema), saveAnswer);
router.put('/review', validate(reviewSchema), markForReview);
router.put('/position', validate(positionSchema), savePosition);
router.post('/violation', validate(violationSchema), recordViolation);
router.post('/submit', validate(submitSchema), submitExam);

export default router;