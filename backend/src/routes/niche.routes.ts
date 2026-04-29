import { Router } from 'express';
import * as nicheController from '../controllers/niche.controller.js';
import { authenticate, requirePlan } from '../middleware/auth.middleware.js';

const router = Router();

router.post(
  '/generate/quick',
  authenticate,
  requirePlan('FREE_TRIAL', 'STARTER', 'PRO', 'ELITE', 'MAX'),
  nicheController.generateQuick
);

router.post(
  '/generate/quick-icp',
  authenticate,
  requirePlan('FREE_TRIAL', 'STARTER', 'PRO', 'ELITE', 'MAX'),
  nicheController.generateQuickICP
);

router.post(
  '/generate/wizard',
  authenticate,
  requirePlan('FREE_TRIAL', 'STARTER', 'PRO', 'ELITE', 'MAX'),
  nicheController.generateWizard
);

router.post(
  '/generate/variants',
  authenticate,
  requirePlan('FREE_TRIAL', 'STARTER', 'PRO', 'ELITE', 'MAX'),
  nicheController.generateNicheVariants
);

router.post(
  '/generate/preset-options',
  authenticate,
  requirePlan('FREE_TRIAL', 'STARTER', 'PRO', 'ELITE', 'MAX'),
  nicheController.generatePresetNiches
);

router.post(
  '/preset-selection',
  authenticate,
  requirePlan('FREE_TRIAL', 'STARTER', 'PRO', 'ELITE', 'MAX'),
  nicheController.savePresetNicheSelection
);

router.post(
  '/generate/discover',
  authenticate,
  requirePlan('FREE_TRIAL', 'STARTER', 'PRO', 'ELITE', 'MAX'),
  nicheController.generateDiscover
);

router.post(
  '/generate/icp-day',
  authenticate,
  requirePlan('FREE_TRIAL', 'STARTER', 'PRO', 'ELITE', 'MAX'),
  nicheController.generateICPDay
);

router.post(
  '/translate-profile',
  authenticate,
  requirePlan('FREE_TRIAL', 'STARTER', 'PRO', 'ELITE', 'MAX'),
  nicheController.translateProfile
);

router.post(
  '/reset',
  authenticate,
  requirePlan('FREE_TRIAL', 'STARTER', 'PRO', 'ELITE', 'MAX'),
  nicheController.resetNiche
);

router.post(
  '/content-preferences',
  authenticate,
  requirePlan('FREE_TRIAL', 'STARTER', 'PRO', 'ELITE', 'MAX'),
  nicheController.saveContentPreferences
);

router.get(
  '/content-preferences',
  authenticate,
  requirePlan('FREE_TRIAL', 'STARTER', 'PRO', 'ELITE', 'MAX'),
  nicheController.getContentPreferences
);

export default router;
