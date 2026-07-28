from __future__ import annotations

from sellerintel.config.features import assert_startup_gates


def main() -> int:
    assert_startup_gates()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
