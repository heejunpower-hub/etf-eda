from datetime import date, timedelta

from .analysis import EtfSeries, PriceBar


def demo_prices(count: int) -> list[EtfSeries]:
    """Generate reproducible fictional prices and volumes for a CLI example."""
    sessions = []
    day = date(2026, 1, 5)
    while len(sessions) < count:
        if day.weekday() < 5:
            sessions.append(day)
        day += timedelta(days=1)

    return [
        EtfSeries("DEMO01", "가상 ETF A", [
            PriceBar(day, 10000 + i * 20 + 45 * (i % 3 - 1), 22000 + 900 * (i % 5))
            for i, day in enumerate(sessions)
        ]),
        EtfSeries("DEMO02", "가상 ETF B", [
            PriceBar(day, 11000 + i * 35 + 220 * (i % 3 - 1), 11000 + 600 * (i % 5))
            for i, day in enumerate(sessions)
        ]),
        EtfSeries("DEMO03", "가상 ETF C", [
            PriceBar(day, 10000 - i * 12 + 30 * (i % 3 - 1), 4000 + 100 * (i % 5))
            for i, day in enumerate(sessions)
        ]),
        EtfSeries("DEMO04", "가상 ETF D", [
            PriceBar(day, 10000 + i, 3000) for i, day in enumerate(sessions[1:])
        ]),
    ]
