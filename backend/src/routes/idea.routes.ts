import { Router } from 'express';
import * as ideaController from '../controllers/idea.controller.js';
import { authenticate, requirePlan } from '../middleware/auth.middleware.js';

const router = Router();

router.post(
  '/generate',
  authenticate,
  requirePlan('FREE_TRIAL', 'STARTER', 'PRO', 'ELITE', 'MAX'),
  ideaController.generate
);

router.post(
  '/generate/multi-format',
  authenticate,
  requirePlan('FREE_TRIAL', 'STARTER', 'PRO', 'ELITE', 'MAX'),
  ideaController.generateMultiFormat
);

router.post(
  '/regenerate-scene',
  authenticate,
  requirePlan('FREE_TRIAL', 'STARTER', 'PRO', 'ELITE', 'MAX'),
  ideaController.regenerateScene
);
router.post(
  '/regenerate-hook',
  authenticate,
  requirePlan('FREE_TRIAL', 'STARTER', 'PRO', 'ELITE', 'MAX'),
  ideaController.regenerateHook
);

router.post(
  '/structure',
  authenticate,
  requirePlan('FREE_TRIAL', 'STARTER', 'PRO', 'ELITE', 'MAX'),
  ideaController.structure
);

router.post(
  '/translate',
  authenticate,
  requirePlan('FREE_TRIAL', 'STARTER', 'PRO', 'ELITE', 'MAX'),
  ideaController.translate
);

router.get(
  '/history',
  authenticate,
  requirePlan('FREE_TRIAL', 'STARTER', 'PRO', 'ELITE', 'MAX'),
  ideaController.getHistory
);

router.get(
  '/:id',
  authenticate,
  requirePlan('FREE_TRIAL', 'STARTER', 'PRO', 'ELITE', 'MAX'),
  ideaController.getById
);

export default router;
