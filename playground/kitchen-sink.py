"""
============================================================================
SLOP-DEPS STRESS-TEST: KITCHEN SINK (Python)
============================================================================
Drop this file into http://localhost:5173 or run:
$ node bin/slop-deps.js playground

Covers:
1. Verified Legit PyPI Giants (Clean)
2. Pure AI Hallucinations (Critical Red Flags)
3. Typosquats & Lookalikes (High Risk)
4. PEP 420 Namespace Distributions (Mapped & Verified)
5. Python Standard Library (Ignored)
6. Relative Module Imports (Ignored)
7. Decoys in Inline Comments & Docstrings (Ignored)
8. Multi-line Backslash Continuations & Inline Semicolons
============================================================================
"""

# ----------------------------------------------------------------------------
# [TIER 1] VERIFIED LEGIT GIANTS (Should be flagged CLEAN / VERIFIED)
# ----------------------------------------------------------------------------
import requests
import fastapi
import numpy as np
import pandas as pd
from pydantic import BaseModel
import django
import httpx
import pytest

# ----------------------------------------------------------------------------
# [TIER 2] CRITICAL: PURE AI HALLUCINATIONS (Does NOT exist on PyPI registry)
# ----------------------------------------------------------------------------
import django_magic_admin               # Classic Copilot / Cursor hallucination
import numpy_fastops                    # Fictional speedup library
import pytorch_quantum_accelerator      # Fictional ML accelerator
from langchain_super_vector_db import VectorStore # Fictional LangChain wrapper

# ----------------------------------------------------------------------------
# [TIER 3] HIGH RISK: TYPOSQUATS & SLOPSQUATS
# ----------------------------------------------------------------------------
import reqeusts                         # Typosquat of 'requests'
import fastapii                         # Typosquat of 'fastapi'

# ----------------------------------------------------------------------------
# [TIER 4] PYTHON PEP 420 NAMESPACE & CANONICAL DISTRIBUTIONS
# ----------------------------------------------------------------------------
import google.cloud.storage
import azure.storage.blob

# ----------------------------------------------------------------------------
# [TIER 5] PYTHON STANDARD LIBRARY (Must be IGNORED completely)
# ----------------------------------------------------------------------------
import sys
import os
import json
import math
import pathlib
from collections import defaultdict
from typing import List, Optional, Dict

# ----------------------------------------------------------------------------
# [TIER 6] RELATIVE IMPORTS (Must be IGNORED completely)
# ----------------------------------------------------------------------------
from . import local_config
from ..internal import db_client
from .models.user import UserProfile

# ----------------------------------------------------------------------------
# [TIER 7] DECOYS IN COMMENTS & DOCSTRINGS (Must NEVER trigger scanner)
# ----------------------------------------------------------------------------
# import hallucinated_in_comment_package
# from fake_comment_module import something

def dummy_function():
    """
    Docstring tutorial text:
    pip install fake_docstring_package_do_not_flag
    import fake_docstring_dep
    """
    sample_code = "import fake_string_literal_code"
    return sample_code

# ----------------------------------------------------------------------------
# [TIER 8] SPLICED BACKSLASHES & INLINE SEMICOLONS
# ----------------------------------------------------------------------------
import sys, \
    os, \
    requests as req

if True: import fastapi; x = 10
