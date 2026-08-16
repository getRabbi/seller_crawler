from __future__ import annotations

from pathlib import Path

from sellerintel.extractors import extract_contacts

SEED_ROOT = Path(__file__).resolve().parents[2] / "infra" / "staging-seed" / "public"


def test_staging_seed_is_bounded_public_and_non_indexed() -> None:
    required = (
        "index.html",
        "about/index.html",
        "contact/index.html",
        "support/index.html",
        "robots.txt",
        "sitemap.xml",
        "_headers",
    )

    assert all((SEED_ROOT / relative).is_file() for relative in required)
    assert (SEED_ROOT / "robots.txt").read_text(encoding="utf-8") == (
        "User-agent: *\n"
        "Allow: /\n\n"
        "Sitemap: https://seed-stg.scalemyprints.com/sitemap.xml\n"
    )
    headers = (SEED_ROOT / "_headers").read_text(encoding="utf-8")
    assert "X-Robots-Tag: noindex, nofollow" in headers
    assert "frame-ancestors 'none'" in headers


def test_staging_seed_contains_only_expected_synthetic_contacts() -> None:
    markup = (SEED_ROOT / "contact" / "index.html").read_text(encoding="utf-8")
    contacts = extract_contacts(
        markup,
        source_url="https://seed-stg.scalemyprints.com/contact",
        default_region="US",
    )
    values = {(candidate.contact_type, candidate.normalized_value) for candidate in contacts}

    assert ("email", "hello@seed-stg.scalemyprints.com") in values
    assert ("phone", "+12025550100") in values
    assert ("whatsapp", "+12025550100") in values
    assert ("wechat", "scalemyprints_demo") in values
    assert all(candidate.schema_version == 1 for candidate in contacts)
    assert all(candidate.parser_version == "contact-extractor-v1" for candidate in contacts)
