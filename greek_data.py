"""
Loads the bundled Ephesians 2 Greek word data (see data/README.md for
source, license, and how it was generated). This is local, static,
real reference data -- not a live API call, and not AI-generated.
"""
import json
import os

_DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "greek_ephesians_2.json")

_data = None


def _load():
    global _data
    if _data is None:
        with open(_DATA_PATH) as f:
            _data = json.load(f)
    return _data


def get_verse_words(verse_number):
    """Real Greek words (in their actual original word order) for a verse
    of Ephesians 2, each with a Strong's number, transliteration, and short
    lexical definition. Returns [] if there's no data for that verse.
    """
    data = _load()
    return data["verses"].get(str(verse_number), [])
