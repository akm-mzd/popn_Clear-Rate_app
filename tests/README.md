# 動作チェック

どれも Playwright（`require('playwright')`）で動かす。アプリは `python3 -m http.server ポート` で配信しておく。
クラウド（GAS）には一切つながない（外への通信は止めるか、テスト用の偽物に向ける）。

| ファイル | やること |
|---|---|
| `smoke.js` | 同じテストデータで、統計・表の文字・並び替え・絞り込みなどの中身を JSON で出す。`node tests/smoke.js 8765 > a.json` と、比べる版（例：main を別のポートで配信）の出力を `cmp` で比べる |
| `screens.js` | 2つの版で、リスト・難易度表・メダル表・スコア表・ポックラ・ノック表のスクリーンショットが1画素も違わないか（`node tests/screens.js 8765 8766`）。ファイルを分けるなど、見た目を変えない作業の確認に使う |
| `data-safety.js` | `gas/Code.gs` を Node で動かし（`gasmock.js` が Google のサービスの代わり）、アプリとつないで、楽曲リストの「変わった所だけ」の保存・見張り・古い GAS のときの前のやり方・前の状態に戻す・保存の記録を確かめる（`node tests/data-safety.js 8765`） |

Chromium の場所を指定するときは `CHROMIUM_PATH=/path/to/chromium` を付ける。
