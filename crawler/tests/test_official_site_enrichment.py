from __future__ import annotations

from pathlib import Path

from sellerintel.adapters.official_site import (
    build_official_site_crawl_plan,
    canonicalize_official_url,
    enrich_official_page,
    is_allowed_official_url,
)
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
        "https://acme-industrial.testmail/about",
        "https://acme-industrial.testmail/about-us",
        "https://acme-industrial.testmail/contact",
        "https://acme-industrial.testmail/contact-us",
        "https://acme-industrial.testmail/support",
        "https://acme-industrial.testmail/wholesale",
        "https://acme-industrial.testmail/distributor",
        "https://acme-industrial.testmail/privacy",
        "https://acme-industrial.testmail/terms",
        "https://acme-industrial.testmail/wholesale/exports",
        "https://acme-industrial.testmail/company/export-sales",
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
    assert contacts[("email", "sales@acme-industrial.testmail")].confidence >= 80
    assert contacts[("phone", "+14155552671")].confidence >= 80
    assert contacts[("whatsapp", "+14155552672")].confidence >= 80
    assert contacts[("wechat", "acmeexport_88")].confidence >= 80


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
