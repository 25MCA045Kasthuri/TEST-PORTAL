import { Router } from 'express';
import multer from 'multer';
import { ApiError } from '../utils/ApiError';
import { isValidExcelUpload } from '../utils/excelUpload';
import {
  dashboard,
  listCandidates,
  createCandidate,
  importCandidates,
  getCandidate,
  updateCandidate,
  resetCandidatePassword,
  deleteCandidate,
  resetCandidateList,
  listQuestions,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  importQuestions,
  resetQuestionList,
  listResults,
  exportResults,
  resetResultList,
  listMalpractice,
  updateMalpractice,
  resetMalpracticeList,
  getSettingsHandler,
  updateSettingsHandler,
  liveStatus,
} from '../controllers/adminController';
import { validate } from '../middleware/validate';
import { requireAdmin } from '../middleware/auth';
import {
  createCandidateSchema,
  updateCandidateSchema,
  createQuestionSchema,
  updateQuestionSchema,
  settingsSchema,
  malpracticeUpdateSchema,
} from '../validators/adminValidators';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!isValidExcelUpload(file)) {
      cb(ApiError.badRequest('Please upload a valid Excel file (.xlsx or .xls).'));
      return;
    }
    cb(null, true);
  },
});

router.use(requireAdmin);

router.get('/dashboard', dashboard);

router.get('/candidates', listCandidates);
router.post('/candidates', validate(createCandidateSchema), createCandidate);
router.post('/candidates/import', upload.single('file'), importCandidates);
router.delete('/candidates/reset', resetCandidateList);
router.get('/candidates/:id', getCandidate);
router.put('/candidates/:id', validate(updateCandidateSchema), updateCandidate);
router.post('/candidates/:id/reset-password', resetCandidatePassword);
router.delete('/candidates/:id', deleteCandidate);

router.get('/questions', listQuestions);
router.post('/questions', validate(createQuestionSchema), createQuestion);
router.post('/questions/import', upload.single('file'), importQuestions);
router.delete('/questions/reset', resetQuestionList);
router.put('/questions/:id', validate(updateQuestionSchema), updateQuestion);
router.delete('/questions/:id', deleteQuestion);

router.get('/results', listResults);
router.get('/results/export', exportResults);
router.delete('/results/reset', resetResultList);

router.get('/malpractice', listMalpractice);
router.delete('/malpractice/reset', resetMalpracticeList);
router.put('/malpractice/:attemptId', validate(malpracticeUpdateSchema), updateMalpractice);

router.get('/settings', getSettingsHandler);
router.put('/settings', validate(settingsSchema), updateSettingsHandler);

router.get('/live', liveStatus);

export default router;