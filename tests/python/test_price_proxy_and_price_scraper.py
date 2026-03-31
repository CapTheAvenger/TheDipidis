"""Unit tests for backend price proxy and Limitless price scraping logic."""

from unittest.mock import MagicMock, patch

from backend.services import price_proxy_server
from backend.services.price_proxy_server import extract_eur_price_from_html
from backend.scrapers.card_price_scraper import _fetch_limitless


class TestExtractEurPriceFromHtml:
    def test_limitless_extracts_current_row_eur(self):
        html = """
        <table class="card-prints-versions">
          <tr class="current">
            <td><a class="eur" href="https://www.cardmarket.com/pokemon/x">€3.49</a></td>
          </tr>
        </table>
        """
        assert extract_eur_price_from_html(html, "limitless") == "€3.49"

    def test_cardmarket_extracts_from_dd_col(self):
        html = """
        <dl>
          <dd class="col-6">ab €12,90</dd>
        </dl>
        """
        assert extract_eur_price_from_html(html, "cardmarket") == "ab €12,90"

    def test_returns_empty_when_no_price_found(self):
        html = "<html><body><p>No price</p></body></html>"
        assert extract_eur_price_from_html(html, "limitless") == ""


class TestFetchPriceEndpoint:
    def setup_method(self):
        self.client = price_proxy_server.app.test_client()

    def test_missing_url_returns_400(self):
        resp = self.client.get("/fetch-price")
        assert resp.status_code == 400
        assert resp.get_json()["error"] == "Missing url parameter"

    def test_disallowed_host_returns_403(self):
        resp = self.client.get("/fetch-price?url=https://evil.example/x")
        assert resp.status_code == 403
        assert "not allowed" in resp.get_json()["error"]

    def test_invalid_scheme_returns_403(self):
        resp = self.client.get("/fetch-price?url=ftp://limitlesstcg.com/cards/SVI/1")
        assert resp.status_code == 403
        assert "Invalid URL scheme" in resp.get_json()["error"]

    @patch("backend.services.price_proxy_server.requests.get")
    @patch("backend.services.price_proxy_server.time.sleep")
    def test_success_returns_price_and_cardmarket_url(self, mock_sleep, mock_get):
        html = """
        <table class="card-prints-versions">
          <tr class="current">
            <td><a class="eur" href="https://www.cardmarket.com/pokemon/x">€9.99</a></td>
          </tr>
        </table>
        """
        mock_resp = MagicMock()
        mock_resp.text = html
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        resp = self.client.get(
            "/fetch-price?source=limitless&url=https://limitlesstcg.com/cards/SVI/1"
        )

        assert resp.status_code == 200
        payload = resp.get_json()
        assert payload["success"] is True
        assert payload["price"] == "€9.99"
        assert payload["cardmarket_url"] == "https://www.cardmarket.com/pokemon/x"
        mock_sleep.assert_not_called()


class TestFetchLimitless:
    @patch("backend.scrapers.card_price_scraper.std_requests.get")
    def test_strategy_a_current_row(self, mock_get):
        mock_get.return_value.status_code = 200
        mock_get.return_value.text = """
        <table class="card-prints-versions">
          <tr class="current">
            <td><a class="card-price eur">€2.49</a></td>
          </tr>
        </table>
        """
        card = {"name": "Pikachu", "set": "SVI", "number": "25", "card_url": ""}
        out = _fetch_limitless(card)
        assert out["eur_price"] == "€2.49"
        assert out["last_updated"]

    @patch("backend.scrapers.card_price_scraper.std_requests.get")
    def test_strategy_b_link_match(self, mock_get):
        mock_get.return_value.status_code = 200
        mock_get.return_value.text = """
        <table class="card-prints-versions">
          <tr>
            <td><a href="/cards/SVI/25">Pikachu</a></td>
            <td><a class="card-price eur">€3.10</a></td>
          </tr>
        </table>
        """
        card = {"name": "Pikachu", "set": "SVI", "number": "25", "card_url": ""}
        out = _fetch_limitless(card)
        assert out["eur_price"] == "€3.10"

    @patch("backend.scrapers.card_price_scraper.std_requests.get")
    def test_strategy_c_fallback_first_price(self, mock_get):
        mock_get.return_value.status_code = 200
        mock_get.return_value.text = """
        <div>
          <a class="card-price eur">€1.11</a>
        </div>
        """
        card = {"name": "Pikachu", "set": "SVI", "number": "25", "card_url": ""}
        out = _fetch_limitless(card)
        assert out["eur_price"] == "€1.11"

    @patch("backend.scrapers.card_price_scraper.std_requests.get")
    def test_exception_falls_back_to_existing_price(self, mock_get):
        mock_get.side_effect = RuntimeError("boom")
        card = {
            "name": "Pikachu",
            "set": "SVI",
            "number": "25",
            "card_url": "",
            "eur_price": "€4.20",
        }
        out = _fetch_limitless(card)
        assert out["eur_price"] == "€4.20"
