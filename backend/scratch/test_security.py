import os
import sys
import unittest
from unittest.mock import patch, MagicMock

# Adjust system path to import from backend
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Mock Google GenAI client before main/auth are imported to avoid hitting networks or key checks
sys.modules['google'] = MagicMock()
sys.modules['google.genai'] = MagicMock()
sys.modules['google.genai.types'] = MagicMock()

class TestSecurityAndStability(unittest.IsolatedAsyncioTestCase):

    def test_url_input_normalization(self):
        """Verify URL validation auto-prepends protocols and blocks bad schemes."""
        from main import BookmarkSchema

        # Valid input without protocol
        schema = BookmarkSchema(title="Google", url="google.com", category="Tech")
        self.assertEqual(schema.url, "https://google.com")

        # Valid input with protocol
        schema = BookmarkSchema(title="Google", url="http://google.com", category="Tech")
        self.assertEqual(schema.url, "http://google.com")

        # Malformed input
        with self.assertRaises(ValueError):
            BookmarkSchema(title="Bad", url="ftp://google.com")
            
        with self.assertRaises(ValueError):
            BookmarkSchema(title="Empty", url="   ")

    async def test_ssrf_safety_checks(self):
        """Verify private and local loopback domains are correctly detected and blocked."""
        from scraper import is_safe_url

        # Check local loopbacks
        self.assertFalse(await is_safe_url("http://127.0.0.1"))
        self.assertFalse(await is_safe_url("http://localhost:8000"))
        self.assertFalse(await is_safe_url("http://[::1]"))

        # Check private networks
        self.assertFalse(await is_safe_url("http://192.168.1.1"))
        self.assertFalse(await is_safe_url("http://10.0.0.1"))

        # Check public domains (should resolve safely if online, otherwise return False or True depending on DNS)
        with patch("socket.getaddrinfo", return_value=[(None, None, None, None, ("8.8.8.8", 80))]):
            self.assertTrue(await is_safe_url("https://google.com"))

        with patch("socket.getaddrinfo", return_value=[(None, None, None, None, ("127.0.0.1", 80))]):
            self.assertFalse(await is_safe_url("https://malicious-dns-rebinder.com"))

    def test_cors_production_sanitization(self):
        """Verify local loopback entries are scrubbed from CORS allowed origins in production."""
        import importlib
        import main

        # 1. Simulate development mode
        with patch.dict(os.environ, {"ENVIRONMENT": "dev"}):
            importlib.reload(main)
            self.assertIn("http://localhost:3000", main.origins)

        # 2. Simulate production mode
        with patch.dict(os.environ, {"ENVIRONMENT": "production"}):
            importlib.reload(main)
            # Ensure no local loopback origins remain in production allowed list
            for origin in main.origins:
                self.assertNotIn("localhost", origin)
                self.assertNotIn("127.0.0.1", origin)
                self.assertNotIn("[::1]", origin)

    def test_clerk_bypass_lockout_production(self):
        """Verify that bypassing JWT verification in a production environment triggers a crash."""
        import importlib
        
        with patch.dict(os.environ, {"CLERK_BYPASS_VERIFICATION": "true"}):
            import auth

        # Dev mode bypass is okay
        with patch.dict(os.environ, {"ENVIRONMENT": "dev", "CLERK_BYPASS_VERIFICATION": "true"}):
            importlib.reload(auth)

        # Prod mode bypass crashes
        with patch.dict(os.environ, {"ENVIRONMENT": "production", "CLERK_BYPASS_VERIFICATION": "true"}):
            with self.assertRaises(RuntimeError) as context:
                importlib.reload(auth)
            self.assertIn("Security Critical", str(context.exception))

if __name__ == "__main__":
    unittest.main()
