# 국내 ETF 분석

국내 상장 ETF의 일별 종가와 거래량을 같은 거래일에 맞춰 비교합니다. 일평균 거래량, 기간 가격 수익률, 연환산 변동성을 계산합니다.

## 데이터 출처

[네이버페이 증권의 이용 안내](https://help.pay.naver.com/faq/content.help?faqId=17106)는 시세의 가공과 재배포를 제한합니다. [금융위원회 증권상품시세정보](https://www.data.go.kr/data/15094806/openapi.do) 역시 제3자 제공을 제한하며, [한국거래소 ETF 일별매매정보 API](https://openapi.krx.co.kr/contents/OPP/INFO/OPPINFO004.cmd)는 [승인된 인증키](https://openapi.krx.co.kr/contents/OPP/INFO/OPPINFO003.jsp)가 필요합니다.

이 저장소에는 실제 시세를 사용한 결과 대신 [합성 데이터 실행 예제](examples/demo-report.md)가 있습니다. 실제 분석에는 해당 용도의 이용이 허용된 일별 시세 CSV가 필요합니다. 결과를 공개할 때에는 자료 제공처의 공개 범위를 따르세요.

## 실행

Python 3.10 이상에서 표준 라이브러리로 실행합니다. Windows PowerShell에서 다음 명령으로 예제를 실행할 수 있습니다.

```powershell
python -m venv .uv
./.uv/Scripts/python.exe -m etf_eda --demo
```

실제 시세 CSV의 필수 열은 `code,name,date,close,volume`입니다. `code`는 0으로 시작하는 코드도 보존해 영문·숫자 6자리로, `date`는 `YYYY-MM-DD`로 입력합니다. `close`와 `volume`의 단위는 각각 원과 주입니다. 기본 인코딩은 UTF-8이고, CP949 파일에는 `--encoding cp949`를 지정할 수 있습니다.

```powershell
./.uv/Scripts/python.exe -m etf_eda --input data/etf_prices.csv --calendar-code 069500 --end 2026-11-16 --sessions 60 --source "제공처 및 종목 선정 기준" --price-basis "수정 여부 및 분배금 반영 기준"
```

날짜와 기준 코드는 입력 자료에 맞게 바꾸세요. 기준 ETF는 비교 기간의 거래일이 빠짐없이 들어 있는 종목으로 지정합니다. 프로그램은 기준일 이하의 최근 거래일을 선택하고, 같은 날짜의 시세를 모두 갖춘 종목만 비교합니다. 누락된 시세를 보간하지 않습니다.

| 파일 | 내용 |
| --- | --- |
| `output/report.md` | 지표별 요약, 종목 비교표, 계산 기준 |
| `output/metrics.csv` | 종목별 총·일평균 거래량, 기간 수익률, 연환산 변동성 |
| `output/exclusions.csv` | 비교에서 제외한 종목과 사유 |

일평균 거래량은 기간 거래량을 거래일 수로 나눈 값입니다. 기간 가격 수익률은 마지막 종가를 첫 종가로 나눈 뒤 1을 뺀 값입니다. 연환산 변동성은 일별 단순 수익률의 표본 표준편차에 `√252`를 곱합니다. 분배금이 반영되지 않은 종가를 쓰면 가격 수익률과 분배금 재투자 수익률은 달라질 수 있습니다.
