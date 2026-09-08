"""VAPID key management for Web Push notifications.

VAPID (Voluntary Application Server Identification) keys are used to
identify the application server to the push service. The private key
signs the JWT sent with each push request. The public key is sent to the
browser when subscribing.

Keys are generated on first use and stored in the database (Settings table)
or a file. For development, they are generated on demand and cached.
"""

import os
import json
import logging
from pathlib import Path
from py_vapid import Vapid01 as Vapid

logger = logging.getLogger(__name__)

# Store VAPID keys in a file outside the repo (not in git)
VAPID_KEYS_FILE = Path(os.environ.get("VAPID_KEYS_FILE", ".vapid_keys.json"))
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:admin@engineering-tracker.local")


def generate_vapid_keys():
    """Generate a new VAPID key pair and save to file."""
    vapid = Vapid()
    vapid.generate_keys()
    keys = {
        "public_key": vapid.public_key,
        "private_key": vapid.private_key,
    }
    try:
        VAPID_KEYS_FILE.write_text(json.dumps(keys))
        logger.info("Generated and saved VAPID keys to %s", VAPID_KEYS_FILE)
    except Exception as e:
        logger.warning("Could not save VAPID keys to file: %s", e)
    return keys


def get_vapid_keys():
    """Load VAPID keys from env vars, file, or generate if not present.

    Priority: VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY env vars > file > generate.
    Env vars are the preferred method for Docker/production deployments.
    """
    # 1. Check environment variables (Docker/production)
    env_public = os.environ.get("VAPID_PUBLIC_KEY")
    env_private = os.environ.get("VAPID_PRIVATE_KEY")
    if env_public and env_private:
        return {"public_key": env_public, "private_key": env_private}

    # 2. Check file
    try:
        if VAPID_KEYS_FILE.exists():
            keys = json.loads(VAPID_KEYS_FILE.read_text())
            if keys.get("public_key") and keys.get("private_key"):
                return keys
    except Exception as e:
        logger.warning("Could not load VAPID keys from file: %s", e)

    # 3. Generate new keys
    return generate_vapid_keys()


def get_public_key():
    """Return the VAPID public key as a base64url string for the browser."""
    keys = get_vapid_keys()
    return keys["public_key"]


def get_private_key():
    """Return the VAPID private key for signing push requests."""
    keys = get_vapid_keys()
    return keys["private_key"]
