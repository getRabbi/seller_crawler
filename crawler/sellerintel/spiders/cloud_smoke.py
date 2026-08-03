from __future__ import annotations

import scrapy
from scrapy.http import Response


class SoloNoNetworkSmokeSpider(scrapy.Spider):
    name = "solo_no_network_smoke"
    start_urls = ["data:text/html,%3Ctitle%3ESolo%20v1%20smoke%3C/title%3E"]
    custom_settings = {
        "COOKIES_ENABLED": False,
        "DOWNLOAD_TIMEOUT": 5,
        "RETRY_ENABLED": False,
        "ROBOTSTXT_OBEY": False,
        "TELNETCONSOLE_ENABLED": False,
    }

    def parse(self, response: Response, **_kwargs: object) -> dict[str, object]:
        return {
            "smoke": "ok",
            "network": "none",
            "units": 1,
            "title": response.css("title::text").get(),
        }
