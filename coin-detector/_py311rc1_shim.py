"""Compatibility shim for a genuinely unusual environment: the system Python
here is 3.11.0rc1 (an August 2022 pre-release), not a final 3.11.0 release.
sys.set_int_max_str_digits/get_int_max_str_digits were added between rc1 and
the final release, but torch 2.14's dynamo polyfill module assumes any
Python >= 3.11 has them, and crashes on import otherwise.

This only backfills two functions with CPython's own documented default
behavior (4300-digit limit, matching the final 3.11.0 release) — it does not
touch the system Python install, so it's safe to import unconditionally.
Import this before importing ultralytics/torch, every time.
"""

import sys

if not hasattr(sys, "get_int_max_str_digits"):
    sys._int_max_str_digits = 4300

    # torch._dynamo.polyfills.sys validates these against CPython's real
    # signatures via inspect.signature — parameter name and annotation
    # style (string literals, matching how CPython's C-implemented
    # functions report their own signature) both have to match exactly.
    def set_int_max_str_digits(maxdigits: "int") -> "None":
        sys._int_max_str_digits = maxdigits

    def get_int_max_str_digits() -> "int":
        return sys._int_max_str_digits

    sys.set_int_max_str_digits = set_int_max_str_digits
    sys.get_int_max_str_digits = get_int_max_str_digits
