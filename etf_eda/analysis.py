from dataclasses import dataclass
from datetime import date
from math import isfinite, sqrt
from statistics import stdev
from typing import Iterable, Sequence


TRADING_DAYS_PER_YEAR = 252


@dataclass(frozen=True, slots=True)
class PriceBar:
    session: date
    close: float
    volume: int


@dataclass(frozen=True, slots=True)
class EtfSeries:
    code: str
    name: str
    bars: Sequence[PriceBar]


@dataclass(frozen=True, slots=True)
class EtfMetrics:
    code: str
    name: str
    total_volume: int
    average_volume: float
    period_return: float
    annualized_volatility: float


@dataclass(frozen=True, slots=True)
class Exclusion:
    code: str
    name: str
    reason: str


@dataclass(frozen=True, slots=True)
class AnalysisResult:
    sessions: tuple[date, ...]
    metrics: tuple[EtfMetrics, ...]
    exclusions: tuple[Exclusion, ...]


def analyze(series: Iterable[EtfSeries], sessions: Sequence[date]) -> AnalysisResult:
    """Compare ETFs on identical sessions without filling missing market data."""
    ordered_sessions = tuple(sessions)
    session_set = set(ordered_sessions)
    if len(ordered_sessions) < 3 or tuple(sorted(session_set)) != ordered_sessions:
        raise ValueError("비교 기간은 서로 다른 거래일 3일 이상을 날짜순으로 포함해야 합니다.")

    metrics = []
    exclusions = []
    seen_codes = set()

    for etf in series:
        if etf.code in seen_codes:
            raise ValueError(f"비교 목록에 종목코드 {etf.code}가 중복되었습니다.")
        seen_codes.add(etf.code)

        period_bars = [bar for bar in etf.bars if bar.session in session_set]
        by_session = {bar.session: bar for bar in period_bars}
        if len(by_session) != len(period_bars):
            exclusions.append(Exclusion(etf.code, etf.name, "비교 기간에 중복 시세가 있습니다."))
            continue

        missing = len(ordered_sessions) - len(by_session)
        if missing:
            reason = f"비교 기간 {len(ordered_sessions)}거래일 중 {missing}일의 시세가 없습니다."
            exclusions.append(Exclusion(etf.code, etf.name, reason))
            continue

        bars = [by_session[session] for session in ordered_sessions]
        if any(not isfinite(bar.close) or bar.close <= 0 or bar.volume < 0 for bar in bars):
            exclusions.append(Exclusion(etf.code, etf.name, "비교 기간에 유효하지 않은 종가 또는 거래량이 있습니다."))
            continue

        closes = [bar.close for bar in bars]
        daily_returns = [current / previous - 1 for previous, current in zip(closes, closes[1:])]
        total_volume = sum(bar.volume for bar in bars)
        metrics.append(
            EtfMetrics(
                code=etf.code,
                name=etf.name,
                total_volume=total_volume,
                average_volume=total_volume / len(ordered_sessions),
                period_return=closes[-1] / closes[0] - 1,
                annualized_volatility=stdev(daily_returns) * sqrt(TRADING_DAYS_PER_YEAR),
            )
        )

    metrics.sort(key=lambda etf: (-etf.average_volume, etf.code))
    return AnalysisResult(ordered_sessions, tuple(metrics), tuple(exclusions))
