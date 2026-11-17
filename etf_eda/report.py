import csv
from html import escape
from pathlib import Path

from .analysis import AnalysisResult, TRADING_DAYS_PER_YEAR


def write_metrics_csv(path: Path, result: AnalysisResult) -> None:
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file, lineterminator="\n")
        writer.writerow(
            (
                "code", "name", "start_date", "end_date", "sessions",
                "total_volume_shares", "average_daily_volume_shares",
                "period_return_pct", "annualized_volatility_pct",
            )
        )
        for etf in result.metrics:
            writer.writerow(
                (
                    etf.code, etf.name, result.sessions[0].isoformat(), result.sessions[-1].isoformat(),
                    len(result.sessions), etf.total_volume,
                    f"{etf.average_volume:.6f}", f"{etf.period_return * 100:.6f}",
                    f"{etf.annualized_volatility * 100:.6f}",
                )
            )


def write_exclusions_csv(path: Path, result: AnalysisResult) -> None:
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file, lineterminator="\n")
        writer.writerow(("code", "name", "reason"))
        writer.writerows((etf.code, etf.name, etf.reason) for etf in result.exclusions)


def _table_text(text: str) -> str:
    return escape(" ".join(text.splitlines()), quote=False).replace("|", "&#124;").replace("`", "&#96;")


def render_report(
    result: AnalysisResult,
    *,
    title: str,
    selection: str,
    source: str,
    price_basis: str,
) -> str:
    rows = result.metrics
    sessions = result.sessions
    lines = [
        f"# {title}",
        "",
        selection,
        "",
        f"{sessions[0].isoformat()}부터 {sessions[-1].isoformat()}까지 {len(sessions)}거래일을 비교했습니다. "
        f"선정한 {len(rows) + len(result.exclusions):,}종목 중 같은 기간의 시세가 모두 있는 "
        f"{len(rows):,}종목을 분석했습니다.",
        "",
    ]

    if rows:
        most_traded = rows[0]
        best_return = min(rows, key=lambda etf: (-etf.period_return, etf.code))
        lowest_return = min(rows, key=lambda etf: (etf.period_return, etf.code))
        highest_volatility = min(rows, key=lambda etf: (-etf.annualized_volatility, etf.code))
        lowest_volatility = min(rows, key=lambda etf: (etf.annualized_volatility, etf.code))
        lines += [
            f"- 일평균 거래량이 가장 높았던 종목은 {_table_text(most_traded.name)} "
            f"(`{most_traded.code}`, {most_traded.average_volume:,.0f}주)입니다.",
            f"- 기간 수익률은 {_table_text(lowest_return.name)} (`{lowest_return.code}`, "
            f"{lowest_return.period_return:+.2%})에서 {_table_text(best_return.name)} "
            f"(`{best_return.code}`, {best_return.period_return:+.2%})까지였습니다.",
            f"- 연환산 변동성은 {_table_text(lowest_volatility.name)} (`{lowest_volatility.code}`, "
            f"{lowest_volatility.annualized_volatility:.2%})에서 "
            f"{_table_text(highest_volatility.name)} (`{highest_volatility.code}`, "
            f"{highest_volatility.annualized_volatility:.2%})까지였습니다.",
            "",
            "## 종목별 비교",
            "",
            "표는 일평균 거래량이 많은 순서입니다.",
            "",
            "| 종목코드 | ETF | 일평균 거래량(주) | 기간 수익률 | 연환산 변동성 |",
            "| --- | --- | ---: | ---: | ---: |",
        ]
        lines += [
            f"| `{etf.code}` | {_table_text(etf.name)} | {etf.average_volume:,.0f} | "
            f"{etf.period_return:+.2%} | {etf.annualized_volatility:.2%} |"
            for etf in rows
        ]
        lines.append("")

    if result.exclusions:
        lines += [
            "## 비교에서 제외한 종목",
            "",
            "| 종목코드 | ETF | 사유 |",
            "| --- | --- | --- |",
        ]
        lines += [
            f"| `{etf.code}` | {_table_text(etf.name)} | {_table_text(etf.reason)} |"
            for etf in result.exclusions
        ]
        lines.append("")

    lines += [
        "## 계산 방법",
        "",
        "- 일평균 거래량은 비교 기간 거래량을 합한 뒤 거래일 수로 나눴습니다.",
        "- 기간 수익률은 마지막 날 종가를 첫날 종가로 나눈 뒤 1을 뺐습니다. " + _table_text(price_basis),
        f"- 연환산 변동성은 {len(sessions) - 1}개 일별 단순 수익률의 표본 표준편차에 "
        f"√{TRADING_DAYS_PER_YEAR}를 곱했습니다.",
        "- 비교 기간에 빠진 거래일이 있는 종목은 제외했습니다.",
        "",
        "## 데이터 출처",
        "",
        _table_text(source),
    ]
    return "\n".join(lines) + "\n"
