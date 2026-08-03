from __future__ import annotations

from sellerintel.normalization import (
    canonicalize_domain,
    deterministic_hash,
    mask_address,
    nfkc,
    normalize_address,
    normalize_company_name,
    normalize_country_code,
    normalize_phone,
    normalize_search_text,
)


def test_company_name_normalization_handles_nfkc_punctuation_and_english_suffixes() -> None:
    assert nfkc("ＡＣＭＥ") == "ACME"

    normalized = normalize_company_name("  ACME Industrial Co., Ltd.  ")

    assert normalized.nfkc == "ACME Industrial Co., Ltd."
    assert normalized.normalized == "acme industrial"
    assert normalized.suffix_removed == "co ltd"


def test_company_name_normalization_handles_chinese_suffixes() -> None:
    normalized = normalize_company_name(
        "\uff33\uff48\uff45\uff4e\uff5a\uff48\uff45\uff4e "
        "\u4f18\u54c1\u79d1\u6280\u6709\u9650\u516c\u53f8"
    )

    assert normalized.nfkc == "Shenzhen \u4f18\u54c1\u79d1\u6280\u6709\u9650\u516c\u53f8"
    assert normalized.normalized == "shenzhen \u4f18\u54c1\u79d1\u6280"
    assert normalized.suffix_removed == "\u6709\u9650\u516c\u53f8"


def test_search_text_removes_punctuation_and_collapses_whitespace() -> None:
    assert normalize_search_text(" ACME--Industrial,  OEM/ODM! ") == "acme industrial oem odm"


def test_domain_canonicalization_handles_urls_ports_www_and_idna() -> None:
    assert canonicalize_domain("HTTPS://www.Example.COM:443/contact") == "example.com"
    assert canonicalize_domain("www.xn--fsqu00a.xn--0zwm56d") == "xn--fsqu00a.xn--0zwm56d"
    assert canonicalize_domain("localhost") is None
    assert canonicalize_domain("bad..example.com") is None


def test_country_normalization_keeps_mainland_hk_macau_and_taiwan_distinct() -> None:
    assert normalize_country_code("People's Republic of China") == "CN"
    assert normalize_country_code("Hong Kong SAR") == "HK"
    assert normalize_country_code("Macau") == "MO"
    assert normalize_country_code("Taiwan") == "TW"
    assert normalize_country_code("United States") == "US"
    assert normalize_country_code("") is None


def test_phone_normalization_reuses_e164_rules() -> None:
    assert normalize_phone("+86 10 6500 0000", default_region="CN") == "+861065000000"


def test_deterministic_hashes_are_namespace_scoped() -> None:
    first = deterministic_hash("sales@example.testmail", namespace="email")
    second = deterministic_hash("sales@example.testmail", namespace="email")
    other_namespace = deterministic_hash("sales@example.testmail", namespace="phone")

    assert first == second
    assert first != other_namespace
    assert len(first) == 64


def test_address_normalization_and_masking() -> None:
    address = "Building 5, 88 Longhua Road, Shenzhen, Guangdong, China"

    assert normalize_address("Building 5\n88 Longhua Road") == "Building 5, 88 Longhua Road"
    assert mask_address(address) == "***, Shenzhen, Guangdong, China"
    inline_masked = mask_address("88 Longhua Road Shenzhen Guangdong China")
    assert inline_masked == "*** Shenzhen Guangdong China"
