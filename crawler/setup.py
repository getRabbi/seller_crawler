from setuptools import find_packages, setup

setup(
    name="seller-intelligence-crawler",
    version="0.1.0",
    packages=find_packages(),
    package_data={"sellerintel": ["py.typed"]},
    entry_points={"scrapy": ["settings = sellerintel.settings"]},
)
