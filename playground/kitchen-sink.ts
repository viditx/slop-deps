/**
 * ============================================================================
 * SLOP-DEPS STRESS-TEST: KITCHEN SINK (TypeScript / JavaScript)
 * ============================================================================
 * Drop this file into http://localhost:5173 or run:
 * $ node bin/slop-deps.js playground/kitchen-sink.ts
 *
 * This file contains EVERY category of import slop-deps is tested against:
 * 1. Verified Legit Giants (Clean)
 * 2. Pure AI Hallucinations (Critical Red Flags)
 * 3. Typosquats & Slopsquats (High Risk / Suspicious)
 * 4. Legitimate Subpaths & Scoped Packages (Clean)
 * 5. Node Built-ins & Protocols (Ignored)
 * 6. Local & Relative Paths (Ignored)
 * 7. HTTP / URL Specifiers (Ignored)
 * 8. Decoys in Single-line & Multi-line Comments (Ignored)
 * 9. Decoys inside JSX & Tutorial Text (Ignored)
 * 10. Dynamic Imports (Clean vs Hallucinated)
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// [TIER 1] VERIFIED LEGIT GIANTS (Should be flagged CLEAN / VERIFIED)
// ----------------------------------------------------------------------------
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import express from 'express';
import lodash from 'lodash';
import chalk from 'chalk';
import { z } from 'zod';
import { createServer } from 'vite';

// ----------------------------------------------------------------------------
// [TIER 2] CRITICAL: PURE AI HALLUCINATIONS (Does NOT exist on npm registry)
// ----------------------------------------------------------------------------
import { authGuard } from 'express-auth-middleware-pro';          // Classic hallucinated middleware
import { domBooster } from 'react-super-fast-dom-optimizer';       // Hallucinated optimizer
import { validatePrompt } from 'ai-sdk-validator';                 // Hallucinated AI validation lib
import { autoHeal } from 'cursor-copilot-auto-healer';             // Hallucinated IDE utility
import { quantumLink } from 'deepmind-antigravity-neural-bridge';  // Fictional package

// ----------------------------------------------------------------------------
// [TIER 3] HIGH RISK: TYPOSQUATS & SLOPSQUATS (Lookalikes of top packages)
// ----------------------------------------------------------------------------
import ax0s from 'ax0s';                                          // Distance 1 lookalike of 'axios'
import lodaeh from 'lodaeh';                                      // Typosquat of 'lodash'
import chlak from 'chlak';                                        // Typosquat of 'chalk'

// ----------------------------------------------------------------------------
// [TIER 4] LEGITIMATE SUBPATHS & SCOPED PACKAGES (Should be clean)
// ----------------------------------------------------------------------------
import lodashFp from 'lodash/fp';
import enUS from 'date-fns/locale/en-US';
import type { IncomingMessage } from '@types/node';
import { QueryClient } from '@tanstack/react-query';

// ----------------------------------------------------------------------------
// [TIER 5] NODE.JS BUILT-INS & PROTOCOLS (Must be IGNORED completely)
// ----------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'crypto';
import http from 'http';
import { pipeline } from 'node:stream/promises';

// ----------------------------------------------------------------------------
// [TIER 6] LOCAL RELATIVE PATHS (Must be IGNORED completely)
// ----------------------------------------------------------------------------
import { localHelper } from './utils/helper';
import { SharedButton } from '../components/SharedButton';
import absoluteConfig from '/etc/app/config';

// ----------------------------------------------------------------------------
// [TIER 7] HTTP / URL SPECIFIERS (Must be IGNORED completely)
// ----------------------------------------------------------------------------
import confetti from 'https://esm.sh/canvas-confetti@1.9.3';
import localModule from 'http://localhost:3000/assets/bundle.js';

// ----------------------------------------------------------------------------
// [TIER 8] DECOYS IN COMMENTS (Scanner parser must NEVER trigger on these)
// ----------------------------------------------------------------------------
// import fakePackageInComment from 'hallucinated-comment-package-1';
// require('another-fake-comment-package');

/*
 * Multi-line block comment decoy:
 * import evilStealthPackage from 'stealth-malware-hallucinated-lib';
 * import { boom } from 'do-not-flag-me-in-comments';
 */

// ----------------------------------------------------------------------------
// [TIER 9] DECOYS IN JSX & STRING TUTORIALS (Parser must stay isolated)
// ----------------------------------------------------------------------------
export function TutorialSnippet() {
  const codeSample = "Run: npm install fake-tutorial-library-do-not-flag";
  return (
    <div className="tutorial-container">
      <p>Install with: import sample from "fake-jsx-doc-sample";</p>
      <code>{codeSample}</code>
    </div>
  );
}

// ----------------------------------------------------------------------------
// [TIER 10] DYNAMIC IMPORTS (Clean vs Hallucinated)
// ----------------------------------------------------------------------------
export async function loadPlugins(feature: string) {
  // Legit dynamic import
  const { default: debug } = await import('debug');

  // Hallucinated dynamic import
  const { evilHelper } = await import('node-package-validator');

  return { debug, evilHelper };
}
