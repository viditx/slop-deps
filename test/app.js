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

// Side effect require
require('express');

// String literal test (must NOT trigger hallucination)
const fakeCode = "import notreal from 'fake-string-pkg'";

console.log("Testing JS edge cases completed");
