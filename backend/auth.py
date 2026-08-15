import hashlib
import os
from datetime import datetime, timezone

import jwt
from jwt import PyJWKClient
from fastapi import Depends, Header, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database import get_db
from models.api_key import ApiKey

# auto_error=False: extension requests authenticate via X-API-Key instead of
# a Bearer token, so a missing Authorization header must not short-circuit here.
security = HTTPBearer(auto_error=False)

CLERK_PEM_PUBLIC_KEY = os.getenv("CLERK_PEM_PUBLIC_KEY")
CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL")
CLERK_BYPASS_VERIFICATION = os.getenv("CLERK_BYPASS_VERIFICATION", "false").lower() == "true"

ENVIRONMENT = (os.getenv("ENVIRONMENT", "") or os.getenv("ENV", "")).lower()
is_production = ENVIRONMENT.startswith("prod")

if CLERK_BYPASS_VERIFICATION and is_production:
    raise RuntimeError(
        "Security Critical: JWT verification bypass is enabled while ENVIRONMENT is set to 'production'!"
    )

# Cache the PyJWKClient instance to prevent fetching JWKS on every request
jwk_client = None
if CLERK_JWKS_URL:
    jwk_client = PyJWKClient(CLERK_JWKS_URL)

if not CLERK_PEM_PUBLIC_KEY and not CLERK_JWKS_URL:
    if CLERK_BYPASS_VERIFICATION:
        print("[WARNING] JWT signature verification is bypassed! Do not use this in production.")
    else:
        raise RuntimeError(
            "Missing auth configuration (CLERK_PEM_PUBLIC_KEY or CLERK_JWKS_URL). "
            "Set CLERK_BYPASS_VERIFICATION=true in your .env for local offline development."
        )


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()


def _verify_clerk_jwt(token: str) -> str:
    try:
        if CLERK_BYPASS_VERIFICATION:
            # Mode C: Fallback local development bypass (signature not verified)
            decoded = jwt.decode(token, options={"verify_signature": False})
        elif CLERK_PEM_PUBLIC_KEY:
            # Mode A: High-performance, offline signature verification using the PEM key
            pem_key = CLERK_PEM_PUBLIC_KEY.strip()
            if not pem_key.startswith("-----BEGIN PUBLIC KEY-----"):
                # Format to multi-line PEM format standard if raw string is provided
                pem_key = f"-----BEGIN PUBLIC KEY-----\n{pem_key}\n-----END PUBLIC KEY-----"

            decoded = jwt.decode(
                token,
                pem_key,
                algorithms=["RS256"],
                options={"verify_aud": False}
            )
        elif jwk_client:
            # Mode B: Dynamic verification fetching and caching Clerk's JWKS keys
            signing_key = jwk_client.get_signing_key_from_jwt(token)
            decoded = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                options={"verify_aud": False}
            )
        else:
            raise RuntimeError("JWT signature verification is required but key config is missing.")

        user_id = decoded.get("sub")
        if not user_id:
            raise ValueError("Token missing subject (sub)")
        return user_id
    except Exception as e:
        raise HTTPException(
            status_code=401,
            detail=f"Invalid authentication credentials: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(security),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    db: Session = Depends(get_db),
) -> str:
    # Personal API keys (browser extension, scripts): resolved to the same
    # user_id scoping used for Clerk-authenticated web app requests.
    if x_api_key:
        key_hash = hash_api_key(x_api_key)
        api_key = db.query(ApiKey).filter(ApiKey.key_hash == key_hash).first()
        if not api_key:
            raise HTTPException(status_code=401, detail="Invalid API key")
        api_key.last_used_at = datetime.now(timezone.utc)
        db.commit()
        return api_key.user_id

    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Missing authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return _verify_clerk_jwt(credentials.credentials)
