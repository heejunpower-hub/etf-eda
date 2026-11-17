import csv
import re
from datetime import date
from pathlib import Path

from .analysis import EtfSeries, PriceBar

FIELDS = {"code", "name", "date", "close", "volume"}
CODE = re.compile(r"[A-Z0-9]{6}")


def read_prices(path: Path, *, encoding: str = "utf-8-sig") -> list[EtfSeries]:
    """Read a normalized price file, preserving text ticker identifiers."""
    bars_by_code: dict[str, list[PriceBar]] = {}
    latest_names: dict[str, tuple[date, str]] = {}

    with path.open(encoding=encoding, newline="") as file:
        rows = csv.DictReader(file)
        missing = FIELDS.difference(rows.fieldnames or ())
        if missing:
            raise ValueError(f"CSV 필수 열이 없습니다: {', '.join(sorted(missing))}")
        for row in rows:
            try:
                if any(row[field] is None for field in FIELDS) or None in row:
                    raise ValueError("CSV 헤더와 행의 열 개수가 다릅니다.")
                code = row["code"].strip().upper()
                name = row["name"].strip()
                if not CODE.fullmatch(code) or not name:
                    raise ValueError("종목코드는 영문·숫자 6자리, 종목명은 비어 있지 않아야 합니다.")
                date_text = row["date"].strip()
                session = date.fromisoformat(date_text)
                if session.isoformat() != date_text:
                    raise ValueError("거래일은 YYYY-MM-DD로 입력하세요.")
                close = float(row["close"].replace(",", ""))
                volume = int(row["volume"].replace(",", ""))
            except ValueError as error:
                raise ValueError(f"CSV {rows.line_num}행: {error}") from error
            bars_by_code.setdefault(code, []).append(PriceBar(session, close, volume))
            if code not in latest_names or session >= latest_names[code][0]:
                latest_names[code] = (session, name)

    if not bars_by_code:
        raise ValueError("CSV에 시세 행이 없습니다.")
    return [
        EtfSeries(code, latest_names[code][1], bars)
        for code, bars in sorted(bars_by_code.items())
    ]


def select_sessions(
    series: list[EtfSeries], calendar_code: str, end: date, count: int
) -> list[date]:
    if count < 3:
        raise ValueError("비교 거래일 수는 3일 이상이어야 합니다.")
    calendar = next((etf for etf in series if etf.code == calendar_code), None)
    if calendar is None:
        raise ValueError(f"비교 거래일을 정할 기준 종목 {calendar_code}가 입력에 없습니다.")
    sessions = sorted({bar.session for bar in calendar.bars if bar.session <= end})
    if len(sessions) < count:
        raise ValueError(f"기준 종목 {calendar_code}에 필요한 {count}거래일 중 {len(sessions)}일만 있습니다.")
    return sessions[-count:]
