# 국내 ETF 분석

국내 상장 ETF의 일별 종가와 거래량을 같은 거래일에 맞춰 비교합니다. 일평균 거래량, 기간 가격 수익률, 연환산 변동성을 계산합니다.

## ETF 시세 대시보드

[dashboard.html](dashboard.html)을 브라우저에서 열면 ETF를 운용사·시장·상품 유형별로 조회할 수 있습니다. 종목명이나 코드로 검색하고, 현재 필터에 해당하는 ETF의 거래량과 등락률을 비교할 수 있습니다. 처음에는 **합성 데이터**가 표시됩니다.

데이터를 교체하려면 사용 허가를 받은 JSON 파일을 가져오거나, 브라우저의 교차 출처 요청을 허용하는 HTTPS 데이터 주소(CORS)를 연결하세요. 연결 중에는 60초마다 새 데이터를 조회합니다. 화면의 시세 기준 시각은 데이터가 제공한 `asOf`이며, 새로고침 간격과 실제 시세의 갱신 주기는 다를 수 있습니다. 네이버페이 증권은 시세를 외부 웹페이지나 프로그램에서 가공해 사용하는 것을 제한합니다. [네이버페이 증권 API 이용 안내](https://help.pay.naver.com/faq/content.help?faqId=17106)

파일을 직접 열었을 때 브라우저가 데이터 연결을 막으면 프로젝트 폴더에서 다음 명령을 실행하고 [로컬 대시보드](http://127.0.0.1:8765/dashboard.html)를 여세요.

```powershell
./.uv/Scripts/python.exe -m http.server 8765 --bind 127.0.0.1
```

파일과 데이터 응답은 아래와 같은 JSON 형식을 사용합니다. 예시 값은 합성 데이터입니다.

```json
{
  "asOf": "2026-11-17T15:30:00+09:00",
  "source": "예시 데이터",
  "rows": [
    {
      "code": "SMP001",
      "name": "예시 코리아 100 ETF",
      "manager": "예시자산운용",
      "market": "국내 주식",
      "product": "대표지수",
      "price": 12500,
      "change": 1.25,
      "volume": 100000,
      "tradingValue": 1250000000,
      "nav": null
    }
  ]
}
```

`asOf`에는 시간대를 포함한 ISO 8601 시각을, `code`에는 앞자리 0을 유지한 영문·숫자 6자리 문자열을 넣습니다. `price`·`tradingValue`·`nav`는 원, `volume`은 주 단위입니다. `change`의 `1.25`는 `+1.25%`를 뜻합니다. 거래대금이나 NAV를 제공하지 않는 경우 해당 값은 `null`로 둘 수 있습니다.

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
