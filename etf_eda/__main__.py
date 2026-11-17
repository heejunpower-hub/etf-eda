import argparse
import csv
from datetime import date
from pathlib import Path

from .analysis import analyze
from .csv_input import read_prices, select_sessions
from .demo import demo_prices
from .report import render_report, write_exclusions_csv, write_metrics_csv


def main() -> None:
    parser = argparse.ArgumentParser(description="같은 거래일의 국내 ETF 거래량·수익률·변동성 비교")
    input_group = parser.add_mutually_exclusive_group(required=True)
    input_group.add_argument("--input", type=Path, help="이용 허락을 받은 시세 CSV")
    input_group.add_argument("--demo", action="store_true", help="합성 데이터로 실행")
    parser.add_argument("--calendar-code", help="거래일 목록으로 사용할 기준 ETF 종목코드")
    parser.add_argument("--end", type=date.fromisoformat, help="마감이 확인된 기준일 (YYYY-MM-DD)")
    parser.add_argument("--sessions", type=int, default=60, help="비교 거래일 수 (기본 60)")
    parser.add_argument("--encoding", choices=["utf-8-sig", "cp949"], default="utf-8-sig")
    parser.add_argument("--source", help="시세 제공처와 종목 선정 기준을 설명하는 한 문장")
    parser.add_argument("--price-basis", help="종가의 수정 여부와 분배금 반영 기준")
    parser.add_argument("--output-dir", type=Path, default=Path("output"))
    args = parser.parse_args()

    if args.sessions < 3:
        parser.error("--sessions는 3 이상이어야 합니다.")
    if args.demo and any((args.calendar_code, args.end, args.source, args.price_basis)):
        parser.error("--demo 실행에서는 시세 CSV용 인자를 지정하지 마세요.")

    try:
        if args.demo:
            series = demo_prices(args.sessions)
            sessions = [bar.session for bar in series[0].bars]
            title = "국내 ETF 비교 실행 예제 (합성 데이터)"
            selection = "가상의 종목과 평일 날짜를 생성해 계산·비교·결측 처리를 검증했습니다."
            price_basis = "이 예제에는 실제 가격과 분배금이 없습니다."
            source = "데모 코드에서 생성한 합성 데이터"
        else:
            if not args.calendar_code or not args.end or not args.source or not args.price_basis:
                parser.error("--input 실행에는 --calendar-code, --end, --source, --price-basis가 필요합니다.")
            code = args.calendar_code.strip().upper()
            series = read_prices(args.input, encoding=args.encoding)
            sessions = select_sessions(series, code, args.end, args.sessions)
            title = "국내 ETF 거래량·수익률·변동성 비교"
            selection = f"입력 CSV에 포함된 종목을 기준 종목 `{code}`의 거래일에 맞춰 비교했습니다."
            price_basis = args.price_basis
            source = args.source

        result = analyze(series, sessions)
        if not result.metrics:
            reasons = ", ".join(f"{etf.code}: {etf.reason}" for etf in result.exclusions)
            raise ValueError(f"비교 기간의 유효 시세를 모두 갖춘 종목이 없습니다. {reasons}")

        report = render_report(
            result, title=title, selection=selection, source=source, price_basis=price_basis
        )
        args.output_dir.mkdir(parents=True, exist_ok=True)
        (args.output_dir / "report.md").write_text(report, encoding="utf-8", newline="\n")
        write_metrics_csv(args.output_dir / "metrics.csv", result)
        write_exclusions_csv(args.output_dir / "exclusions.csv", result)
    except (ValueError, OSError, csv.Error) as error:
        parser.exit(1, f"분석 실패: {error}\n")

    print(f"{len(result.metrics)}종목 비교, {len(result.exclusions)}종목 제외 → {args.output_dir}")


if __name__ == "__main__":
    main()
