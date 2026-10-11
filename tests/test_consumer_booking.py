from fnmatch import fnmatchcase
from html.parser import HTMLParser
from pathlib import Path
import re
import subprocess


ROOT = Path(__file__).resolve().parents[1]
BOOKING = ROOT / 'inspectie-boeken'


def test_consumer_booking_behavior():
    result = subprocess.run(
        ['node', '--test', 'tests/vve-inquiry.test.mjs', 'tests/consumer-booking.test.mjs', 'tests/consumer-acquisition.test.mjs',
         'tests/consumer-booking-ui.test.mjs', 'tests/consumer-travel-pricing.test.mjs',
         'tests/consumer-scheduling.test.mjs', 'tests/consumer-payment.test.mjs', 'tests/consumer-admin.test.mjs', 'tests/consumer-dates.test.mjs', 'tests/consumer-google-adapter.test.mjs', 'tests/consumer-access.test.mjs'],
        cwd=ROOT, capture_output=True, text=True, timeout=60,
    )
    assert result.returncode == 0, result.stdout + result.stderr


class BookingMarkup(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_booking_form = False
        self.controls = []
        self.elements = {}
        self.meta = {}

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if attrs.get('id'):
            self.elements[attrs['id']] = attrs
        if tag == 'meta' and attrs.get('name'):
            self.meta[attrs['name']] = attrs.get('content', '')
        if tag == 'form' and attrs.get('id') == 'booking-form':
            self.in_booking_form = True
        if self.in_booking_form and tag in {'input', 'textarea', 'select'}:
            self.controls.append(attrs)

    def handle_endtag(self, tag):
        if tag == 'form':
            self.in_booking_form = False


def test_consumer_booking_starts_disabled_until_javascript_guards_are_attached():
    markup = BookingMarkup()
    markup.feed((BOOKING / 'index.html').read_text(encoding='utf-8'))
    assert markup.controls, 'The booking form must contain its input controls'
    assert all('disabled' in control for control in markup.controls), (
        'Until JavaScript attaches submit guards, no customer fields may be enabled'
    )
    for identifier in ('check-address', 'checkout-button'):
        assert 'disabled' in markup.elements[identifier], identifier
    assert 'index' in re.split(r'[,\s]+', markup.meta['robots'].lower())


def test_consumer_route_and_assets_are_not_captured_by_legacy_work_area_redirects():
    rules = []
    for line in (ROOT / '_redirects').read_text(encoding='utf-8').splitlines():
        parts = line.split()
        if parts and not parts[0].startswith('#') and len(parts) >= 2:
            rules.append(parts)
    for path in ('/inspectie-boeken', '/inspectie-boeken/', '/inspectie-boeken/index.html',
                 '/inspectie-boeken/booking-config.js', '/inspectie-boeken/booking.js',
                 '/inspectie-boeken/booking-core.mjs', '/inspectie-boeken/booking.css'):
        # Redirect files apply the first matching rule. A specific exception
        # or removal of the broad legacy rule are both acceptable solutions.
        rule = next((rule for rule in rules if fnmatchcase(path, rule[0])), None)
        assert rule is None or not rule[1].startswith('/werkgebied'), (path, rule)


def test_consumer_browser_files_do_not_embed_payment_or_service_credentials():
    for path in BOOKING.iterdir():
        if path.suffix not in {'.html', '.js', '.mjs', '.css'}:
            continue
        text = path.read_text(encoding='utf-8')
        assert not re.search(r'\b(?:live|test)_[A-Za-z0-9]{20,}\b', text), path.name
        assert not re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', text), path.name
        assert not re.search(
            r'(?:MOLLIE_API_KEY|SUPABASE_SERVICE_ROLE_KEY)\s*[:=]\s*[\'"][^\'"]+', text,
        ), path.name
