"""Scrapers de sourcing — adaptados del beta ScrapingAT."""
from scrapers.xray import buscar_xray
from scrapers.elempleo import buscar_elempleo
from scrapers.linkedin import buscar_linkedin

__all__ = ["buscar_xray", "buscar_elempleo", "buscar_linkedin"]
