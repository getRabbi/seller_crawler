from __future__ import annotations

from pathlib import Path

from sellerintel.extractors import (
    extract_contact_forms,
    extract_contacts,
    extract_emails,
    extract_phone_numbers,
    extract_wechat_contacts,
    extract_whatsapp_contacts,
)
from sellerintel.extractors.common import context_window, parse_contact_document
from sellerintel.extractors.email import mask_email, normalize_email
from sellerintel.extractors.models import review_status_for
from sellerintel.extractors.phone import mask_phone, normalize_phone
from sellerintel.extractors.wechat import mask_wechat_id, normalize_wechat_id

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "extractors"


def fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def test_extracts_official_contact_page_candidates_with_masked_context() -> None:
    markup = fixture("official_contact.html")
    source_url = "https://acme-industrial.testmail/contact-us"

    candidates = extract_contacts(markup, source_url=source_url, default_region="US")
    by_type = {
        (candidate.contact_type, candidate.normalized_value): candidate for candidate in candidates
    }

    assert ("email", "sales@acme-industrial.testmail") in by_type
    assert ("email", "export@acme-industrial.testmail") in by_type
    assert ("phone", "+14155552671") in by_type
    assert ("whatsapp", "+14155552672") in by_type
    assert ("wechat", "acmeexport_88") in by_type

    sales = by_type[("email", "sales@acme-industrial.testmail")]
    assert sales.schema_version == 1
    assert sales.parser_version == "contact-extractor-v1"
    assert sales.review_status == "accepted"
    assert sales.confidence >= 80
    assert sales.display_value_masked == "sa***@acme-industrial.testmail"
    assert "sales@acme-industrial.testmail" not in sales.evidence_context


def test_extracts_multilingual_contact_labels_and_e164_numbers() -> None:
    markup = fixture("multilingual_contact.html")
    source_url = "https://fabricante-ejemplo.testmail/contacto"

    emails = extract_emails(markup, source_url=source_url)
    phones = extract_phone_numbers(markup, source_url=source_url, default_region="CN")
    whatsapp = extract_whatsapp_contacts(markup, source_url=source_url, default_region="CN")
    wechat = extract_wechat_contacts(markup, source_url=source_url)

    assert [candidate.normalized_value for candidate in emails] == [
        "ventas@fabricante-ejemplo.testmail"
    ]
    assert [candidate.normalized_value for candidate in phones] == ["+861065000000"]
    assert [candidate.normalized_value for candidate in whatsapp] == ["+8613800138000"]
    assert [candidate.normalized_value for candidate in wechat] == ["shenzhenbiz2026"]
    assert all(
        candidate.review_status == "accepted"
        for candidate in [*emails, *phones, *whatsapp, *wechat]
    )


def test_verified_wholesale_page_corroborates_labeled_free_mail_and_phone() -> None:
    markup = """
    <main>
      <h1>Dealer and wholesale inquiries</h1>
      <p>Email: fixture-supplier@outlook.com</p>
      <p>Phone: +86 138 0013 8000</p>
    </main>
    """
    source_url = "https://supplier.example.testmail/pages/dealer-wholesale"

    candidates = extract_contacts(markup, source_url=source_url)
    by_type = {candidate.contact_type: candidate for candidate in candidates}

    assert set(by_type) == {"email", "phone"}
    assert by_type["email"].review_status == "accepted"
    assert by_type["email"].confidence >= 80
    assert all(
        component.code != "free_mail_domain"
        for component in by_type["email"].confidence_components
    )
    assert by_type["phone"].review_status == "accepted"


def test_rejects_false_positive_directory_and_qr_only_fixture() -> None:
    markup = fixture("false_positive_directory.html")
    source_url = "https://directory.example.invalid/profile/jane-doe"

    assert extract_contacts(markup, source_url=source_url, default_region="US") == []


def test_extracts_only_an_actionable_public_contact_form() -> None:
    markup = """
    <main>
      <h1>Contact our business team</h1>
      <form action="/apps/contact" id="business-contact">
        <input type="email" name="contact[email]">
        <input type="tel" name="contact[phone]">
        <textarea name="contact[message]"></textarea>
        <button type="submit">Send</button>
      </form>
    </main>
    """

    candidates = extract_contact_forms(
        markup,
        source_url="https://www.example.testmail/pages/contact-us?source=footer",
    )

    assert len(candidates) == 1
    candidate = candidates[0]
    assert candidate.contact_type == "contact_form"
    assert candidate.normalized_value == "https://example.testmail/pages/contact-us"
    assert candidate.display_value_masked == "example.testmail/…/contact-us"
    assert candidate.classification == "business_public_contact_form"
    assert candidate.confidence == 100
    assert candidate.parser_version == "contact-form-extractor-v1"
    assert candidate.review_status == "accepted"


def test_rejects_newsletter_login_and_non_contact_page_forms() -> None:
    newsletter = """
    <form action="/newsletter/subscribe">
      <input type="email" name="email">
      <textarea name="message"></textarea>
      <button>Subscribe</button>
    </form>
    """
    login = """
    <form action="/account/login">
      <input type="email" name="email">
      <input type="password" name="password">
      <textarea name="message"></textarea>
      <button>Sign in</button>
    </form>
    """
    valid_shape = """
    <form><input type="email"><textarea></textarea><button>Send</button></form>
    """

    assert extract_contact_forms(
        newsletter,
        source_url="https://example.testmail/contact-us",
    ) == []
    assert extract_contact_forms(
        login,
        source_url="https://example.testmail/contact-us",
    ) == []
    assert extract_contact_forms(
        valid_shape,
        source_url="https://example.testmail/products/widget",
    ) == []


def test_html_document_parsing_keeps_json_ld_and_skips_hidden_noise() -> None:
    document = parse_contact_document(
        """
        <style>.hidden { color: red }</style>
        <script>ignored@example.testmail</script>
        <script type="application/ld+json">
          {"email": "sales@structured.testmail"}
        </script>
        <a href="mailto:export@structured.testmail" title="Email export team">Export</a>
        """
    )

    assert "ignored@example.testmail" not in document.text
    assert "sales@structured.testmail" in document.text
    assert "Email export team" in document.text
    assert document.links == ("mailto:export@structured.testmail",)
    assert context_window("Sales email sales@example.testmail", "missing") == ""
    masked_context = context_window(
        "Sales email sales@example.testmail",
        "sales@example.testmail",
        mask="x",
    )
    assert masked_context == "Sales email x"


def test_normalizers_and_maskers_are_deterministic() -> None:
    assert normalize_email(" Sales@Example-Mail.TESTMAIL ") == "sales@example-mail.testmail"
    assert mask_email("sales@example-mail.testmail") == "sa***@example-mail.testmail"
    assert normalize_phone("(415) 555-2671", default_region="US") == "+14155552671"
    assert normalize_phone("12345", default_region="US") is None
    assert normalize_phone("not-a-phone", default_region="US") is None
    assert mask_phone("+14155552671") == "+*******2671"
    assert mask_phone("+123") == "+***"
    assert normalize_wechat_id("AcmeExport_88") == "acmeexport_88"
    assert normalize_wechat_id("wechat") is None
    assert normalize_wechat_id("bad") is None
    assert mask_wechat_id("abcd") == "a***"
    assert review_status_for(54) is None
