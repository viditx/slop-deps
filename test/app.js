// Regex literal with quotes right before imports (tests that maskStrings does not get blinded!)
const QUOTE_REGEX = /['"]/;

import React from 'react';
import { magicSpring } from 'react-magic-super-spring-hallucinated-xyz-123';
import express from 'express';
export * from 'lodash';

// Multi-line import test
import {
  useState,
  useEffect
} from 'react';

// URL import (should be ignored, not treated as npm pkg)
import three from 'https://cdn.skypack.dev/three';

// Vite / Rollup query params on legit package (should resolve to 'lodash', not 'lodash?raw')
import lodashClone from 'lodash?raw';

// Deno/Bun 'npm:' protocol import
import lodashNpm from 'npm:lodash@^4.17.21';

// SvelteKit virtual modules ($app, $lib, $env)
import { page } from '$app/stores';
import Button from '$lib/Button.svelte';

// TypeScript / jsconfig path aliases
import Header from '@components/Header';
import { format } from '@utils/format';

// Side effect require & require.resolve
require('express');
const expressPath = require.resolve('express');

// Dynamic import.meta.resolve
const reactResolved = import.meta.resolve('react');

// String literal test (must NOT trigger hallucination)
const fakeCode = "import notreal from 'fake-string-pkg'";

console.log("Testing JS edge cases completed");
