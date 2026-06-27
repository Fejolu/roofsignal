# RoofSignal Lead Engine

Purpose: produce a small daily list of evidence-based inspection opportunities.

The engine ranks leads from structured signal rows. It is intentionally conservative:

- no gated-platform scraping;
- no unverifiable black-box scores;
- every score includes reasons and warnings;
- every lead should be verified before outreach.

## Run

```bash
python3 tools/roofsignal_lead_engine.py
```

Default input:

```text
data/leads/roofsignal_leads.csv
```

Outputs:

```text
results/leads/latest_roofsignal_leads.md
results/leads/latest_roofsignal_leads.json
results/leads/latest_roofsignal_leads.csv
```

## Input

Create a blank template:

```bash
python3 tools/roofsignal_lead_engine.py --write-template data/leads/roofsignal_leads.csv
```

Useful sources to manually or programmatically convert into rows:

- VvE and vastgoedbeheer websites.
- Portfolio pages.
- BAG/open building registry fields.
- Municipal open data.
- Permit announcements.
- Public procurement notices.
- Weather/storm/hail/heavy-rain events.
- Google Maps or Street View observations, used carefully and verified manually.
- Company websites and public contact pages.

## Scoring

The score follows `docs/property-intelligence-engine.md`:

- portfolio fit;
- building risk;
- event urgency;
- visible evidence;
- budget likelihood;
- decision-maker accessibility;
- repeat potential;
- data value;
- conversion probability;
- confidence.

Treat the score as a prioritisation aid, not as truth.

## Daily Workflow

1. Add or refresh candidate rows in `data/leads/roofsignal_leads.csv`.
2. Run the engine.
3. Review the Markdown report.
4. Keep only leads where the evidence is clear within 30 seconds.
5. Verify source data before any outreach.

## Object Enrichment MVP

For object-level opportunities, run:

```bash
python3 tools/roofsignal_object_enricher.py --bootstrap-from-leads
```

To also scan public lead websites for address/postcode patterns:

```bash
python3 tools/roofsignal_object_enricher.py --bootstrap-from-leads --discover-from-web --merge-existing
```

For the current local RoofSignal wedge, filter to the first target cities:

```bash
python3 tools/roofsignal_object_enricher.py --cities Apeldoorn,Deventer,Zutphen
```

This creates or refreshes:

```text
data/leads/roofsignal_object_candidates.csv
results/leads/latest_roofsignal_object_opportunities.md
results/leads/latest_roofsignal_object_opportunities.json
results/leads/latest_roofsignal_object_opportunities.csv
```

The first bootstrap uses manager office addresses as proof of pipeline. The
web-discovery mode may find office/contact addresses or public object addresses.
Treat all discovered addresses as candidates until verified. Replace or extend
the candidate CSV with confirmed managed-object addresses to get true inspection
leads.

The enricher currently uses:

- PDOK Locatieserver for address resolution.
- PDOK BAG OGC API for nearby BAG `pand` attributes such as `bouwjaar`,
  `gebruiksdoel`, status and number of `verblijfsobjecten`.
