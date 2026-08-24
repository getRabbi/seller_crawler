from __future__ import annotations

from pathlib import Path

from sellerintel.adapters.official_site import (
    build_official_site_crawl_plan,
    canonicalize_official_url,
    contact_records_for_page,
    deterministic_uuidv7,
    enrich_official_page,
    is_allowed_official_url,
)
from sellerintel.security.contact_crypto import ContactCipher
from sellerintel.spool.checksums import sha256_hex

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "extractors"


def fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def test_builds_same_domain_budgeted_crawl_plan_from_html_and_sitemap() -> None:
    html = """
    <a href="/contact-us?ref=nav#team">Contact</a>
    <a href="https://evil.test/contact">Off domain</a>
    <a href="/login">Account</a>
    <a href="/products/widget">Product</a>
    <a href="/wholesale/exports">Wholesale exports</a>
    """
    sitemap = """
    <urlset>
      <url><loc>https://www.acme-industrial.testmail/company/export-sales</loc></url>
      <url><loc>https://evil.test/contact</loc></url>
      <url><loc>https://www.acme-industrial.testmail/cart</loc></url>
    </urlset>
    """

    plan = build_official_site_crawl_plan(
        "https://www.acme-industrial.testmail/",
        html=html,
        sitemap_text=sitemap,
        page_budget=12,
    )

    assert plan.seed_url == "https://acme-industrial.testmail/"
    assert plan.source_domain == "acme-industrial.testmail"
    assert plan.page_budget == 12
    assert plan.urls == (
        "https://acme-industrial.testmail/",
        "https://acme-industrial.testmail/contact-us",
        "https://acme-industrial.testmail/wholesale/exports",
        "https://acme-industrial.testmail/company/export-sales",
        "https://acme-industrial.testmail/about",
        "https://acme-industrial.testmail/about-us",
        "https://acme-industrial.testmail/contact",
        "https://acme-industrial.testmail/support",
        "https://acme-industrial.testmail/wholesale",
        "https://acme-industrial.testmail/distributor",
        "https://acme-industrial.testmail/privacy",
        "https://acme-industrial.testmail/terms",
    )


def test_prioritizes_discovered_shopify_contact_path_before_guessed_fallbacks() -> None:
    plan = build_official_site_crawl_plan(
        "https://shop.example/",
        html='<a href="/pages/contact">Contact</a><a href="/pages/dealer-wholesale">Wholesale</a>',
        page_budget=3,
    )

    assert plan.urls == (
        "https://shop.example/",
        "https://shop.example/pages/contact",
        "https://shop.example/pages/dealer-wholesale",
    )


def test_canonicalize_official_url_strips_query_fragment_port_and_www() -> None:
    assert (
        canonicalize_official_url("HTTPS://www.Example.COM:443/contact/?x=1#team")
        == "https://example.com/contact"
    )
    assert canonicalize_official_url("mailto:sales@example.com") is None


def test_enrich_official_page_hashes_evidence_and_extracts_contacts() -> None:
    html = fixture("official_contact.html")

    enrichment = enrich_official_page(
        html,
        page_url="https://www.acme-industrial.testmail/contact-us?utm=1",
        default_region="US",
    )

    content_hash = sha256_hex(html.encode())
    contacts = {
        (candidate.contact_type, candidate.normalized_value): candidate
        for candidate in enrichment.contacts
    }

    assert enrichment.canonical_url == "https://acme-industrial.testmail/contact-us"
    assert enrichment.source_domain == "acme-industrial.testmail"
    assert enrichment.content_hash == content_hash
    assert enrichment.evidence.object_key is None
    assert enrichment.evidence.upload_status == "compact_d1_only"
    assert enrichment.page_title == "Acme Industrial Export Sales"
    assert enrichment.evidence_snippet
    assert "sales@acme-industrial.testmail" not in enrichment.evidence_snippet
    assert "+14155552671" not in enrichment.evidence_snippet
    assert "AcmeExport_88" not in enrichment.evidence_snippet
    assert "wa.me/141555" not in enrichment.evidence_snippet
    assert "wa.me/+*******2672" in enrichment.evidence_snippet
    assert "WeChat ID: ac***88" in enrichment.evidence_snippet
    assert contacts[("email", "sales@acme-industrial.testmail")].confidence >= 80
    assert contacts[("phone", "+14155552671")].confidence >= 80
    assert contacts[("whatsapp", "+14155552672")].confidence >= 80
    assert contacts[("wechat", "acmeexport_88")].confidence >= 80


def test_contact_record_creation_honors_operator_selected_types() -> None:
    enrichment = enrich_official_page(
        fixture("official_contact.html"),
        page_url="https://acme-industrial.testmail/contact-us",
        default_region="US",
    )
    records = contact_records_for_page(
        enrichment,
        seller_id="018f2d5e-7b3c-7a1d-8f2e-123456789abc",
        source_id=deterministic_uuidv7("source-url", enrichment.canonical_url),
        contact_cipher=ContactCipher.for_fixture_tests(),
        allowed_contact_types={"email", "whatsapp"},
    )

    assert {record.contact_type for record in records} == {"email", "whatsapp"}


def test_contact_form_record_is_versioned_encrypted_and_separately_typed() -> None:
    enrichment = enrich_official_page(
        """
        <title>Contact Example</title>
        <form action="/contact">
          <input type="email" name="email">
          <textarea name="message"></textarea>
          <button type="submit">Send inquiry</button>
        </form>
        """,
        page_url="https://example.testmail/contact-us",
    )
    records = contact_records_for_page(
        enrichment,
        seller_id="018f2d5e-7b3c-7a1d-8f2e-123456789abc",
        source_id=deterministic_uuidv7("source-url", enrichment.canonical_url),
        contact_cipher=ContactCipher.for_fixture_tests(),
        allowed_contact_types={"contact_form"},
    )

    assert len(records) == 1
    record = records[0]
    assert record.contact_type == "contact_form"
    assert record.parser_version == "contact-form-extractor-v1"
    assert record.schema_version == 1
    assert record.contact_value_ciphertext.startswith("si-aesgcm:v1:fixture-v1:")
    assert record.display_value_masked == "example.testmail/contact-us"
    assert record.outreach_eligible is False


def test_disallows_blocked_paths_and_non_sitemap_business_pages() -> None:
    assert is_allowed_official_url("https://example.com/login") is False
    assert is_allowed_official_url("https://example.com/products/widget") is False
    assert is_allowed_official_url("https://example.com/company/export-sales") is False
    assert (
        is_allowed_official_url(
            "https://example.com/company/export-sales",
            sitemap_discovered=True,
        )
        is True
    )
