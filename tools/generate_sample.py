"""Generate synthetic sample data for the Carrier Scorecard theme.

All carriers, lanes, and figures are fictional. Fixed seed, so the output is
reproducible:  python3 tools/generate_sample.py

Writes:
  data/sample-carrier-shipments.csv  (one row per delivered load)
  data/sample-carrier-tenders.csv    (one row per tender offer, accepted or rejected)
"""
import csv
import random
from datetime import date, timedelta
from pathlib import Path

random.seed(20261109)
OUT = Path(__file__).resolve().parent.parent / "data"
OUT.mkdir(exist_ok=True)

# name: (on-time delivery prob, on-time pickup prob, rate per mile, claim prob, tender accept prob)
CARRIERS = {
    "Ridgeline Freight":      (0.95, 0.96, 2.45, 0.004, 0.92),
    "Blue Heron Transport":   (0.91, 0.93, 2.20, 0.008, 0.85),
    "Pinecrest Logistics":    (0.88, 0.90, 2.05, 0.012, 0.78),
    "Copperline Carriers":    (0.93, 0.95, 2.35, 0.006, 0.88),
    "Lakeshore Express":      (0.84, 0.87, 1.95, 0.015, 0.70),
    "Summit Road Lines":      (0.90, 0.92, 2.15, 0.009, 0.82),
    "Ironwood Trucking":      (0.86, 0.89, 2.00, 0.011, 0.74),
    "Harbor Point Haulers":   (0.92, 0.94, 2.28, 0.007, 0.80),
}
NAMES = list(CARRIERS)

# origin, destination, miles (fictional lane set using real city names; miles are approximate road miles)
LANES = [
    ("Atlanta, GA", "Charlotte, NC", 245), ("Atlanta, GA", "Nashville, TN", 250),
    ("Atlanta, GA", "Jacksonville, FL", 345), ("Birmingham, AL", "Memphis, TN", 240),
    ("Birmingham, AL", "Atlanta, GA", 147), ("Dallas, TX", "Houston, TX", 240),
    ("Dallas, TX", "Atlanta, GA", 780), ("Memphis, TN", "Chicago, IL", 530),
    ("Chicago, IL", "Columbus, OH", 355), ("Columbus, OH", "Pittsburgh, PA", 185),
    ("Nashville, TN", "Louisville, KY", 175), ("Charlotte, NC", "Richmond, VA", 290),
    ("Houston, TX", "New Orleans, LA", 350), ("Jacksonville, FL", "Orlando, FL", 140),
    ("Montgomery, AL", "Mobile, AL", 170),
]
EQUIPMENT = ["Dry Van", "Dry Van", "Dry Van", "Reefer", "Flatbed"]

START = date(2026, 1, 5)
END = date(2026, 10, 30)


def transit_days(miles):
    return max(1, round(miles / 450))


shipments, tenders = [], []
load_no, tender_no = 100000, 500000
d = START
while d <= END:
    if d.weekday() < 5:  # weekdays only
        for _ in range(random.randint(10, 16)):
            load_no += 1
            o, dest, miles = random.choice(LANES)
            miles = round(miles * random.uniform(0.97, 1.05))
            # routing guide: shuffle carriers with mild preference, tender until accepted
            order = sorted(NAMES, key=lambda n: random.random() * (1.2 - CARRIERS[n][4]))
            tender_date = d - timedelta(days=random.randint(1, 3))
            carrier = None
            for n in order:
                tender_no += 1
                accepted = random.random() < CARRIERS[n][4]
                tenders.append({
                    "Tender ID": f"T{tender_no}",
                    "Load Number": f"L{load_no}",
                    "Carrier": n,
                    "Tender Date": tender_date.isoformat(),
                    "Response": "Accepted" if accepted else "Rejected",
                })
                if accepted:
                    carrier = n
                    break
            if carrier is None:  # nobody accepted: load dropped from shipments
                continue
            otd, otp, rpm, claim_p, _ = CARRIERS[carrier]
            sched_pick = d
            act_pick = sched_pick if random.random() < otp else sched_pick + timedelta(days=random.choice([1, 1, 2]))
            sched_del = sched_pick + timedelta(days=transit_days(miles))
            if random.random() < otd:
                act_del = sched_del - timedelta(days=1 if random.random() < 0.08 else 0)
            else:
                act_del = sched_del + timedelta(days=random.choice([1, 1, 1, 2, 2, 3]))
            weight = random.randint(8000, 44000)
            linehaul = miles * rpm * random.uniform(0.92, 1.10)
            fuel = miles * random.uniform(0.38, 0.52)
            cost = round(max(linehaul + fuel, 350), 2)  # minimum charge
            claim = round(random.uniform(150, 4500), 2) if random.random() < claim_p else ""
            shipments.append({
                "PRO #": f"L{load_no}",
                "Carrier Name": carrier,
                "Origin City": o,
                "Dest City": dest,
                "Equipment Type": random.choice(EQUIPMENT),
                "Sched Pickup": sched_pick.strftime("%m/%d/%Y"),
                "Actual Pickup": act_pick.strftime("%m/%d/%Y"),
                "Promised Delivery": sched_del.strftime("%m/%d/%Y"),
                "Delivered On": act_del.strftime("%m/%d/%Y"),
                "Loaded Miles": miles,
                "Weight (lbs)": weight,
                "Freight Charge ($)": f"{cost:,.2f}",
                "Claim Amount": claim,
            })
    d += timedelta(days=1)

for name, rows in (("sample-carrier-shipments.csv", shipments), ("sample-carrier-tenders.csv", tenders)):
    with open(OUT / name, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    print(name, len(rows), "rows")
